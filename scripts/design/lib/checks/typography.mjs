/**
 * typography.mjs — 조판 검사
 *
 * 기준은 내 취향이 아니라 이 저장소의 `references/typography.md`다. 그 문서가 정한
 * 것만 검사하고, 판정할 때 몇 장 몇 절인지 함께 말한다. 근거를 못 대는 검사는
 * 넣지 않았다 — 검사기가 스스로 미감을 주장하기 시작하면 아무도 신뢰하지 않는다.
 *
 * 검사하지 않는 것과 그 이유:
 *   · 금칙 처리(줄 첫머리 마침표) — IR만으로는 줄바꿈 위치를 알 수 없다. 렌더러가
 *     `line-break: strict`로 처리하고, 여기서는 그 선언이 나가는지를 보증한다.
 *   · 표점 압축(halt/palt) — 실제 글꼴의 지원 여부에 달려 있어 파일만 보고 판정할 수 없다.
 */

import { loadArtifactIr } from '../project.mjs';
import { iterBlocks } from './structure.mjs';
import { isCjkLang, hasCjk, defaultLineHeight, defaultTracking, bodyBaseline, charWidth } from '../render/shared.mjs';

export const id = 'typography';
export const title = '조판 · 다국어';

/** 총칭 계열. 스택이 여기서 끝나야 글꼴이 하나도 없을 때의 모습이 정의된다. */
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded']);

/** CJK 자형을 담고 있는 글꼴들. 없으면 한글·한자가 시스템 기본으로 떨어진다. */
const CJK_FONT = /noto (sans|serif) (kr|sc|tc|jp|hk|cjk)|pretendard|apple ?sd ?gothic|nanum|spoqa|malgun|맑은 고딕|pingfang|hiragino|yu gothic|ms gothic|meiryo|source han|시위안|샤우|원카이|더이헤이|smiley sans|glow sans|songti|simsun|microsoft yahei|마이크로소프트 야헤이|noto sans cjk|ibm plex sans kr|gothic a1|이스톤|sunflower|black han sans/i;

/**
 * references/typography.md 3장 「이미 남용된 목록」 + content-guidelines.md 「글꼴 함정」.
 * display 자리에 쓰였을 때만 문제다 — Inter는 14-16px 본문에서는 정확한 용법이다.
 */
const OVERUSED_DISPLAY = [
  { re: /^inter$/i, why: 'Inter는 UI 작은 글자용으로 설계돼 큰 글자에서 표정이 없습니다', alt: 'Archivo · Anton · Schibsted Grotesk' },
  { re: /^fraunces$/i, why: '2023-2025 AI 디자인 도구의 기본 "고급스러운" 선택지였습니다', alt: 'Newsreader · Libre Caslon Text' },
  { re: /^space grotesk$/i, why: '"기술적인 느낌"의 게으른 답으로 과포화됐습니다', alt: 'Schibsted Grotesk · Familjen Grotesk' },
  { re: /^playfair display$/i, why: '"우아함"의 게으른 답 — 청첩장 인상이 강합니다', alt: 'Cormorant · DM Serif Display' },
  { re: /^(roboto|arial|helvetica( neue)?)$/i, why: '시스템 기본에 가까워 디자인 판단이 드러나지 않습니다', alt: 'references/typography.md 3장 배합표' },
];

export function run(ctx) {
  const findings = [];
  const lang = ctx.manifest.brief?.language || 'ko';
  const typo = ctx.manifest.brand?.tokens?.typography || {};

  // 산출물을 한 번 훑어 실제로 한글·한자가 쓰였는지 본다. 글꼴 사슬이 CJK를 받쳐야
  // 하는지는 선언한 언어가 아니라 화면에 나올 글자가 정한다 — lang이 잘못 적혀 있어도
  // 한글이 시스템 기본으로 떨어지는 사고는 똑같이 일어난다.
  const irs = [];
  let contentCjk = false;
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;
    irs.push({ artRef, ir });
    for (const { block } of iterBlocks(ir)) {
      const text = block.kind === 'bullets' ? (block.items || []).join('') : block.text || '';
      if (hasCjk(text)) contentCjk = true;
    }
  }
  const cjk = isCjkLang(lang) || contentCjk;

  findings.push(...checkFontStacks(typo, lang, cjk));
  findings.push(...checkScale(typo));

  for (const { artRef, ir } of irs) {
    for (const { block, where } of iterBlocks(ir)) {
      findings.push(...checkBlock(block, `${artRef.id} → ${where}`, { typo, cjk, type: artRef.type, baseline: bodyBaseline(artRef.type) }));
    }
  }

  return findings;
}

/* ── 글꼴 스택 (4.2절) ────────────────────────────────────────── */

