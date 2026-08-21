/**
 * render/core.mjs — 순수 렌더 코어 (Node API 없음)
 *
 * 이 파일이 Node 전용 API를 쓰지 않는 이유는 하나다. **Studio 편집기가 브라우저에서
 * 같은 코드로 다시 렌더링해야 하기 때문이다.** 편집기가 별도의 미리보기 렌더러를 갖는
 * 순간 "화면에서 본 것"과 "파일로 나온 것"이 갈라진다 — 로드맵이 편집기를 IR 뒤에
 * 두라고 한 이유가 그것이다.
 *
 * 파일 쓰기는 render/html.mjs가 맡는다.
 */

import { renderWhiteboardLayer, WHITEBOARD_RUNTIME } from './whiteboard.mjs';
import { esc, escLines, isCjkLang, defaultLineHeight, defaultTracking, bodyBaseline } from './shared.mjs';


const DEFAULT_CANVAS = { width: 1920, height: 1080 };

function mergeTokens(base, overrides) {
  if (!overrides) return base;
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const [group, values] of Object.entries(overrides)) {
    out[group] = { ...(out[group] || {}), ...values };
  }
  return out;
}

function cssVars(tokens) {
  const lines = [];
  for (const [key, value] of Object.entries(tokens.color || {})) {
    lines.push(`    --c-${key}: ${value};`);
  }
  const typo = tokens.typography || {};
  for (const role of ['display', 'body', 'mono']) {
    const spec = typo[role];
    if (!spec) continue;
    const stack = [spec.family, ...(spec.fallback || [])].map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ');
    lines.push(`    --f-${role}: ${stack};`);
  }
  const scale = typo.scale || [];
  scale.forEach((size, i) => lines.push(`    --t-${i}: ${size}px;`));
  lines.push(`    --sp: ${tokens.spacing?.unit ?? 8}px;`);
  for (const [key, value] of Object.entries(tokens.radius || {})) {
    lines.push(`    --r-${key}: ${value}px;`);
  }
  for (const [key, value] of Object.entries(tokens.motion?.durationMs || {})) {
    lines.push(`    --d-${key}: ${value}ms;`);
  }
  return lines.join('\n');
}

function colorRef(value) {
  if (!value) return null;
  return value.startsWith('#') ? value : `var(--c-${value})`;
}

/**
 * 블록 하나의 인라인 스타일.
 *
 * 행간·자간은 명시값이 없으면 언어별 기본값을 **직접 써 넣는다.** 클래스 CSS로만 두면
 * 60px 표제와 17px 본문이 같은 값을 받는데, typography.md 2장·4.5절의 기준은 크기와
 * 언어에 따라 갈린다. 계산은 shared.mjs 한 곳에 있고 검사기도 같은 함수를 쓴다.
 */
function blockStyle(block, lang, baseline) {
  const s = block.style || {};
  const parts = [];
  const cjk = isCjkLang(lang);
  const TEXTUAL = ['heading', 'subheading', 'body', 'bullets', 'quote', 'caption', 'kpi'];
  if (block.box) {
    parts.push(
      'position:absolute',
      `left:${block.box.x}px`,
      `top:${block.box.y}px`,
      `width:${block.box.w}px`,
      `height:${block.box.h}px`
    );
  }
  if (s.fontRole) parts.push(`font-family:var(--f-${s.fontRole})`);
  if (s.fontSize) parts.push(`font-size:${s.fontSize}px`);
  if (s.weight) parts.push(`font-weight:${s.weight}`);
  if (TEXTUAL.includes(block.kind)) {
    const size = s.fontSize || 16;
    const lh = s.lineHeight ?? defaultLineHeight(block.kind, size, cjk, baseline);
    parts.push(`line-height:${lh}`);
    const ls = s.letterSpacing ?? defaultTracking(block.kind, size, cjk, baseline);
    if (ls !== 0) parts.push(`letter-spacing:${ls}em`);
  } else if (s.lineHeight) {
    parts.push(`line-height:${s.lineHeight}`);
  }
  if (s.color) parts.push(`color:${colorRef(s.color)}`);
  if (s.bg) parts.push(`background:${colorRef(s.bg)}`);
  if (s.align) parts.push(`text-align:${s.align}`);
  if (s.maxLines) {
    parts.push('display:-webkit-box', `-webkit-line-clamp:${s.maxLines}`, '-webkit-box-orient:vertical', 'overflow:hidden');
  }
  return parts.join(';');
}

