/**
 * styles/extract.mjs — references/design-styles.md를 기계가 읽는 레지스트리로 옮긴다.
 *
 * 왜 손으로 JSON을 쓰지 않나: 스타일 60종의 정본은 이미 그 문서다. 메타데이터를 따로
 * 손으로 관리하면 둘이 반드시 갈라지고, 갈라진 뒤에는 어느 쪽이 맞는지 아무도 모른다.
 * **문서에서 뽑아낸다.** 문서를 고치면 레지스트리를 다시 만들면 되고, 문서에 없는 정보는
 * 레지스트리에도 없다.
 *
 * 문서 구조 (60개 항목이 전부 이 형태를 지킨다)
 *   ## <분류>스타일 라이브러리(20종)          ← 웹 · PPT · 인포그래픽
 *   #### <온도>파                  ← 대담 · 중립 · 차분
 *   **<이름>** `온도·재현NN%`
 *   - 참고: …    - 적합: …    - 비주얼DNA: …    - HTML 구현: …    - 폰트: …
 *
 * 형태가 깨지면 조용히 넘기지 않고 세어서 보고한다 — 문서가 바뀐 걸 알아야 하기 때문이다.
 */

const SECTIONS = {
  웹: { id: 'web', supports: ['html'], label: '웹' },
  웹: { id: 'web', supports: ['html'], label: '웹' },
  PPT: { id: 'deck', supports: ['deck'], label: '발표자료' },
  발표자료: { id: 'deck', supports: ['deck'], label: '발표자료' },
  인포그래픽: { id: 'infographic', supports: ['infographic', 'image'], label: '인포그래픽' },
  인포그래픽: { id: 'infographic', supports: ['infographic', 'image'], label: '인포그래픽' },
};

const TEMPERATURE = { 대담: 'bold', 대담: 'bold', Bold: 'bold', 중립: 'neutral', 중립: 'neutral', 중성: 'neutral', Neutral: 'neutral', 차분: 'quiet', 차분: 'quiet', Quiet: 'quiet' };
const TEMPERATURE_KO = { bold: '대담', neutral: '중성', quiet: '차분' };

const FIELDS = { 참고: 'references', 참고: 'references', 참조: 'references', 적합: 'audiences', 적합: 'audiences', 적용: 'audiences', 활용: 'audiences', 용도: 'audiences', 사용처: 'audiences', 적용처: 'audiences', '활용 분야': 'audiences', '적용 대상': 'audiences', '사용 분야': 'audiences', 대상: 'audiences', 비주얼DNA: 'dna', 비주얼DNA: 'dna', '비주얼 DNA': 'dna', '시각적 DNA': 'dna', '시각 DNA': 'dna', 특징: 'dna', 'HTML 구현': 'html', 'HTML 구현': 'html', 폰트: 'fonts', 폰트: 'fonts', 서체: 'fonts', 타이포그래피: 'fonts', 타입페이스: 'fonts' };

const ENTRY = /^\*\*(.+?)\*\*\s*`(\u5927\u80C6|\u4E2D\u6027|\u5B89\u9759|대담|중립|중성|차분|Bold|Neutral|Quiet)·(?:\u8FD8\u539F|재현)(\d+)%`\s*(.*)$/;
const SECTION = /^##\s+(\u7F51\u9875|웹|PPT|발표자료|\u4FE1\u606F\u56FE|인포그래픽)(?:\u98CE\u683C\u5E93| 스타일 라이브러리)/;
const GROUP = /^####\s+(\u5927\u80C6|중립|중성|\u5B89\u9759|대담|차분|Bold|Neutral|Quiet)(?:\u6D3E|파)?/;
const FIELD = /^-\s*([^:：]+)[:：]\s*(.+)$/;

function resolveField(label) {
  const normalized = String(label).trim();
  if (FIELDS[normalized]) return FIELDS[normalized];
  if (/(?:적합|적용|활용|사용).*(?:분야|대상|처|용도)?$/.test(normalized)) return 'audiences';
  if (/(?:폰트|글꼴|서체|타이포그래피|타입페이스)/.test(normalized)) return 'fonts';
  if (/(?:비주얼|시각적).*(?:DNA|특징)|특징/.test(normalized)) return 'dna';
  if (/(?:참고|참조)/.test(normalized)) return 'references';
  return null;
}

