/**
 * studio/index.mjs — Design Studio 웹 편집기 생성기
 *
 * 범위: 범용 Figma 대체제가 아니다. **Design Studio가 만든 산출물만** 안정적으로
 * 고치는 편집기다(로드맵 5.4의 첫 버전 제약). 그래서 편집 대상은 화면의 DOM이 아니라
 * IR이고, 미리보기는 CLI와 같은 렌더 코드로 다시 그린다. 그래야 화면에서 본 것과
 * 파일로 나온 것이 갈라지지 않는다.
 *
 * 파일 하나짜리 HTML이다. 서버도 빌드도 node_modules도 없이 열린다.
 * 자산은 data: URL로 인라인해 오프라인에서도 그림이 보인다.
 *
 * 저장은 직접 덮어쓰지 않는다. 편집 결과를 패치 JSON으로 내려받고
 * `design studio --apply <패치>`가 스키마·검수를 통과시킨 뒤에 반영한다.
 * (whiteboard annotate에서 같은 방식이 잘 동작했다)
 */

import fs from 'node:fs';
import path from 'node:path';
import { bundleRenderCore } from './bundle.mjs';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * <script> 안에 코드를 심을 때 문자열 속 `</script>`가 태그를 끝내버린다.
 * 렌더 코어는 HTML을 만드는 코드라 그 문자열을 실제로 갖고 있다 — 이스케이프하지 않으면
 * 편집기 스크립트가 중간에서 잘려 통째로 죽는다.
 */
const inlineSafe = (s) => String(s).replace(/<\/(script)/gi, '<\\/$1');

const MIME = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
};
const MAX_INLINE_BYTES = 2 * 1024 * 1024;

/** 자산을 data: URL로 인라인한다. 너무 크면 자리표시자로 남긴다. */
function inlineAssets(ctx) {
  const out = {};
  for (const asset of ctx.manifest.assets || []) {
    const abs = path.resolve(ctx.dir, asset.path);
    const ext = path.extname(abs).toLowerCase();
    if (!MIME[ext] || !fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.size > MAX_INLINE_BYTES) continue;
    out[asset.id] = `data:${MIME[ext]};base64,${fs.readFileSync(abs).toString('base64')}`;
  }
  return out;
}

