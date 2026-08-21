/**
 * a11y.mjs — 접근성 검사
 *
 * 대비는 design.mjs가 이미 본다. 여기서는 대비만으로는 잡히지 않는 것들을 본다:
 * 읽는 순서, 대체 텍스트의 내용, 소리에만 담긴 정보, 자막 속도, 움직임.
 *
 * 검사하지 않는 것과 그 이유:
 *   · 클릭 대상 44×44px — IR에 링크·버튼 종류가 없다. 없는 것을 검사하는 척하지 않는다.
 *   · 화면 낭독기 실제 낭독 순서 — DOM 순서로 근사할 뿐이며, 여기서는 그 DOM 순서와
 *     시각 순서가 어긋나는 경우만 잡는다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadArtifactIr } from '../project.mjs';
import { iterBlocks } from './structure.mjs';
import { isCjkLang, hasCjk } from '../render/shared.mjs';

export const id = 'a11y';
export const title = '접근성';

/** 대체 텍스트 자리에 놓이지만 아무것도 설명하지 않는 말들. */
const EMPTY_ALT = /^(이미지|사진|그림|아이콘|로고|image|img|photo|picture|icon|logo|graphic|illustration|placeholder|무제|untitled)[\s.]*$/i;

/** 자막이 읽히는 속도의 상한. 초당 글자수. */
const CPS_LIMIT = { cjk: 9, latin: 20 };

export function run(ctx) {
  const findings = [];
  const brief = ctx.manifest.brief || {};
  const lang = brief.language;
  const assetById = new Map((ctx.manifest.assets || []).map((a) => [a.id, a]));

  if (!lang) {
    findings.push({
      check: 'a11y.lang',
      level: 'error',
      where: 'brief.language',
      message: '언어 선언이 없습니다. <html lang>이 비면 화면 낭독기가 어느 언어의 발음 규칙으로 읽을지 정하지 못합니다.',
    });
  }
  // 형식(BCP 47)은 스키마가 이미 강제한다. 여기서는 스키마가 볼 수 없는 것을 본다 —
  // 선언한 언어와 실제로 적힌 글자가 같은 언어인가. lang="en"에 한글이 들어 있으면
  // 낭독기가 한글을 영어 발음 규칙으로 읽으려 들고, 결과는 아무도 알아들을 수 없다.
  findings.push(...checkLangMatch(ctx, lang));

  const motion = ctx.manifest.brand?.tokens?.motion;
  if (motion && motion.level && motion.level !== 'none') {
    const slow = motion.durationMs?.slow ?? 0;
    if (motion.level === 'expressive' && slow > 800) {
      findings.push({
        check: 'a11y.motion',
        level: 'warn',
        where: 'brand.tokens.motion',
        message: `움직임 강도 expressive에 slow=${slow}ms — 전정 장애가 있는 사람에게 큰 화면 이동은 증상을 일으킵니다. 렌더러가 prefers-reduced-motion을 처리하지만, 정보가 움직임에만 담기면 그 사용자에게는 정보가 사라집니다.`,
      });
    }
  }

  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;

    findings.push(...checkAlt(ir, artRef, assetById));
    findings.push(...checkHeadings(ir, artRef));
    findings.push(...checkReadingOrder(ir, artRef));
    if (ir.type === 'video') findings.push(...checkVideoA11y(ctx, ir, artRef, lang));
  }

  return findings;
}

/* ── 대체 텍스트의 내용 ───────────────────────────────────────── */