function renderBlock(block, { assetSrc, lang, baseline }) {
  const style = blockStyle(block, lang, baseline);
  const attrs = `class="b b-${esc(block.kind)}" id="${esc(block.id)}"${style ? ` style="${style}"` : ''}`;
  const claims = (block.claims || [])
    .map((cl) => ` data-source-${esc(cl.kind || 'fact')}="${esc(cl.sourceId)}"`)
    .join('');

  switch (block.kind) {
    case 'heading':
      return `<h1 ${attrs}${claims}>${escLines(block.text)}</h1>`;
    case 'subheading':
      return `<h2 ${attrs}${claims}>${escLines(block.text)}</h2>`;
    case 'caption':
      return `<p ${attrs}${claims}>${escLines(block.text)}</p>`;
    case 'body':
      return `<p ${attrs}${claims}>${escLines(block.text)}</p>`;
    case 'quote':
      return `<blockquote ${attrs}${claims}>${escLines(block.text)}</blockquote>`;
    case 'bullets':
      return `<ul ${attrs}${claims}>${(block.items || []).map((i) => `<li>${escLines(i)}</li>`).join('')}</ul>`;
    case 'kpi':
      return `<div ${attrs}${claims}><b>${escLines(block.text)}</b>${
        block.items?.[0] ? `<span>${escLines(block.items[0])}</span>` : ''
      }</div>`;
    case 'image':
    case 'logo': {
      const src = assetSrc(block.assetId);
      if (!src) return `<div ${attrs} data-placeholder="true"${claims}>${esc(block.alt || block.text || 'image')}</div>`;
      return `<img ${attrs} src="${esc(src)}" alt="${esc(block.alt || '')}"${claims}>`;
    }
    case 'code':
      return `<pre ${attrs}${claims}><code>${esc(block.text)}</code></pre>`;
    case 'shape':
      return `<div ${attrs}${claims}></div>`;
    case 'spacer':
      return `<div ${attrs} aria-hidden="true"></div>`;
    case 'table': {
      const rows = Array.isArray(block.data) ? block.data : [];
      const body = rows
        .map((row, i) => `<tr>${row.map((cell) => `<${i === 0 ? 'th' : 'td'}>${esc(cell)}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`)
        .join('');
      return `<table ${attrs}${claims}>${body}</table>`;
    }
    case 'chart':
      return `<div ${attrs} data-chart='${esc(JSON.stringify(block.data ?? null))}'${claims}>${esc(block.text || '')}</div>`;
    default:
      return `<div ${attrs}${claims}>${esc(block.text || '')}</div>`;
  }
}

/**
 * 기본 CSS.
 *
 * 행간·자간은 여기 두지 않는다 — 크기와 언어에 따라 갈리므로 블록 인라인 스타일이 맡는다.
 * 여기 남는 것은 크기와 무관하게 항상 참인 규칙뿐이다.
 */
function baseCss(lang) {
  const cjk = isCjkLang(lang);
  return `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--c-bg); color: var(--c-fg); font-family: var(--f-body);
    /* 합성 금지: 브라우저가 만들어 내는 가짜 이탤릭·가짜 굵게는 한글·한자의 획을 뭉갠다.
       (references/typography.md 4.3) 원하는 굵기가 없으면 강조를 포기하는 편이 낫다. */
    font-synthesis: none;
    overflow-wrap: break-word;${cjk ? '\n    line-break: strict; /* 금칙 처리: 마침표·닫는 따옴표가 줄 첫머리에 오지 않게 */' : ''}
    font-feature-settings: "liga" 1, "calt" 1; }
  .b { margin: 0; }
  /* 표제는 4줄 이하에서 각 줄 길이를 고르게 — 마지막 줄에 한 낱말만 남는 것을 막는다 */
  .b-heading, .b-subheading { text-wrap: balance; }
  .b-body, .b-quote { text-wrap: pretty; }
  .b-heading { font-family: var(--f-display); }
  .b-subheading { font-family: var(--f-display); font-weight: 500; }
  .b-bullets { padding-left: 1.2em; }
  .b-bullets li + li { margin-top: calc(var(--sp) * 0.75); }
  .b-quote { border-left: 3px solid var(--c-accent); padding-left: calc(var(--sp) * 2); }
  .b-kpi b { display: block; font-family: var(--f-display); font-size: 1em; }
  /* 라벨은 숫자 크기에 비례하되 절대 상·하한을 둔다. 200px 숫자에 84px 라벨이 붙는 사고 방지. */
  .b-kpi span { display: block; color: var(--c-muted); font-family: var(--f-body);
    font-size: clamp(16px, 0.2em, 36px); font-weight: 400; line-height: 1.4; margin-top: 0.15em; }
  .b-image, .b-logo { object-fit: cover; }
  [data-placeholder] { display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--c-muted) 18%, transparent);
    color: var(--c-muted); font-size: 14px; border-radius: 8px;
    outline: 1px dashed color-mix(in srgb, var(--c-muted) 45%, transparent); }
  /* 자릿수 폭을 고정하지 않으면 1과 8의 폭이 달라 열이 좌우로 떨린다 */
  .b-table, .b-kpi b { font-variant-numeric: tabular-nums; }
  .b-table { border-collapse: collapse; }
  .b-table th, .b-table td { border-bottom: 1px solid color-mix(in srgb, var(--c-muted) 30%, transparent);
    padding: calc(var(--sp)) calc(var(--sp) * 1.5); text-align: left; }
  .b-code { background: var(--c-surface, #1116); padding: calc(var(--sp) * 2);
    border-radius: 8px; font-family: var(--f-mono, ui-monospace, monospace); overflow: auto; }
  /* 전정 장애·편두통이 있는 사람에게 큰 움직임은 증상을 일으킨다. 끄는 것이 아니라
     즉시 끝난 상태로 만든다 — 끄면 등장 애니메이션에 걸린 요소가 영영 안 보인다. */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important; animation-iteration-count: 1 !important;
      transition-duration: 1ms !important; scroll-behavior: auto !important;
    }
  }