function checkFontStacks(typo, lang, cjk) {
  const findings = [];
  for (const role of ['display', 'body', 'mono']) {
    const spec = typo[role];
    if (!spec) continue;
    const where = `brand.tokens.typography.${role}`;
    const stack = [spec.family, ...(spec.fallback || [])];
    const last = String(stack[stack.length - 1] || '').toLowerCase();

    if (!GENERIC.has(last)) {
      findings.push({
        check: 'type.genericFallback',
        level: 'warn',
        where,
        message: `폴백 사슬이 총칭 계열(sans-serif 등)로 끝나지 않습니다. 지정한 글꼴이 하나도 없는 환경에서 무엇이 나올지 정의되지 않습니다.`,
      });
    }

    if (GENERIC.has(String(spec.family || '').toLowerCase())) {
      findings.push({
        check: 'type.systemOnly',
        level: 'warn',
        where,
        message: `본문 글꼴이 '${spec.family}' 하나뿐입니다. 윈도우는 맑은 고딕, macOS는 애플 SD 고딕으로 떨어져 같은 페이지가 기기마다 다른 얼굴이 됩니다 (typography.md 5장 반패턴).`,
      });
    }

    if (cjk && role !== 'mono') {
      if (!stack.some((f) => CJK_FONT.test(String(f)))) {
        findings.push({
          check: 'type.cjkFallback',
          level: 'warn',
          where,
          message: `언어가 ${lang}인데 스택에 CJK 자형을 가진 글꼴이 없습니다: ${stack.join(', ')}. 한글·한자가 시스템 기본으로 떨어집니다.`,
        });
      }
      // 라틴 전용 글꼴이 CJK 글꼴보다 뒤에 있으면 영영 차례가 오지 않는다
      const firstCjk = stack.findIndex((f) => CJK_FONT.test(String(f)));
      const lastLatinOnly = stack.reduce(
        (acc, f, i) => (!CJK_FONT.test(String(f)) && !GENERIC.has(String(f).toLowerCase()) ? i : acc),
        -1
      );
      if (firstCjk >= 0 && lastLatinOnly > firstCjk) {
        findings.push({
          check: 'type.latinFirst',
          level: 'warn',
          where,
          message: `'${stack[lastLatinOnly]}'가 CJK 글꼴 '${stack[firstCjk]}'보다 뒤에 있습니다. font-family는 글자 단위로 맞춰 나가므로 라틴 문자와 숫자를 앞의 CJK 글꼴이 먼저 가져갑니다 — 뒤의 서양 글꼴은 출전 기회가 없습니다 (typography.md 4.2).`,
        });
      }
    }

    if (role === 'display') {
      const bad = OVERUSED_DISPLAY.find((o) => o.re.test(String(spec.family || '').trim()));
      if (bad) {
        findings.push({
          check: 'type.overusedFont',
          level: 'warn',
          where,
          message: `display에 '${spec.family}' — ${bad.why}. 대안: ${bad.alt} (typography.md 3장).`,
        });
      }
    }
  }
  return findings;
}

/* ── 음계 (1장) ───────────────────────────────────────────────── */

function checkScale(typo) {
  const findings = [];
  const scale = [...(typo.scale || [])].sort((a, b) => a - b);
  if (scale.length < 2) return findings;

  if (scale.length > 7) {
    findings.push({
      check: 'type.scaleSteps',
      level: 'warn',
      where: 'brand.tokens.typography.scale',
      message: `${scale.length}단 — 층위가 많을수록 각 층위의 값이 떨어집니다. 6단 안쪽으로 줄이세요 (typography.md 1장·5장).`,
    });
  }

  const ratios = scale.slice(1).map((v, i) => v / scale[i]);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  if (max / min > 2.2) {
    findings.push({
      check: 'type.scaleRatio',
      level: 'warn',
      where: 'brand.tokens.typography.scale',
      message: `인접 비율이 ${min.toFixed(2)}배에서 ${max.toFixed(2)}배까지 벌어집니다. 음계는 고정 비율을 곱해 만드는 것이지 눈대중으로 고른 숫자 목록이 아닙니다 (typography.md 1장).`,
    });
  }
  return findings;
}

/* ── 블록 단위 ────────────────────────────────────────────────── */

const TEXTUAL = ['heading', 'subheading', 'body', 'bullets', 'quote', 'caption', 'kpi'];