function checkAlt(ir, artRef, assetById) {
  const findings = [];
  for (const { block, where } of iterBlocks(ir)) {
    const at = `${artRef.id} → ${where}`;
    if (['image', 'logo'].includes(block.kind)) {
      const alt = block.alt || (block.assetId ? assetById.get(block.assetId)?.alt : null);
      if (!alt) continue; // 없는 것은 design.mjs의 a11y.alt.block이 잡는다
      if (EMPTY_ALT.test(alt)) {
        findings.push({
          check: 'a11y.altQuality',
          level: 'warn',
          where: at,
          message: `대체 텍스트가 '${alt}' — 종류만 말하고 내용을 말하지 않습니다. 이 이미지가 없을 때 독자가 잃는 것을 적으세요.`,
        });
      } else if (/\.(png|jpe?g|svg|gif|webp|avif)$/i.test(alt.trim())) {
        findings.push({
          check: 'a11y.altQuality',
          level: 'warn',
          where: at,
          message: `대체 텍스트가 파일 이름입니다: ${alt}`,
        });
      } else if ([...alt].length > 200) {
        findings.push({
          check: 'a11y.altQuality',
          level: 'warn',
          where: at,
          message: `대체 텍스트가 ${[...alt].length}자입니다. 200자를 넘으면 본문으로 옮기고 alt에는 요약만 두세요.`,
        });
      }
    } else if (['shape', 'spacer'].includes(block.kind) && block.alt) {
      findings.push({
        check: 'a11y.decorativeAlt',
        level: 'warn',
        where: at,
        message: '장식 도형에 대체 텍스트가 붙어 있습니다. 낭독기가 의미 없는 말을 읽습니다 — 지우면 aria-hidden으로 나갑니다.',
      });
    }
  }
  return findings;
}

/* ── 제목 층위 ────────────────────────────────────────────────── */

function checkHeadings(ir, artRef) {
  const findings = [];
  const containers = [];
  for (const page of ir.pages || []) {
    containers.push({ id: `pages.${page.id}`, blocks: (page.sections || []).flatMap((s) => s.blocks || []) });
  }
  for (const slide of ir.slides || []) containers.push({ id: `slides.${slide.id}`, blocks: slide.blocks || [] });

  for (const container of containers) {
    const kinds = container.blocks.map((b) => b.kind);
    const hasText = kinds.some((k) => ['body', 'bullets', 'quote', 'kpi'].includes(k));
    const firstH1 = kinds.indexOf('heading');
    const firstH2 = kinds.indexOf('subheading');

    if (hasText && firstH1 === -1 && firstH2 === -1) {
      findings.push({
        check: 'a11y.headingMissing',
        level: 'warn',
        where: `${artRef.id} → ${container.id}`,
        message: '본문은 있는데 제목 블록이 없습니다. 낭독기 사용자는 제목 목록으로 문서를 훑습니다 — 제목이 없으면 처음부터 끝까지 듣는 수밖에 없습니다.',
      });
    }
    if (firstH2 !== -1 && firstH1 !== -1 && firstH2 < firstH1) {
      findings.push({
        check: 'a11y.headingOrder',
        level: 'warn',
        where: `${artRef.id} → ${container.id}`,
        message: 'h2(subheading)가 h1(heading)보다 먼저 나옵니다. 층위를 건너뛰면 문서 구조가 잘못 전달됩니다.',
      });
    }
    if (kinds.filter((k) => k === 'heading').length > 1) {
      findings.push({
        check: 'a11y.headingOrder',
        level: 'warn',
        where: `${artRef.id} → ${container.id}`,
        message: `heading 블록이 ${kinds.filter((k) => k === 'heading').length}개입니다. 렌더러는 heading을 h1으로 냅니다 — 한 화면에 h1이 여럿이면 무엇이 주제인지 알 수 없습니다.`,
      });
    }
  }
  return findings;
}

/* ── 읽는 순서 ────────────────────────────────────────────────── */

/**
 * 절대 배치에서는 IR의 배열 순서가 곧 DOM 순서이고, 화면 위치와는 무관하다.
 * 눈으로는 위에서 아래로 읽히는데 낭독기·탭 이동은 배열 순서를 따라가면 둘이 어긋난다.
 */