/** 이름에서 안정적인 슬러그를 만든다. 영문 부분이 있으면 그쪽을 쓴다. */
export function slugify(name) {
  // "미디어급 브루탈리즘 Editorial Brutalism（…）" → "editorial-brutalism"
  const stripped = name.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
  const latinRuns = stripped.match(/[A-Za-z][A-Za-z0-9''\-. /]*/g) || [];
  const base = (latinRuns.at(-1) || stripped).trim();
  const slug = base
    .toLowerCase()
    .replace(/[''.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

const HEX = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

/**
 * 문자열에서 hex 색을 모은다 (중복 제거, 등장 순서 유지).
 * 문서는 `순수 검정#000`처럼 3자리도 쓴다 — 6자리만 보면 배경색 절반을 놓친다.
 */
function hexes(text) {
  const out = [];
  for (const m of String(text).matchAll(HEX)) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const norm = `#${h.toUpperCase()}`;
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

/** 키워드 판정 전에 hex를 지운다. `#FF433D` 안의 "3D"가 3D 그래픽으로 읽히는 사고를 막는다. */
function withoutHex(text) {
  return String(text).replace(HEX, ' ');
}

/** 상대 휘도 — 배경이 밝은지 어두운지 판정용 */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * 밝은 화면인가 어두운 화면인가. 비주얼DNA의 "색상=…바닥" 부분에서 바닥색을 찾는다.
 * 못 찾으면 등장한 색 중 극단값(가장 밝은 것과 가장 어두운 것)으로 추정한다.
 */
/** hex가 없는 항목을 위한 낱말 근거. 문서가 색을 말로만 적은 경우가 절반 가까이 된다. */
const GROUND_WORDS = {
  dark: /\u9ED1\u5E95|\u6DF1\u8272\u5E95|\u6697\u5E95|\u8FD1\u9ED1|\u591C[\u95F4\u9593]|\u6DF1\u7A7A|\u6697\u573A|\u9ED1\u91D1|\u58A8\u8272\u5E95|\u71EB\u9ED1|\u5348\u591C|검은 배경|어두운 배경|다크 모드|짙은 배경|암전|심야/,
  light: /\u767D\u5E95|\u7C73\u8272|\u5976\u6CB9|\u7EB8[\u8D28\u611F\u767D]|\u6D45\u8272\u5E95|\u6696\u767D|\u8C61\u7259|\u6D45\u7070\u5E95|\u7559\u767D|흰 배경|화이트 배경|밝은 배경|아이보리|크림|여백/,
  mixed: /\u6EE1\u7248|\u649E\u8272|\u6F38\u53D8|duotone|\u53CD\u767D|\u9AD8\u5BF9\u6BD4|풀 블리드|대비색|그라데이션|고대비|반전/,
};

function contrastMode(dna) {
  const all = hexes(dna);

  // 1순위: "…#0A0A0A바닥"처럼 바닥/배경 바로 앞에 오는 색이 바닥색이다
  const bgMatch = String(dna).match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])\s*[)）]?\s*(?:\u5E95|\u80CC\u666F)/);
  if (bgMatch) {
    const h = bgMatch[1].length === 3 ? bgMatch[1].split('').map((c) => c + c).join('') : bgMatch[1];
    return luminance(`#${h}`) < 0.25 ? 'dark' : 'light';
  }

  // 2순위: 등장한 색의 극단값
  if (all.length > 0) {
    const lums = all.map(luminance);
    const hasDark = lums.some((l) => l < 0.12);
    const hasLight = lums.some((l) => l > 0.75);
    // 검정과 흰색이 함께 나오면 고대비 흑백 — 어느 한쪽으로 부르면 검색이 어긋난다
    if (hasDark && hasLight) return 'mixed';
    if (hasDark) return 'dark';
    if (hasLight) return 'light';
    return 'mixed';
  }

  // 3순위: 낱말. hex를 아예 안 쓴 항목이 절반 가까이라 이게 없으면 검색이 반쪽이 된다.
  const t = withoutHex(dna);
  if (GROUND_WORDS.dark.test(t)) return 'dark';
  if (GROUND_WORDS.light.test(t)) return 'light';
  if (GROUND_WORDS.mixed.test(t)) return 'mixed';
  return 'unknown';
}

/** 움직임의 정도 — 문서가 말하는 구현 방식에서 읽는다 */
function motionLevel(text) {
  const t = withoutHex(text);
  if (/패럴랙스|스크롤 구동|scroll-driven|3D|WebGL|입자|프레임별|비디오 배경|패럴랙스|스크롤 구동|입자|프레임별|비디오 배경/.test(t)) return 'expressive';
  if (/애니메이션|animation|transition|hover|전환|페이드인|캐러셀|부유|애니메이션|전환|호버|페이드인|캐러셀|부유/.test(t)) return 'moderate';
  if (/애니메이션 없음|정적|움직임 없음/.test(t)) return 'none';
  return 'subtle';
}