export function renderStudio(ctx, { artifacts, irs }) {
  const payload = {
    project: {
      id: ctx.manifest.id,
      name: ctx.manifest.name,
      lang: ctx.manifest.brief?.language || 'ko',
      tokens: ctx.manifest.brand?.tokens || {},
      brandName: ctx.manifest.brand?.name || '',
    },
    artifacts: artifacts.map((a) => ({ id: a.id, type: a.type, title: a.title || a.id })),
    irs,
    assets: inlineAssets(ctx),
    approvals: ctx.manifest.approvals || {},
  };

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design Studio · ${esc(ctx.manifest.name)}</title>
<style>
${STUDIO_CSS}
</style>
</head>
<body>
<header id="top">
  <div class="brand">
    <strong>${esc(ctx.manifest.name)}</strong>
    <span class="dim">${esc(ctx.manifest.id)}</span>
  </div>
  <nav id="tabs"></nav>
  <div class="spacer"></div>
  <span id="dirty" class="badge hidden">수정됨</span>
  <button id="reset" class="ghost">되돌리기</button>
  <button id="save">패치 내려받기</button>
</header>

<main>
  <section id="canvas">
    <div id="frame-wrap">
      <iframe id="frame" title="미리보기"></iframe>
      <div id="overlay"></div>
    </div>
    <div id="transport">
      <button id="prev" class="ghost">◀</button>
      <button id="play" class="ghost">▶</button>
      <button id="next" class="ghost">▶</button>
      <input type="range" id="scrub" min="0" max="1000" value="0">
      <span id="clock" class="dim mono">—</span>
      <label class="pick"><input type="checkbox" id="pickmode"> 영역 지정</label>
    </div>
  </section>

  <aside id="side">
    <div id="sidetabs">
      <button data-pane="structure" class="on">구조</button>
      <button data-pane="element">요소</button>
      <button data-pane="tokens">토큰</button>
      <button data-pane="revise">수정 요청</button>
    </div>
    <div id="panes">
      <div class="pane" data-pane="structure"></div>
      <div class="pane hidden" data-pane="element"></div>
      <div class="pane hidden" data-pane="tokens"></div>
      <div class="pane hidden" data-pane="revise"></div>
    </div>
    <footer id="issues"></footer>
  </aside>
</main>

<script>
/* ── 렌더 코어 (CLI와 동일한 코드) ─────────────────────────────── */
${inlineSafe(bundleRenderCore())}

/* ── Studio ───────────────────────────────────────────────────── */
${inlineSafe(STUDIO_JS)}

boot(${inlineSafe(JSON.stringify(payload))});
</script>
</body>
</html>
`;
}

const STUDIO_CSS = `
  :root {
    --bg:#0d1117; --surface:#161b22; --raised:#1c232d; --line:#2a323d;
    --fg:#e6edf3; --muted:#8b949e; --accent:#58a6ff; --warn:#d29922; --err:#f85149; --ok:#3fb950;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--fg); display: flex; flex-direction: column;
         font: 13.5px/1.55 -apple-system,"Pretendard","Noto Sans KR","Segoe UI",system-ui,sans-serif; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dim { color: var(--muted); }
  .hidden { display: none !important; }

  header#top { display: flex; align-items: center; gap: 16px; padding: 10px 16px;
               border-bottom: 1px solid var(--line); background: var(--surface); flex: none; }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .brand strong { font-size: 14px; }
  .brand .dim { font-size: 11.5px; }
  .spacer { flex: 1; }
  nav#tabs { display: flex; gap: 4px; }
  nav#tabs button { background: transparent; border: 1px solid var(--line); color: var(--muted);
                    border-radius: 6px; padding: 5px 12px; font: inherit; cursor: pointer; }
  nav#tabs button.on { border-color: var(--accent); color: var(--accent); }
  .badge { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn);
           padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }

  button { background: var(--accent); color: #08111d; border: 0; border-radius: 6px;
           padding: 7px 13px; font: inherit; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--line); font-weight: 400; }
  button:disabled { opacity: .4; cursor: default; }

  main { flex: 1; display: flex; min-height: 0; }
  #canvas { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #05070a; }
  #frame-wrap { flex: 1; position: relative; overflow: hidden; }
  #frame { position: absolute; border: 0; transform-origin: top left; background: #fff; }
  #overlay { position: absolute; inset: 0; pointer-events: none; }
  #overlay .sel { position: absolute; outline: 2px solid var(--accent);
                  background: color-mix(in srgb, var(--accent) 10%, transparent); }
  #overlay .sel::after { content: attr(data-label); position: absolute; top: -22px; left: 0;
                  background: var(--accent); color: #08111d; font-size: 11px; font-weight: 700;
                  padding: 1px 7px; border-radius: 4px; white-space: nowrap; }
  #overlay .hoverbox { position: absolute; outline: 1px dashed color-mix(in srgb, var(--accent) 60%, transparent); }
  #overlay .region { position: absolute; outline: 2px dashed var(--warn);
                  background: color-mix(in srgb, var(--warn) 12%, transparent); }
  #frame-wrap.picking { cursor: crosshair; }
  #frame-wrap.picking #overlay { pointer-events: auto; }

  #transport { display: flex; align-items: center; gap: 10px; padding: 9px 14px;
               border-top: 1px solid var(--line); background: var(--surface); flex: none; }
  #transport input[type=range] { flex: 1; accent-color: var(--accent); }
  #clock { font-size: 12px; min-width: 108px; text-align: right; }
  .pick { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; cursor: pointer; }

  aside#side { width: 380px; flex: none; border-left: 1px solid var(--line);
               background: var(--surface); display: flex; flex-direction: column; }
  #sidetabs { display: flex; border-bottom: 1px solid var(--line); }
  #sidetabs button { flex: 1; background: transparent; color: var(--muted); border: 0;
                     border-bottom: 2px solid transparent; border-radius: 0; padding: 10px 4px;
                     font-weight: 500; font-size: 12.5px; }
  #sidetabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
  #panes { flex: 1; overflow: auto; }
  .pane { padding: 16px; }

  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
       margin: 0 0 9px; font-weight: 600; }
  .grp { margin-bottom: 24px; }
  label { display: block; font-size: 11.5px; color: var(--muted); margin: 10px 0 4px; }
  input[type=text], input[type=number], textarea, select {
    width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--line);
    border-radius: 6px; padding: 6px 9px; font: inherit; font-size: 12.5px; }
  textarea { resize: vertical; min-height: 66px; line-height: 1.5; }
  input[type=color] { width: 100%; height: 30px; background: var(--bg); border: 1px solid var(--line);
                      border-radius: 6px; padding: 2px; cursor: pointer; }
  .row { display: flex; gap: 7px; }
  .row > * { flex: 1; min-width: 0; }

  .list { display: flex; flex-direction: column; gap: 3px; }
  .list .item { display: flex; gap: 5px; align-items: center; }
  .list .item > button:first-child { flex: 1; text-align: left; background: transparent;
    border: 1px solid var(--line); color: var(--fg); font-weight: 400; font-size: 12.5px; padding: 7px 10px; }
  .list .item > button:first-child.on { border-color: var(--accent); color: var(--accent); }
  .list .item .mv { padding: 7px 9px; }
  .sub { padding-left: 14px; }
  .kind { color: var(--muted); font-size: 11px; margin-left: 6px; }

  .swatch { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .swatch input[type=color] { width: 38px; height: 26px; flex: none; }
  .swatch input[type=text] { flex: 1; font-family: ui-monospace, monospace; font-size: 11.5px; }
  .swatch span { width: 76px; flex: none; font-size: 11.5px; color: var(--muted); }
  .contrast { font-size: 11px; margin-left: auto; font-variant-numeric: tabular-nums; }
  .contrast.bad { color: var(--err); }
  .contrast.ok { color: var(--ok); }

  footer#issues { border-top: 1px solid var(--line); padding: 11px 16px; max-height: 30vh; overflow: auto;
                  font-size: 12px; flex: none; }
  footer#issues div { padding: 5px 9px; border-radius: 5px; margin-bottom: 4px; }
  footer#issues .err { background: color-mix(in srgb, var(--err) 14%, transparent); color: var(--err); }
  footer#issues .warn { background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
  footer#issues .ok { background: color-mix(in srgb, var(--ok) 14%, transparent); color: var(--ok); }

  .rev { border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; margin-bottom: 9px; }
  .rev .where { font-size: 11px; color: var(--accent); font-family: ui-monospace, monospace; }
  .rev p { margin: 5px 0 0; font-size: 12.5px; }
  .rev button { margin-top: 8px; padding: 4px 9px; font-size: 11.5px; }
  .empty { color: var(--muted); font-size: 12.5px; }
  kbd { background: var(--bg); border: 1px solid var(--line); border-radius: 4px;
        padding: 1px 5px; font-size: 11px; }