function checkReadingOrder(ir, artRef) {
  const findings = [];
  const groups = [];
  for (const page of ir.pages || []) {
    for (const section of page.sections || []) groups.push({ id: `pages.${page.id}.${section.id}`, blocks: section.blocks || [] });
  }
  for (const slide of ir.slides || []) groups.push({ id: `slides.${slide.id}`, blocks: slide.blocks || [] });

  for (const group of groups) {
    const boxed = group.blocks.filter((b) => b.box && !['shape', 'spacer'].includes(b.kind));
    if (boxed.length < 2) continue;

    // 시각 순서: 행이 겹치면 같은 줄로 보고 x로, 아니면 y로
    const rowTol = 0.5;
    const visual = [...boxed].sort((a, b) => {
      const sameRow = Math.abs(a.box.y - b.box.y) < Math.min(a.box.h, b.box.h) * rowTol;
      return sameRow ? a.box.x - b.box.x : a.box.y - b.box.y;
    });

    const swapped = [];
    for (let i = 0; i < boxed.length; i += 1) {
      if (visual[i].id !== boxed[i].id) swapped.push(`${i + 1}번째: 눈은 ${visual[i].id}, 낭독은 ${boxed[i].id}`);
    }
    if (swapped.length > 0) {
      findings.push({
        check: 'a11y.readingOrder',
        level: 'warn',
        where: `${artRef.id} → ${group.id}`,
        message: `시각 순서와 배열 순서가 어긋납니다 (${swapped[0]}${swapped.length > 1 ? ` 외 ${swapped.length - 1}건` : ''}). 낭독기와 탭 이동은 배열 순서를 따릅니다 — 블록 순서를 화면 순서에 맞추세요.`,
      });
    }
  }
  return findings;
}

/* ── 영상 ─────────────────────────────────────────────────────── */

function checkVideoA11y(ctx, ir, artRef, lang) {
  const findings = [];
  const scenes = ir.scenes || [];
  const hasVoice = Boolean(ir.audio?.voiceover);
  const srt = ir.captions?.srt;
  const anySubtitle = scenes.some((s) => s.subtitle);

  if (hasVoice && !srt && !anySubtitle) {
    findings.push({
      check: 'a11y.captions',
      level: 'error',
      where: `${artRef.id} → audio.voiceover`,
      message: '보이스오버가 있는데 자막도 장면 자막도 없습니다. 소리에만 담긴 정보는 듣지 못하는 사람에게 존재하지 않습니다.',
    });
  }
  if (srt && !fs.existsSync(path.resolve(ctx.dir, srt))) return findings; // captions.missing이 이미 잡는다

  for (const scene of scenes) {
    if (!scene.subtitle || !scene.durationMs) continue;
    const chars = [...String(scene.subtitle).replace(/\s+/g, '')].length;
    const wide = hasCjk(scene.subtitle) || isCjkLang(lang);
    const limit = wide ? CPS_LIMIT.cjk : CPS_LIMIT.latin;
    const cps = chars / (scene.durationMs / 1000);
    if (cps > limit) {
      findings.push({
        check: 'a11y.subtitleRate',
        level: 'warn',
        where: `${artRef.id} → scenes.${scene.id}`,
        message: `자막이 초당 ${cps.toFixed(1)}자로 흘러갑니다 (${wide ? '한글·한자' : '서문'} 상한 ${limit}자). 장면을 늘리거나 문장을 줄이세요.`,
      });
    }
  }
  return findings;
}

/* ── 선언한 언어 대 실제 글자 ─────────────────────────────────── */

function checkLangMatch(ctx, lang) {
  if (!lang) return [];
  let cjkChars = 0;
  let latinChars = 0;
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;
    for (const { block } of iterBlocks(ir)) {
      const text = block.kind === 'bullets' ? (block.items || []).join('') : block.text || '';
      for (const ch of String(text)) {
        if (hasCjk(ch)) cjkChars += 1;
        else if (/[A-Za-z]/.test(ch)) latinChars += 1;
      }
    }
  }
  const total = cjkChars + latinChars;
  if (total < 40) return []; // 표본이 적으면 판정하지 않는다

  const declaredCjk = isCjkLang(lang);
  const ratio = cjkChars / total;
  if (!declaredCjk && ratio > 0.3) {
    return [{
      check: 'a11y.langMismatch',
      level: 'warn',
      where: 'brief.language',
      message: `언어를 '${lang}'으로 선언했는데 본문 글자의 ${Math.round(ratio * 100)}%가 한글·한자입니다. <html lang="${lang}">을 본 낭독기는 이 글자들을 ${lang} 발음 규칙으로 읽으려 합니다.`,
    }];
  }
  if (declaredCjk && ratio < 0.05) {
    return [{
      check: 'a11y.langMismatch',
      level: 'warn',
      where: 'brief.language',
      message: `언어를 '${lang}'으로 선언했는데 본문에 한글·한자가 거의 없습니다(${cjkChars}자). 실제 언어로 바꾸면 낭독·줄바꿈·글꼴 규칙이 모두 맞아 들어갑니다.`,
    }];
  }
  return [];
}