/** 적합 필드를 쓸 만한 태그 배열로 자른다 */
function splitAudiences(text) {
  return String(text)
    .split(/[、,，/]/)
    .map((s) => s.trim().replace(/^(?:\u548C|및|와|과)\s*/, ''))
    .filter((s) => s.length > 0 && s.length < 40);
}

/** 폰트 필드에서 글꼴 이름만 뽑는다 */
function splitFonts(text) {
  const cleaned = String(text).replace(/（[^）]*）/g, ' ').replace(/\([^)]*\)/g, ' ');
  const names = cleaned.match(/[A-Z][A-Za-z0-9 ]{1,24}(?:Mono|Sans|Serif|Grotesk|Display|Text)?/g) || [];
  return [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 2 && !/^(HTML|CSS|SVG|API)$/i.test(n)))].slice(0, 8);
}

/**
 * 문서를 파싱한다.
 * 반환: { styles: [...], stats: { total, bySection, skipped: [문제 항목] } }
 */
export function extractStyles(markdown, { showcases = null } = {}) {
  const lines = String(markdown).split(/\r?\n/);
  const styles = [];
  const skipped = [];

  let section = null;
  let group = null;
  let current = null;

  const finish = () => {
    if (!current) return;
    const missing = [...new Set(Object.values(FIELDS))].filter((f) => !current.raw[f]);
    if (missing.length) {
      skipped.push({ name: current.name, reason: `필드 누락: ${missing.join(', ')}` });
      current = null;
      return;
    }
    const dna = current.raw.dna;
    const palette = hexes(dna);
    const slug = slugify(current.name);
    if (!slug) {
      skipped.push({ name: current.name, reason: '슬러그를 만들 수 없음 (영문 이름 없음)' });
      current = null;
      return;
    }

    styles.push({
      id: slug,
      name: current.name,
      section: section.id,
      supports: section.supports,
      temperature: current.temperature,
      temperatureKo: TEMPERATURE_KO[current.temperature],
      fidelity: current.fidelity,
      contrast: contrastMode(dna),
      motionLevel: motionLevel(`${dna} ${current.raw.html}`),
      audiences: splitAudiences(current.raw.audiences),
      palette,
      fonts: splitFonts(current.raw.fonts),
      references: current.raw.references,
      dna,
      html: current.raw.html,
      fontNote: current.raw.fonts,
      source: `references/design-styles.md#${slug}`,
      ...(showcases?.[slug] ? { preview: showcases[slug] } : {}),
    });
    current = null;
  };

  for (const line of lines) {
    const s = line.match(SECTION);
    if (s) { finish(); section = SECTIONS[s[1]]; group = null; continue; }

    const g = line.match(GROUP);
    if (g) { finish(); group = TEMPERATURE[g[1]]; continue; }

    const e = line.match(ENTRY);
    if (e) {
      finish();
      if (!section) { skipped.push({ name: e[1], reason: '분류 밖에 있는 항목' }); continue; }
      current = {
        name: e[1].trim(),
        temperature: TEMPERATURE[e[2]] || group,
        fidelity: Number(e[3]),
        raw: {},
      };
      const trailing = e[4].trim();
      const trailingField = trailing.match(FIELD);
      if (trailingField) {
        const key = resolveField(trailingField[1]);
        if (key) current.raw[key] = trailingField[2].trim();
      }
      continue;
    }

    if (current) {
      const f = line.match(FIELD);
      if (f) {
        const key = resolveField(f[1]);
        if (key) current.raw[key] = f[2].trim();
      } else if (line.trim() === '' && Object.keys(current.raw).length > 0) {
        finish();
      }
    }
  }
  finish();

  const bySection = {};
  for (const st of styles) bySection[st.section] = (bySection[st.section] || 0) + 1;

  return { styles, stats: { total: styles.length, bySection, skipped } };
}

/**
 * showcases/INDEX.md에서 미리보기 경로를 뽑는다.
 * 이 갤러리는 별도의 3종 체계(Pentagram·Build·Takram)이므로 스타일 60종과는 다른 축이다.
 */
export function extractShowcases(markdown) {
  const out = [];
  const rows = String(markdown).match(/^\|\s*\d+\s*\|.+\|$/gm) || [];
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 6) continue;
    const [, scene, spec, ...paths] = cells;
    const variants = {};
    ['pentagram', 'build', 'takram'].forEach((name, i) => {
      const p = (paths[i] || '').replace(/`/g, '').trim();
      if (p) variants[name] = `assets/showcases/${p}.png`;
    });
    if (Object.keys(variants).length) out.push({ scene, spec, variants });
  }
  return out;
}

export { SECTIONS, TEMPERATURE_KO };