`;
}

/**
 * 준비 완료 계약.
 *
 * seek(t)가 시간만으로 상태를 정해도, 글꼴과 외부 이미지가 아직 디코딩되지 않았다면
 * 같은 t에서 다른 픽셀이 나온다. 프레임 단위로 캡처하는 렌더러는 첫 프레임에서만
 * 이 차이를 만나 재현성이 깨진다 — 골든 프레임 검사가 잡아낸 실제 사고다.
 *
 * 그래서 캡처하는 쪽이 기다릴 수 있는 신호를 함께 낸다.
 *   await page.waitForFunction(() => document.body.dataset.ready === '1')
 *   또는 await window.READY
 *
 * SVG의 <image>는 document.images에 들어가지 않으므로 같은 href를 HTMLImageElement로
 * 한 번 더 불러 캐시를 데운다.
 */
const READY_RUNTIME = `
  window.READY = (function () {
    var waits = [document.fonts ? document.fonts.ready : Promise.resolve()];
    var hrefs = [];
    Array.prototype.forEach.call(document.images, function (img) {
      if (!img.complete) waits.push(new Promise(function (r) { img.onload = img.onerror = r; }));
    });
    Array.prototype.forEach.call(document.querySelectorAll('image'), function (el) {
      var href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href && hrefs.indexOf(href) === -1) hrefs.push(href);
    });
    hrefs.forEach(function (href) {
      waits.push(new Promise(function (r) {
        var probe = new Image();
        probe.onload = probe.onerror = r;
        probe.src = href;
      }));
    });
    return Promise.all(waits).then(function () {
      // 디코딩된 자원이 실제로 합성될 때까지 한 프레임 더 기다린다
      return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
    }).then(function () {
      // 영상은 워밍업 한 바퀴를 더 돈 뒤에 ready를 세운다 (아래 seek 정의 뒤에서 이어붙인다)
      if (!document.getElementById('stage') || !document.querySelector('.scene')) {
        document.body.dataset.ready = '1';
      }
    });
  })();