function checkBlock(block, where, { typo, cjk, type, baseline }) {
  const findings = [];
  if (!TEXTUAL.includes(block.kind)) return findings;
  const s = block.style || {};
  const size = s.fontSize;
  const text = block.kind === 'bullets' ? (block.items || []).join(' ') : block.text || '';
  // 언어 선언이 아니라 실제 글자로 판단한다. ko 프로젝트 안의 영문 인용은 서문 규칙을 따른다.
  const wide = hasCjk(text) || (cjk && !text);

  /* 합성 굵게 (4.3절) — 토큰이 갖고 있지 않은 굵기를 쓰면 브라우저가 획을 부풀린다.
     렌더러가 font-synthesis: none을 켜므로, 없는 굵기는 굵어지지 않고 그냥 무시된다. */
  const role = s.fontRole || 'body';
  const weights = typo[role]?.weights;
  if (s.weight && Array.isArray(weights) && weights.length > 0 && !weights.includes(s.weight)) {
    findings.push({
      check: 'type.weightSynthesis',
      level: 'warn',
      where,
      message: `굵기 ${s.weight}를 쓰는데 ${role} 글꼴은 ${weights.join('·')}만 싣습니다. 렌더러가 합성 굵게를 막으므로 이 강조는 화면에 나타나지 않습니다.`,
    });
  }

  /* 자간 (4.5절) */
  if (s.letterSpacing !== undefined) {
    const ls = s.letterSpacing;
    if (wide && ls < -0.02) {
      findings.push({
        check: 'type.tracking',
        level: 'error',
        where,
        message: `한글·한자에 자간 ${ls}em — 네모틀 글자는 자면이 꽉 차 있어 음수 자간이 곧 획 충돌입니다. 60px 이상 대자에서 -0.02em이 한계입니다 (typography.md 4.5).`,
      });
    } else if (wide && ls < 0 && (size || 16) < 60) {
      findings.push({
        check: 'type.tracking',
        level: 'warn',
        where,
        message: `${size || 16}px 한글에 자간 ${ls}em — 60px 미만에서는 0이 기준입니다 (typography.md 4.5).`,
      });
    } else if (wide && ['body', 'bullets', 'quote'].includes(block.kind) && ls > 0.05) {
      findings.push({
        check: 'type.tracking',
        level: 'warn',
        where,
        message: `본문 자간 ${ls}em — 0.05em을 넘으면 낱말의 덩어리가 흩어져 읽는 속도가 떨어집니다 (typography.md 4.5).`,
      });
    }
  }

  /* 행간 (2장) */
  if (s.lineHeight !== undefined && size) {
    const base = defaultLineHeight(block.kind, size, wide, baseline);
    const [lo, hi] = wide ? [base - 0.25, base + 0.35] : [base - 0.2, base + 0.3];
    if (s.lineHeight < lo) {
      findings.push({
        check: 'type.lineHeight',
        level: 'warn',
        where,
        message: `행간 ${s.lineHeight} — ${wide ? '한글·한자' : '서문'} ${size}px 기준 ${lo.toFixed(2)} 이상을 권합니다. ${
          wide ? '네모틀 글자는 서문 소문자 사이의 틈이 없어 행간이 모자라면 줄이 뭉갭니다' : '행이 길수록 되돌아올 궤도가 필요합니다'
        } (typography.md 2장).`,
      });
    } else if (s.lineHeight > hi) {
      findings.push({
        check: 'type.lineHeight',
        level: 'warn',
        where,
        message: `행간 ${s.lineHeight} — ${hi.toFixed(2)}를 넘으면 줄들이 한 덩어리로 묶이지 않고 흩어집니다 (typography.md 2장).`,
      });
    }
  }

  /* 행장 (2장) — 상자 폭과 글자 크기에서 한 줄 글자수를 역산한다 */
  if (block.box && size && text) {
    const unit = charWidth(wide ? '가' : 'n', size);
    const perLine = Math.floor(block.box.w / unit);
    const totalChars = [...String(text)].length;
    const wraps = totalChars > perLine; // 한 줄에 끝나면 행장은 문제가 아니다
    const [lo, hi] = wide ? [12, 40] : [30, 80];
    if (wraps && ['body', 'bullets', 'quote'].includes(block.kind)) {
      if (perLine > hi) {
        findings.push({
          check: 'type.measure',
          level: 'warn',
          where,
          message: `한 줄에 약 ${perLine}자 — ${wide ? '한글은 22~38자' : '서문은 45~75자'}가 편한 구간입니다. 행이 길면 줄을 바꿀 때 다음 줄 첫머리를 놓칩니다 (typography.md 2장). 상자 폭을 줄이거나 글자를 키우세요.`,
        });
      } else if (perLine < lo) {
        findings.push({
          check: 'type.measure',
          level: 'warn',
          where,
          message: `한 줄에 약 ${perLine}자밖에 들어가지 않습니다. 눈이 계속 되돌아와 읽는 흐름이 끊깁니다 (typography.md 2장).`,
        });
      }
    }
  }

  /* 발표 자료 제목 크기 (content-guidelines.md Scale 규범) */
  if (type === 'deck' && block.kind === 'heading' && size && size < 48) {
    findings.push({
      check: 'type.headingSize',
      level: 'warn',
      where,
      message: `발표 슬라이드 제목 ${size}px — 1920×1080 기준 60~120px입니다. 뒷자리에서 읽히지 않습니다 (content-guidelines.md Scale 규범).`,
    });
  }

  /* 곧은 따옴표 — 글꼴이 아니라 문자 자체가 다르다 */
  if (/["']/.test(text) && block.kind !== 'code') {
    findings.push({
      check: 'type.quotes',
      level: 'warn',
      where,
      message: `곧은 따옴표(" 또는 ')가 있습니다. 조판용 따옴표(${wide ? '「」 · “ ” · ‘ ’' : '“ ” · ‘ ’'})로 바꾸세요 — 곧은 따옴표는 타자기의 흔적입니다.`,
    });
  }

  return findings;
}

/** 렌더러가 실제로 쓰는 기본값. 문서·테스트가 같은 값을 참조하도록 다시 내보낸다. */
export { defaultLineHeight, defaultTracking };