`;

const STUDIO_JS = String.raw`
var S = {
  data: null, original: null, ai: 0,          // 현재 산출물 인덱스
  sel: null,                                   // { container, block }
  time: 0, slide: 0, playing: false, raf: null,
  revisions: [], pickRect: null, dirty: false,
};

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
function escH(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
  return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function boot(payload) {
  S.data = payload;
  S.original = JSON.stringify(payload);
  renderTabs();
  bindChrome();
  selectArtifact(0);
}

function art() { return S.data.artifacts[S.ai]; }
function ir() { return S.data.irs[art().id]; }

/* ── 산출물 탭 ─────────────────────────────────────────────────── */

function renderTabs() {
  var nav = $('#tabs');
  nav.innerHTML = S.data.artifacts.map(function (a, i) {
    return '<button data-i="' + i + '">' + escH(a.title) + '<span class="kind">' + a.type + '</span></button>';
  }).join('');
  $$('button', nav).forEach(function (b) { b.onclick = function () { selectArtifact(+b.dataset.i); }; });
}

function selectArtifact(i) {
  S.ai = i; S.sel = null; S.time = 0; S.slide = 0; S.pickRect = null;
  $$('#tabs button').forEach(function (b, n) { b.classList.toggle('on', n === i); });
  var isVideo = art().type === 'video';
  var isDeck = art().type === 'deck';
  $('#scrub').classList.toggle('hidden', !isVideo);
  $('#play').classList.toggle('hidden', !isVideo);
  $('#clock').classList.toggle('hidden', !isVideo && !isDeck);
  $('#prev').classList.toggle('hidden', !isDeck);
  $('#next').classList.toggle('hidden', !isDeck);
  rerender();
  renderPanes();
}

/* ── 미리보기 (CLI와 같은 렌더 코드) ───────────────────────────── */

function rerender() {
  var files = renderIrFiles(ir(), {
    tokens: S.data.project.tokens,
    lang: S.data.project.lang,
    assetSrc: function (id) { return S.data.assets[id] || null; },
  });
  var frame = $('#frame');
  frame.onload = function () { afterFrameLoad(); };
  frame.srcdoc = files[0].html;
  markDirty();
  check();
}

function canvasSize() {
  var c = ir().canvas;
  if (c) return { w: c.width, h: c.height };
  return { w: 1440, h: 1000 };                 // 흐름 배치 HTML은 세로가 늘어난다
}

function fitFrame() {
  var wrap = $('#frame-wrap'), frame = $('#frame');
  var size = canvasSize();
  var s = Math.min(wrap.clientWidth / size.w, wrap.clientHeight / size.h) * 0.94;
  frame.style.width = size.w + 'px';
  frame.style.height = size.h + 'px';
  frame.style.transform = 'scale(' + s + ')';
  frame.style.left = ((wrap.clientWidth - size.w * s) / 2) + 'px';
  frame.style.top = ((wrap.clientHeight - size.h * s) / 2) + 'px';
  S.scale = s;
  drawOverlay();
}
addEventListener('resize', fitFrame);

function frameDoc() { try { return $('#frame').contentDocument; } catch (e) { return null; } }
function frameWin() { try { return $('#frame').contentWindow; } catch (e) { return null; } }

function afterFrameLoad() {
  fitFrame();
  var doc = frameDoc();
  if (!doc) return;

  // 미리보기 안에서 요소를 고른다. 편집 대상은 DOM이 아니라 이 DOM이 나온 IR이다.
  doc.addEventListener('click', function (e) {
    if ($('#pickmode').checked) return;
    e.preventDefault();
    var el = e.target.closest ? e.target.closest('.b') : null;
    if (!el) { S.sel = null; renderPanes(); drawOverlay(); return; }
    var container = el.closest('.slide, .scene, .s, .layer');
    selectBlock(container ? container.id.split('--')[0] : null, el.id);
  }, true);

  doc.addEventListener('mouseover', function (e) {
    if ($('#pickmode').checked) return;
    var el = e.target.closest ? e.target.closest('.b') : null;
    drawHover(el);
  }, true);

  applyTransport();
}

/* ── 시간 · 슬라이드 ───────────────────────────────────────────── */

function totalMs() {
  return (ir().scenes || []).reduce(function (m, s) { return Math.max(m, s.startMs + s.durationMs); }, 0);
}

function applyTransport() {
  var win = frameWin();
  if (!win) return;
  if (art().type === 'video' && win.seek) {
    win.seek(S.time / 1000);
    $('#clock').textContent = (S.time / 1000).toFixed(2) + 's / ' + (totalMs() / 1000).toFixed(2) + 's';
    $('#scrub').value = Math.round((S.time / Math.max(1, totalMs())) * 1000);
  } else if (art().type === 'deck' && win.gotoSlide) {
    win.gotoSlide(S.slide);
    $('#clock').textContent = (S.slide + 1) + ' / ' + (ir().slides || []).length;
  }
  drawOverlay();
}

/* ── 선택 오버레이 ─────────────────────────────────────────────── */

function findEl(containerId, blockId) {
  var doc = frameDoc();
  if (!doc) return null;
  var all = $$('[id="' + cssEscape(blockId) + '"]', doc);
  if (all.length <= 1) return all[0] || null;
  for (var i = 0; i < all.length; i++) {
    var c = all[i].closest('.slide, .scene, .s, .layer');
    if (c && c.id.split('--')[0] === containerId) return all[i];
  }
  return all[0];
}
function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

function boxOf(el) {
  var frame = $('#frame');
  var r = el.getBoundingClientRect();
  var fr = frame.getBoundingClientRect();
  return { x: fr.left + r.left * S.scale, y: fr.top + r.top * S.scale,
           w: r.width * S.scale, h: r.height * S.scale };
}

function drawOverlay() {
  var ov = $('#overlay');
  ov.innerHTML = '';
  if (S.pickRect) {
    var pr = S.pickRect;
    ov.appendChild(h('<div class="region" style="left:' + pr.sx + 'px;top:' + pr.sy +
      'px;width:' + pr.sw + 'px;height:' + pr.sh + 'px"></div>'));
  }
  if (!S.sel) return;
  var el = findEl(S.sel.container, S.sel.block);
  if (!el) return;
  var b = boxOf(el);
  var wrap = $('#frame-wrap').getBoundingClientRect();
  ov.appendChild(h('<div class="sel" data-label="' + escH(S.sel.block) + '" style="left:' +
    (b.x - wrap.left) + 'px;top:' + (b.y - wrap.top) + 'px;width:' + b.w + 'px;height:' + b.h + 'px"></div>'));
}

function drawHover(el) {
  var old = $('#overlay .hoverbox');
  if (old) old.remove();
  if (!el) return;
  var b = boxOf(el);
  var wrap = $('#frame-wrap').getBoundingClientRect();
  $('#overlay').appendChild(h('<div class="hoverbox" style="left:' + (b.x - wrap.left) +
    'px;top:' + (b.y - wrap.top) + 'px;width:' + b.w + 'px;height:' + b.h + 'px"></div>'));
}

/* ── IR 탐색 ──────────────────────────────────────────────────── */

/** 산출물 종류와 무관하게 컨테이너 목록을 낸다 */
function containers() {
  var d = ir();
  var out = [];
  (d.pages || []).forEach(function (p) {
    (p.sections || []).forEach(function (s) {
      out.push({ id: s.id, label: s.id, kind: s.kind || 'section', blocks: s.blocks || [], holder: p.sections, node: s });
    });
  });
  (d.slides || []).forEach(function (s, i) {
    out.push({ id: s.id, label: (i + 1) + '. ' + (s.title || s.id), kind: s.layout, blocks: s.blocks || [], holder: d.slides, node: s });
  });
  (d.scenes || []).forEach(function (s, i) {
    var blocks = (s.layers || []).map(function (l) { return l.block; }).filter(Boolean);
    out.push({ id: s.id, label: (i + 1) + '. ' + s.id, kind: s.narrativeRole || 'scene',
               blocks: blocks, holder: d.scenes, node: s, layers: s.layers || [] });
  });
  return out;
}

function findContainer(id) {
  var all = containers();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

function findBlock(containerId, blockId) {
  var c = findContainer(containerId);
  if (!c) {
    var all = containers();
    for (var i = 0; i < all.length; i++) {
      var b = all[i].blocks.filter(function (x) { return x.id === blockId; })[0];
      if (b) return { container: all[i], block: b };
    }
    return null;
  }
  var blk = c.blocks.filter(function (x) { return x.id === blockId; })[0];
  return blk ? { container: c, block: blk } : null;
}

function selectBlock(containerId, blockId) {
  var found = findBlock(containerId, blockId);
  if (!found) return;
  S.sel = { container: found.container.id, block: found.block.id };
  // 영상은 그 요소가 보이는 시각으로 이동한다 — 안 보이는 요소를 편집하면 헛손질이 된다
  if (art().type === 'video') {
    var c = found.container;
    var layer = (c.layers || []).filter(function (l) { return l.block && l.block.id === blockId; })[0];
    if (layer) {
      var t = c.node.startMs + Math.min(c.node.durationMs - 1, (layer.enterMs || 0) + ((layer.exitMs || c.node.durationMs) - (layer.enterMs || 0)) * 0.75);
      S.time = t; applyTransport();
    }
  }
  showPane('element');
  renderPanes();
  drawOverlay();
}

/* ── 패널 ─────────────────────────────────────────────────────── */

function showPane(name) {
  $$('#sidetabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.pane === name); });
  $$('.pane').forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== name); });
}