`;

function shell({ title, tokens, css, body, script, lang }) {
  return `<!doctype html>
<html lang="${esc(lang || 'ko')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root {
${cssVars(tokens)}
  }
${baseCss(lang)}${css}
</style>
</head>
<body>
${body}
<script>
${READY_RUNTIME}${script || ''}
</script>
</body>
</html>
`;
}

/* ── 산출물별 렌더 ─────────────────────────────────────────────── */

function renderHtmlPages(ir, ctxHelpers) {
  const { tokens, lang } = ctxHelpers;
  return (ir.pages || []).map((page) => {
    const sections = (page.sections || [])
      .map((section) => {
        const blocks = (section.blocks || []).map((b) => renderBlock(b, ctxHelpers)).join('\n      ');
        const positioned = (section.blocks || []).some((b) => b.box);
        return `  <section class="s s-${esc(section.kind || 'custom')}" id="${esc(section.id)}"${
          positioned ? ' data-positioned="true"' : ''
        }>
      ${blocks}
  </section>`;
      })
      .join('\n');
    const css = `
  .s { padding: calc(var(--sp) * 8) calc(var(--sp) * 6); max-width: 1200px; margin: 0 auto; }
  .s[data-positioned] { position: relative; max-width: none; padding: 0; }
  .s-hero { padding-top: calc(var(--sp) * 14); }
  .s-footer { color: var(--c-muted); border-top: 1px solid color-mix(in srgb, var(--c-muted) 25%, transparent); }
`;
    return {
      path: page.path || `${page.id}.html`,
      html: shell({ title: page.title || ir.title || page.id, tokens, css, body: sections, lang }),
    };
  });
}

function renderDeck(ir, ctxHelpers) {
  const { tokens, lang } = ctxHelpers;
  const canvas = { ...DEFAULT_CANVAS, ...(ir.canvas || {}) };
  const slides = (ir.slides || [])
    .map((slide, i) => {
      const blocks = (slide.blocks || []).map((b) => renderBlock(b, ctxHelpers)).join('\n      ');
      return `  <section class="slide l-${esc(slide.layout)}" id="${esc(slide.id)}" data-index="${i}"${
        slide.notes ? ` data-notes="${esc(slide.notes)}"` : ''
      }>
      ${blocks}
  </section>`;
    })
    .join('\n');

  const css = `
  html, body { height: 100%; overflow: hidden; background: #000; }
  #stage { position: relative; width: ${canvas.width}px; height: ${canvas.height}px;
           transform-origin: top left; }
  .slide { position: absolute; inset: 0; width: ${canvas.width}px; height: ${canvas.height}px;
           background: var(--c-bg); display: none; overflow: hidden; }
  .slide.active { display: block; }
  @media print { .slide { display: block; page-break-after: always; } }
`;
  const script = `
  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var idx = 0;
  function fit() {
    var s = Math.min(innerWidth / ${canvas.width}, innerHeight / ${canvas.height});
    stage.style.transform = 'scale(' + s + ')';
    stage.style.left = ((innerWidth - ${canvas.width} * s) / 2) + 'px';
    stage.style.top = ((innerHeight - ${canvas.height} * s) / 2) + 'px';
  }
  function show(i) {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (el, n) { el.classList.toggle('active', n === idx); });
    document.body.dataset.slide = String(idx);
  }
  window.gotoSlide = show;
  window.slideCount = slides.length;
  addEventListener('resize', fit);
  addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });
  fit(); show(0);
