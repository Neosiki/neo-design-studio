/**
 * render/shared.mjs — 렌더 계열이 공유하는 아주 작은 도구들
 *
 * 왜 따로 뺐나: 이 모듈들은 Studio 편집기를 위해 브라우저용 한 덩어리로 이어 붙는다.
 * 각 파일이 자기만의 `esc`, `round`를 두면 이어 붙일 때 이름이 충돌한다
 * (실제로 충돌해서 편집기가 통째로 죽었다). 공유 도구는 한 곳에만 둔다.
 *
 * bundle.mjs가 최상위 이름 충돌을 검사해 이 규칙을 강제한다.
 */

/** HTML 속성·본문 이스케이프 */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** IR 안의 명시적 줄바꿈(\n)은 의도된 조판이다. <br>로 살린다. */
export const escLines = (s) => esc(s).replace(/\r?\n/g, '<br>');

/** SVG·CSS 좌표를 소수 셋째 자리에서 끊는다. 렌더 결정론을 위해 자릿수를 고정한다. */
export const round3 = (n) => Math.round(n * 1000) / 1000;

/** 소수 둘째 자리 */
export const round2 = (n) => Math.round(n * 100) / 100;

/** 글자 하나의 대략적인 폭. 한글·한자·가나는 전각으로 본다. */
export function charWidth(ch, size) {
  const code = ch.codePointAt(0);
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60);
  return wide ? size : size * 0.52;
}

/** 문자열의 추정 렌더 폭. 브라우저 측정에 의존하지 않아야 결과가 재현된다. */
export function estWidth(s, size) {
  return [...String(s)].reduce((n, ch) => n + charWidth(ch, size), 0);
}

/* ── 조판 기준값 ────────────────────────────────────────────────
 *
 * references/typography.md 2장·4장이 정한 값을 한 곳에 둔다. 렌더러가 CSS로 쓰고,
 * 검사기가 같은 값으로 판정하고, 넘침 추정도 같은 값을 쓴다. 세 곳에 따로 적으면
 * 렌더 결과와 검사 기준이 조용히 갈라진다.
 */

/** 한글·한자·가나를 쓰는 언어인가. 문서가 정한 행간·자간 기준이 갈리는 축이다. */
export function isCjkLang(lang) {
  return /^(ko|ja|zh)/i.test(String(lang || ''));
}

/** 문자열 안에 전각 문자가 있는가 (언어 선언과 무관하게 실제 내용으로 판단). */
export function hasCjk(s) {
  return /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff]/.test(String(s || ''));
}

/**
 * 산출물 종류별 "일반적인" 본문 크기.
 *
 * 최소 허용치가 아니라 실제로 쓰이는 크기다 (content-guidelines.md Scale 규범:
 * 웹 16-18px · 슬라이드 28-36px · 영상은 더 크다). "큰 글자"는 절대 픽셀이 아니라
 * 그 매체의 본문 대비로 정해지기 때문에, 이 값이 없으면 슬라이드의 36px 불릿과
 * 웹의 36px 표제를 똑같이 판정하게 된다.
 */
export function bodyBaseline(type) {
  if (type === 'video') return 36;
  if (type === 'deck') return 30;
  return 17;
}

/**
 * 본문의 2.2배를 넘으면 층위가 아니라 판면 요소 — display로 본다.
 * 40px 바닥을 두는 이유: 웹에서 37px짜리를 대자로 취급하면 행간이 지나치게 조인다.
 */
function isDisplaySize(fontSize, baseline) {
  return fontSize >= Math.max(40, baseline * 2.2);
}

/**
 * 역할·크기·언어별 기본 행간.
 *
 * typography.md 2장: 중문·한글은 서문보다 0.2 정도 높다. 한자·한글은 꽉 찬 네모라
 * 서문 소문자 사이의 자연스러운 틈이 없어서, 행간이 모자라면 줄이 뭉개진다.
 * 크기가 종류를 이긴다 — 96px짜리 body 블록은 문단이 아니라 대자다.
 */
export function defaultLineHeight(kind, fontSize, cjk, baseline = 16) {
  if (isDisplaySize(fontSize, baseline)) return cjk ? 1.2 : 1.05;
  if (kind === 'heading' || kind === 'subheading' || kind === 'kpi') return cjk ? 1.35 : 1.2;
  if (kind === 'caption') return cjk ? 1.6 : 1.45;
  return cjk ? 1.7 : 1.5;
}

/**
 * 역할·크기·언어별 자간.
 *
 * typography.md 4.5: 한글·한자는 표제에서 0, 대자에서만 -0.02em까지. 서문의
 * "display는 -0.05em으로 조인다"를 그대로 가져오면 획이 붙어 버린다.
 */
export function defaultTracking(kind, fontSize, cjk, baseline = 16) {
  const title = kind === 'heading' || kind === 'subheading' || isDisplaySize(fontSize, baseline);
  if (!title) return 0;
  if (cjk) return isDisplaySize(fontSize, baseline) ? -0.02 : 0;
  return -0.02;
}