function renderPanes() { paneStructure(); paneElement(); paneTokens(); paneRevise(); }

function paneStructure() {
  var pane = $('.pane[data-pane=structure]');
  var list = containers();
  var d = ir();
  var reorderable = !!(d.slides || d.scenes);
  pane.innerHTML =
    '<div class="grp"><h2>' + (d.slides ? '슬라이드' : d.scenes ? '장면' : '섹션') + '</h2><div class="list" id="clist"></div>' +
    (reorderable ? '<p class="dim" style="margin-top:8px;font-size:11.5px">순서를 바꾸면 등장 순서가 바뀝니다. 영상은 보호 영역이 다시 계산됩니다.</p>' : '') +
    '</div>';

  var cl = $('#clist', pane);
  list.forEach(function (c, i) {
    var item = h('<div class="item"><button>' + escH(c.label) + '<span class="kind">' + escH(c.kind) + '</span></button>' +
      (reorderable ? '<button class="ghost mv" title="위로">↑</button><button class="ghost mv" title="아래로">↓</button>' : '') + '</div>');
    var btns = $$('button', item);
    btns[0].classList.toggle('on', S.sel && S.sel.container === c.id);
    btns[0].onclick = function () {
      if (art().type === 'video') { S.time = c.node.startMs + 20; }
      if (art().type === 'deck') { S.slide = i; }
      S.sel = { container: c.id, block: (c.blocks[0] || {}).id };
      applyTransport(); renderPanes(); drawOverlay();
    };
    if (reorderable) {
      btns[1].onclick = function () { moveContainer(c, -1); };
      btns[2].onclick = function () { moveContainer(c, 1); };
      btns[1].disabled = i === 0; btns[2].disabled = i === list.length - 1;
    }
    cl.appendChild(item);

    if (S.sel && S.sel.container === c.id) {
      c.blocks.forEach(function (b) {
        var sub = h('<div class="item sub"><button>' + escH(b.id) + '<span class="kind">' + escH(b.kind) + '</span></button></div>');
        var sb = $('button', sub);
        sb.classList.toggle('on', S.sel.block === b.id);
        sb.onclick = function () { selectBlock(c.id, b.id); };
        cl.appendChild(sub);
      });
    }
  });
}