`;
  return [
    {
      path: `${ir.id}.html`,
      html: shell({
        title: ir.title || ir.id,
        tokens,
        css,
        body: `<div id="stage">\n${slides}\n</div>`,
        script,
        lang,
      }),
    },
  ];
}

function renderVideo(ir, ctxHelpers) {
  const { tokens, lang } = ctxHelpers;
  const canvas = { ...DEFAULT_CANVAS, fps: 30, ...(ir.canvas || {}) };
  const scenes = [...(ir.scenes || [])].sort((a, b) => a.startMs - b.startMs);
  const totalMs = scenes.reduce((max, s) => Math.max(max, s.startMs + s.durationMs), 0);

  const wbSpecs = [];
  const sceneHtml = scenes
    .map((scene) => {
      const layers = (scene.layers || [])
        .map((layer) => {
          const uid = `${scene.id}--${layer.id}`;
          const box = layer.region;

          // whiteboard 플러그인 레이어는 SVG로 그린다. 좌표계가 캔버스 전체라
          // 자기 영역으로 잘라내지 않고 그대로 겹쳐 놓는다 (clipPath가 범위를 강제한다).
          if (layer.render?.plugin === 'whiteboard') {
            const wb = renderWhiteboardLayer({ scene, layer, canvas, assetSrc: ctxHelpers.assetSrc, uid });
            wbSpecs.push({ ...wb.runtime, scene: scene.id });
            return `      <div class="layer wb-layer" id="${esc(uid)}"
           data-enter="${layer.enterMs ?? 0}" data-exit="${layer.exitMs ?? scene.durationMs}">${wb.html}</div>`;
          }

          const inner = layer.block ? renderBlock(layer.block, ctxHelpers) : '';
          const style = box ? `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;` : '';
          return `      <div class="layer" id="${esc(uid)}" style="${style}"
           data-enter="${layer.enterMs ?? 0}" data-exit="${layer.exitMs ?? scene.durationMs}">${inner}</div>`;
        })
        .join('\n');
      return `  <section class="scene" id="${esc(scene.id)}" data-start="${scene.startMs}" data-duration="${
        scene.durationMs
      }"${scene.narrativeRole ? ` data-role="${esc(scene.narrativeRole)}"` : ''}${
        scene.subtitle ? ` data-subtitle="${esc(scene.subtitle)}"` : ''
      }>
${layers}
  </section>`;
    })
    .join('\n');

  const css = `
  html, body { height: 100%; overflow: hidden; background: #000; }
  #stage { position: relative; width: ${canvas.width}px; height: ${canvas.height}px;
           transform-origin: top left; background: var(--c-bg); overflow: hidden; }
  .scene { position: absolute; inset: 0; opacity: 0; }
  .scene.active { opacity: 1; }
  .layer { opacity: 0; transition: none; }
  .layer.on { opacity: 1; }
  /* 화이트보드: SVG가 캔버스 전체를 덮고 clipPath가 범위를 강제한다 */
  .wb-layer { position: absolute; inset: 0; }
  .wb { position: absolute; left: 0; top: 0; overflow: visible; }
  .wb-hand { pointer-events: none; }
  /* 자막 트랙 — 번인 여부는 IR의 captions.burnIn이 정한다 */
  #captions { position: absolute; left: 8%; right: 8%; bottom: 5.5%; text-align: center;
    font-family: var(--f-body); font-size: ${Math.round(canvas.height * 0.038)}px; line-height: 1.45;
    color: var(--c-fg); text-shadow: 0 2px 12px rgba(0,0,0,.55); opacity: 0; white-space: pre-wrap; }
  #captions.on { opacity: 1; }