function moveContainer(c, dir) {
  var arr = c.holder;
  var i = arr.indexOf(c.node);
  var j = i + dir;
  if (j < 0 || j >= arr.length) return;
  var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  if (ir().scenes) resequenceScenes();
  rerender(); renderPanes();
}

/** 장면 순서를 바꾸면 타임라인과 보호 영역을 다시 맞춘다 */
function resequenceScenes() {
  var cursor = 0;
  ir().scenes.forEach(function (s, i) {
    s.sequence = i;
    s.startMs = cursor;
    cursor += s.durationMs;
    var layers = s.layers || [];
    layers.forEach(function (l, li) {
      if (!l.region) return;
      var later = layers.slice(li + 1).map(function (x) { return x.region; }).filter(Boolean);
      var prot = later.filter(function (r) { return overlaps(l.region, r); });
      if (prot.length) l.protectedRegions = prot; else delete l.protectedRegions;
    });
  });
}
function overlaps(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
         Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

function paneElement() {
  var pane = $('.pane[data-pane=element]');
  if (!S.sel) { pane.innerHTML = '<p class="empty">미리보기에서 요소를 클릭하세요.</p>'; return; }
  var found = findBlock(S.sel.container, S.sel.block);
  if (!found) { pane.innerHTML = '<p class="empty">선택한 요소를 찾을 수 없습니다.</p>'; return; }
  var b = found.block;
  var st = b.style || (b.style = {});
  var colorKeys = Object.keys(S.data.project.tokens.color || {});

  pane.innerHTML =
    '<div class="grp"><h2>' + escH(b.id) + ' · ' + escH(b.kind) + '</h2>' +
      (b.items ? '<label>항목 (한 줄에 하나)</label><textarea id="f-items">' + escH(b.items.join('\n')) + '</textarea>'
               : '<label>텍스트</label><textarea id="f-text">' + escH(b.text || '') + '</textarea>') +
      (b.kind === 'image' || b.kind === 'logo' ? '<label>대체 텍스트 (alt)</label><input type="text" id="f-alt" value="' + escH(b.alt || '') + '">' : '') +
    '</div>' +
    '<div class="grp"><h2>타이포그래피</h2>' +
      '<div class="row">' +
        '<div><label>크기 (px)</label><input type="number" id="f-size" value="' + (st.fontSize || '') + '" step="1"></div>' +
        '<div><label>굵기</label><input type="number" id="f-weight" value="' + (st.weight || '') + '" step="100"></div>' +
      '</div>' +
      '<div class="row">' +
        '<div><label>행간</label><input type="number" id="f-lh" value="' + (st.lineHeight || '') + '" step="0.05"></div>' +
        '<div><label>역할</label><select id="f-role">' +
          ['display', 'body', 'mono'].map(function (r) {
            return '<option value="' + r + '"' + (st.fontRole === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="row">' +
        '<div><label>색</label><select id="f-color"><option value="">(기본)</option>' +
          colorKeys.map(function (k) {
            return '<option value="' + k + '"' + (st.color === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label>정렬</label><select id="f-align"><option value="">(기본)</option>' +
          ['left', 'center', 'right'].map(function (a) {
            return '<option value="' + a + '"' + (st.align === a ? ' selected' : '') + '>' + a + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<label>최대 줄 수</label><input type="number" id="f-maxlines" value="' + (st.maxLines || '') + '" step="1">' +
    '</div>' +
    (b.box ? '<div class="grp"><h2>위치 · 크기</h2><div class="row">' +
      ['x', 'y', 'w', 'h'].map(function (k) {
        return '<div><label>' + k + '</label><input type="number" id="f-box-' + k + '" value="' + b.box[k] + '"></div>'; }).join('') +
      '</div></div>' : '<p class="dim" style="font-size:11.5px">흐름 배치 요소라 좌표가 없습니다.</p>');

  function bind(id, fn) {
    var el = $('#' + id, pane);
    if (!el) return;
    el.oninput = function () { fn(el.value); rerender(); drawOverlay(); };
  }
  bind('f-text', function (v) { b.text = v; if (b.alt !== undefined && b.kind !== 'image') b.alt = v; });
  bind('f-items', function (v) { b.items = v.split('\n'); });
  bind('f-alt', function (v) { b.alt = v; });
  bind('f-size', function (v) { setNum(st, 'fontSize', v); });
  bind('f-weight', function (v) { setNum(st, 'weight', v); });
  bind('f-lh', function (v) { setNum(st, 'lineHeight', v); });
  bind('f-maxlines', function (v) { setNum(st, 'maxLines', v); });
  bind('f-role', function (v) { st.fontRole = v; });
  bind('f-color', function (v) { if (v) st.color = v; else delete st.color; });
  bind('f-align', function (v) { if (v) st.align = v; else delete st.align; });
  ['x', 'y', 'w', 'h'].forEach(function (k) {
    bind('f-box-' + k, function (v) { b.box[k] = Math.round(+v || 0); if (ir().scenes) resequenceScenes(); });
  });
}

function setNum(obj, key, v) {
  if (v === '' || v == null) delete obj[key]; else obj[key] = +v;
}

function paneTokens() {
  var pane = $('.pane[data-pane=tokens]');
  var t = S.data.project.tokens;
  var colors = t.color || {};
  var typo = t.typography || {};

  pane.innerHTML =
    '<div class="grp"><h2>색</h2>' + Object.keys(colors).map(function (k) {
      return '<div class="swatch"><span>' + k + '</span>' +
        '<input type="color" data-ck="' + k + '" value="' + normHex(colors[k]) + '">' +
        '<input type="text" data-ct="' + k + '" value="' + escH(colors[k]) + '">' +
        '<span class="contrast" data-cc="' + k + '"></span></div>';
    }).join('') + '</div>' +
    '<div class="grp"><h2>글꼴</h2>' + ['display', 'body', 'mono'].filter(function (r) { return typo[r]; }).map(function (r) {
      return '<label>' + r + '</label><input type="text" data-font="' + r + '" value="' + escH(typo[r].family) + '">';
    }).join('') + '</div>' +
    '<div class="grp"><h2>간격</h2><label>기본 단위 (px)</label>' +
      '<input type="number" id="f-unit" value="' + ((t.spacing && t.spacing.unit) || 8) + '" step="1"></div>';

  $$('[data-ck]', pane).forEach(function (el) {
    el.oninput = function () {
      colors[el.dataset.ck] = el.value;
      $('[data-ct="' + el.dataset.ck + '"]', pane).value = el.value;
      rerender(); updateContrast();
    };
  });
  $$('[data-ct]', pane).forEach(function (el) {
    el.oninput = function () { colors[el.dataset.ct] = el.value; rerender(); updateContrast(); };
  });
  $$('[data-font]', pane).forEach(function (el) {
    el.oninput = function () { typo[el.dataset.font].family = el.value; rerender(); };
  });
  var unit = $('#f-unit', pane);
  if (unit) unit.oninput = function () { t.spacing = t.spacing || {}; t.spacing.unit = +unit.value || 8; rerender(); };

  updateContrast();
}

function normHex(v) {
  if (typeof v !== 'string') return '#000000';
  var h = v.replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  return '#' + (h.slice(0, 6).padEnd(6, '0'));
}

/** 배경 대비를 옆에 계속 띄워둔다 — 색을 고르는 순간에 보여야 의미가 있다 */
function updateContrast() {
  var colors = S.data.project.tokens.color || {};
  var bg = colors.bg;
  $$('[data-cc]').forEach(function (el) {
    var k = el.dataset.cc;
    if (k === 'bg') { el.textContent = ''; return; }
    var against = k === 'accentFg' ? colors.accent : bg;
    var r = contrast(colors[k], against);
    if (r == null) { el.textContent = ''; return; }
    el.textContent = r.toFixed(2) + ':1';
    el.className = 'contrast ' + (r >= 4.5 ? 'ok' : 'bad');
  });
}

function lum(hex) {
  var h = normHex(hex).slice(1);
  var n = parseInt(h, 16);
  var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
    var s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  if (!a || !b) return null;
  var l1 = lum(a), l2 = lum(b);
  var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 수정 요청 ─────────────────────────────────────────────────── */

function paneRevise() {
  var pane = $('.pane[data-pane=revise]');
  var target = S.pickRect ? '영역 ' + JSON.stringify(S.pickRect.ir) :
               S.sel ? S.sel.container + ' / ' + S.sel.block : '(대상 없음)';
  pane.innerHTML =
    '<div class="grp"><h2>새 요청</h2>' +
      '<p class="dim" style="font-size:11.5px;margin:0 0 8px">고칠 곳을 요소로 고르거나 <kbd>영역 지정</kbd>으로 끌어 표시한 뒤, 무엇을 바꾸고 싶은지 적으세요. 에이전트가 <span class="mono">design revise</span>로 이 목록을 집어갑니다.</p>' +
      '<label>대상</label><input type="text" id="rv-target" value="' + escH(target) + '" readonly>' +
      '<label>지시</label><textarea id="rv-note" placeholder="예: 이 제목을 더 짧게 줄이고, 아래 설명과 대비를 더 주세요"></textarea>' +
      '<button id="rv-add" style="margin-top:10px">요청 추가</button>' +
    '</div>' +
    '<div class="grp"><h2>대기 중 (' + S.revisions.length + ')</h2><div id="rv-list"></div></div>';

  $('#rv-add', pane).onclick = function () {
    var note = $('#rv-note', pane).value.trim();
    if (!note) return;
    S.revisions.push({
      at: new Date().toISOString(),
      artifact: art().id,
      container: S.sel ? S.sel.container : null,
      block: S.sel ? S.sel.block : null,
      region: S.pickRect ? S.pickRect.ir : null,
      instruction: note,
      status: 'open',
    });
    markDirty(); renderPanes();
  };

  var list = $('#rv-list', pane);
  if (S.revisions.length === 0) { list.innerHTML = '<p class="empty">아직 없습니다.</p>'; return; }
  list.innerHTML = '';
  S.revisions.forEach(function (r, i) {
    var el = h('<div class="rev"><div class="where">' + escH(r.artifact) +
      (r.block ? ' / ' + escH(r.container) + ' / ' + escH(r.block) : r.region ? ' / 영역' : '') +
      '</div><p>' + escH(r.instruction) + '</p><button class="ghost">삭제</button></div>');
    $('button', el).onclick = function () { S.revisions.splice(i, 1); markDirty(); renderPanes(); };
    list.appendChild(el);
  });
}

/* ── 검사 ─────────────────────────────────────────────────────── */

/**
 * 편집하는 동안 계속 돈다. 저장한 뒤에 틀렸다는 걸 아는 것보다 낫다.
 * (CLI의 design check가 훨씬 촘촘하다 — 여기는 편집 중에 즉시 보이는 것만)
 */
function check() {
  var out = [];
  var d = ir();
  var colors = S.data.project.tokens.color || {};
  var c = contrast(colors.fg, colors.bg);
  if (c != null && c < 4.5) out.push(['err', '본문 대비 ' + c.toFixed(2) + ':1 — 기준 4.5:1 미달']);
  var ca = contrast(colors.accentFg, colors.accent);
  if (ca != null && ca < 4.5) out.push(['err', '강조 배경 위 텍스트 대비 ' + ca.toFixed(2) + ':1 미달']);

  if (d.canvas) {
    containers().forEach(function (cont) {
      cont.blocks.forEach(function (b) {
        if (!b.box) return;
        if (b.box.x < 0 || b.box.y < 0 || b.box.x + b.box.w > d.canvas.width || b.box.y + b.box.h > d.canvas.height) {
          out.push(['err', cont.id + '/' + b.id + ': 캔버스 밖으로 나갑니다']);
        }
      });
    });
  }

  (d.scenes || []).forEach(function (s) {
    var layers = s.layers || [];
    layers.forEach(function (l, i) {
      if (!l.region) return;
      layers.slice(i + 1).forEach(function (o) {
        if (!o.region || !overlaps(l.region, o.region)) return;
        var ok = (l.protectedRegions || []).some(function (p) {
          return p.x === o.region.x && p.y === o.region.y && p.w === o.region.w && p.h === o.region.h; });
        if (!ok) out.push(['err', s.id + '/' + l.id + ': ' + o.id + '가 미리 드러납니다']);
      });
    });
  });

  // 넘침 추정 (CLI와 같은 휴리스틱의 축약판)
  containers().forEach(function (cont) {
    cont.blocks.forEach(function (b) {
      if (!b.box || !b.style || !b.style.fontSize) return;
      var segs = b.items || String(b.text || '').split('\n');
      var size = b.style.fontSize;
      var lines = segs.reduce(function (n, seg) {
        var w = 0;
        for (var i = 0; i < seg.length; i++) w += seg.codePointAt(i) >= 0x2e80 ? size : size * 0.52;
        return n + Math.max(1, Math.ceil(w / Math.max(1, b.box.w)));
      }, 0);
      if (lines * size * (b.style.lineHeight || 1.25) > b.box.h * 1.4) {
        out.push(['warn', cont.id + '/' + b.id + ': 텍스트가 상자를 크게 넘칩니다']);
      }
    });
  });

  var box = $('#issues');
  box.innerHTML = out.length
    ? out.map(function (o) { return '<div class="' + o[0] + '">' + escH(o[1]) + '</div>'; }).join('')
    : '<div class="ok">즉시 검사 통과 — 저장 후 design check로 전체 검수</div>';
  $('#save').disabled = out.some(function (o) { return o[0] === 'err'; });
}

/* ── 크롬 ─────────────────────────────────────────────────────── */

function markDirty() {
  S.dirty = JSON.stringify({ irs: S.data.irs, tokens: S.data.project.tokens }) !==
            JSON.stringify({ irs: JSON.parse(S.original).irs, tokens: JSON.parse(S.original).project.tokens }) ||
            S.revisions.length > 0;
  $('#dirty').classList.toggle('hidden', !S.dirty);
}

function bindChrome() {
  $$('#sidetabs button').forEach(function (b) { b.onclick = function () { showPane(b.dataset.pane); }; });

  $('#scrub').oninput = function (e) { S.time = (+e.target.value / 1000) * totalMs(); applyTransport(); };
  $('#prev').onclick = function () { S.slide = Math.max(0, S.slide - 1); applyTransport(); };
  $('#next').onclick = function () { S.slide = Math.min((ir().slides || []).length - 1, S.slide + 1); applyTransport(); };
  $('#play').onclick = function () {
    S.playing = !S.playing;
    $('#play').textContent = S.playing ? '❚❚' : '▶';
    var last = performance.now();
    function step(now) {
      if (!S.playing) return;
      S.time = (S.time + (now - last)) % Math.max(1, totalMs());
      last = now; applyTransport(); S.raf = requestAnimationFrame(step);
    }
    if (S.playing) S.raf = requestAnimationFrame(step); else cancelAnimationFrame(S.raf);
  };

  $('#pickmode').onchange = function () {
    $('#frame-wrap').classList.toggle('picking', $('#pickmode').checked);
    if (!$('#pickmode').checked) { S.pickRect = null; drawOverlay(); renderPanes(); }
  };
  bindRegionPick();

  $('#reset').onclick = function () {
    if (S.dirty && !confirm('편집한 내용을 모두 버립니다. 계속할까요?')) return;
    var o = JSON.parse(S.original);
    S.data.irs = o.irs; S.data.project.tokens = o.project.tokens;
    S.revisions = []; S.sel = null; S.pickRect = null;
    rerender(); renderPanes();
  };

  $('#save').onclick = function () {
    var patch = {
      schemaVersion: '1.0',
      project: S.data.project.id,
      generatedAt: new Date().toISOString(),
      tokens: S.data.project.tokens,
      irs: S.data.irs,
      revisions: S.revisions,
    };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }));
    a.download = S.data.project.id + '-studio-patch.json';
    a.click();
  };

  addEventListener('keydown', function (e) {
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { $('#next').click(); }
    if (e.key === 'ArrowLeft') { $('#prev').click(); }
    if (e.key === 'Escape') { S.sel = null; S.pickRect = null; renderPanes(); drawOverlay(); }
  });
}

/** 영역 지정: 오버레이 위에서 끌어 캔버스 좌표계 사각형을 만든다 */
function bindRegionPick() {
  var ov = $('#overlay');
  var start = null;
  ov.addEventListener('mousedown', function (e) {
    if (!$('#pickmode').checked) return;
    var wrap = $('#frame-wrap').getBoundingClientRect();
    start = { x: e.clientX - wrap.left, y: e.clientY - wrap.top };
  });
  addEventListener('mousemove', function (e) {
    if (!start) return;
    var wrap = $('#frame-wrap').getBoundingClientRect();
    var x = e.clientX - wrap.left, y = e.clientY - wrap.top;
    var fr = $('#frame').getBoundingClientRect();
    var sx = Math.min(start.x, x), sy = Math.min(start.y, y);
    var sw = Math.abs(x - start.x), sh = Math.abs(y - start.y);
    S.pickRect = { sx: sx, sy: sy, sw: sw, sh: sh, ir: {
      x: Math.round((sx + wrap.left - fr.left) / S.scale),
      y: Math.round((sy + wrap.top - fr.top) / S.scale),
      w: Math.round(sw / S.scale), h: Math.round(sh / S.scale) } };
    drawOverlay();
  });
  addEventListener('mouseup', function () {
    if (!start) return;
    start = null;
    if (S.pickRect && S.pickRect.sw > 6) { showPane('revise'); renderPanes(); }
  });
}
`;