`;
  // seek(t) 계약: render-video-seek.js가 프레임마다 호출한다. 시간만 넣으면 상태가 결정된다.
  const burnIn = ir.captions?.burnIn === true;
  const script = `
  var DURATION_MS = ${totalMs};
  var FPS = ${canvas.fps};
  var BURN_IN = ${burnIn};
  var stage = document.getElementById('stage');
  var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
  var capEl = document.getElementById('captions');
${wbSpecs.length ? WHITEBOARD_RUNTIME : ''}
  var WB = wbInitAll(${JSON.stringify(wbSpecs)});
  function fit() {
    var s = Math.min(innerWidth / ${canvas.width}, innerHeight / ${canvas.height});
    stage.style.transform = 'scale(' + s + ')';
  }
  function seek(tSec) {
    var ms = tSec * 1000;
    var caption = '';
    scenes.forEach(function (sc) {
      var start = +sc.dataset.start, dur = +sc.dataset.duration;
      var local = ms - start;
      var active = local >= 0 && local < dur;
      sc.classList.toggle('active', active);
      if (active && sc.dataset.subtitle) caption = sc.dataset.subtitle;
      Array.prototype.forEach.call(sc.querySelectorAll('.layer'), function (l) {
        var on = active && local >= +l.dataset.enter && local < +l.dataset.exit;
        l.classList.toggle('on', on);
      });
      WB.forEach(function (sp) {
        if (sp.scene === sc.id) wbSeek(sp, active ? local : -1);
      });
    });
    if (capEl) {
      capEl.textContent = caption;
      capEl.classList.toggle('on', BURN_IN && !!caption);
    }
    document.body.dataset.timeMs = String(Math.round(ms));
    document.body.dataset.caption = caption;
  }
  window.seek = seek;
  window.DURATION_MS = DURATION_MS;
  window.FPS = FPS;
  addEventListener('resize', fit);
  fit(); seek(0);

  // 워밍업: 캡처 전에 타임라인을 한 번 훑어 모든 요소를 최소 한 번 그린다.
  // 처음 화면에 나타나는 요소는 첫 페인트에서 래스터화 비용을 치르는데, 프레임 단위로
  // 캡처하면 그 프레임만 다르게 나온다. READY가 끝난 뒤에는 어느 시각을 찍어도 같다.
  window.READY = window.READY.then(function () {
    var samples = [];
    for (var i = 0; i <= 8; i += 1) samples.push((DURATION_MS / 1000) * (i / 8));
    return samples.reduce(function (chain, t) {
      return chain.then(function () {
        seek(t);
        return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
      });
    }, Promise.resolve());
  }).then(function () {
    seek(0);
    document.body.dataset.ready = '1';
  });
${wbSpecs.length ? '' : '\n  function wbInitAll(s) { return s; }\n  function wbSeek() {}\n'}`;
  return [
    {
      path: `${ir.id}.html`,
      html: shell({
        title: ir.title || ir.id,
        tokens,
        css,
        body: `<div id="stage" data-duration="${(totalMs / 1000).toFixed(3)}" data-fps="${canvas.fps}">
${sceneHtml}
  <div id="captions"></div>
</div>`,
        script,
        lang,
      }),
    },
  ];
}

/**
 * IR을 HTML 문자열 목록으로 만든다. 파일로 쓰지 않는다.
 * @returns [{ path, html }]
 */
export function renderIrFiles(ir, { tokens, lang, assetSrc }) {
  const merged = mergeTokens(tokens, ir.tokenOverrides);
  const helpers = { tokens: merged, lang, baseline: bodyBaseline(ir.type), assetSrc: assetSrc || (() => null) };
  if (ir.type === 'deck') return renderDeck(ir, helpers);
  if (ir.type === 'video') return renderVideo(ir, helpers);
  return renderHtmlPages(ir, helpers);
}

export { mergeTokens };
