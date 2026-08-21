/**
 * whiteboard/annotate.mjs — 브라우저 주석 편집기
 *
 * 원본 저장소의 로컬 편집기는 File System Access API로 원본 파일을 직접 덮어썼다.
 * Chrome·Edge에서만 되고, 실수로 저장하면 되돌릴 수 없다. 여기서는 **편집 결과를
 * JSON으로 내려받게** 하고, `design whiteboard annotate --apply <파일>`로 반영한다.
 * 어느 브라우저에서든 되고, 반영 전에 스키마·마스크 검사를 한 번 더 통과해야 한다.
 *
 * 편집할 수 있는 것: 영역(드래그·리사이즈), 등장 순서, 시작·종료 시각, 자막, 필기 모드.
 */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderAnnotator(ir, { title = '장면 주석 편집기' } = {}) {
  const canvas = { width: 1920, height: 1080, fps: 30, ...(ir.canvas || {}) };
  const data = JSON.stringify({ canvas, scenes: ir.scenes || [], id: ir.id, title: ir.title });

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(ir.title || ir.id)}</title>
<style>
  :root { --bg:#0e1116; --surface:#161b22; --line:#262c36; --fg:#e6edf3; --muted:#8b949e;
          --accent:#58a6ff; --warn:#d29922; --err:#f85149; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); display:flex; height:100vh; overflow:hidden;
         font:14px/1.55 -apple-system,"Pretendard","Noto Sans KR","Segoe UI",system-ui,sans-serif; }
  #left { flex:1; display:flex; flex-direction:column; min-width:0; }
  #stagewrap { flex:1; position:relative; overflow:hidden; background:#05070a; }
  #stage { position:absolute; transform-origin:top left; background:var(--bg);
           width:${canvas.width}px; height:${canvas.height}px; }
  .region { position:absolute; border:2px solid var(--accent); background:rgba(88,166,255,.08);
            cursor:move; user-select:none; }
  .region.sel { border-color:var(--warn); background:rgba(210,153,34,.14); z-index:5; }
  .region .lbl { position:absolute; top:-30px; left:0; font-size:15px; color:var(--accent);
                 white-space:nowrap; background:var(--bg); padding:1px 8px; border-radius:4px; }
  .region.sel .lbl { color:var(--warn); }
  .region .txt { padding:10px 14px; font-size:26px; color:var(--fg); overflow:hidden;
                 pointer-events:none; line-height:1.4; }
  .region .h { position:absolute; width:16px; height:16px; right:-8px; bottom:-8px;
               background:var(--accent); border-radius:3px; cursor:nwse-resize; }
  .prot { position:absolute; border:1px dashed var(--err); background:repeating-linear-gradient(45deg,
          rgba(248,81,73,.10) 0 8px, transparent 8px 16px); pointer-events:none; z-index:1; }
  #bar { display:flex; align-items:center; gap:14px; padding:10px 16px; border-top:1px solid var(--line);
         background:var(--surface); flex-wrap:wrap; }
  #bar input[type=range] { flex:1; min-width:220px; accent-color:var(--accent); }
  #right { width:380px; border-left:1px solid var(--line); background:var(--surface);
           display:flex; flex-direction:column; }
  #right header { padding:16px; border-bottom:1px solid var(--line); }
  #right h1 { font-size:16px; margin:0 0 4px; }
  #right .sub { color:var(--muted); font-size:12px; }
  #panel { flex:1; overflow:auto; padding:16px; }
  .grp { margin-bottom:22px; }
  .grp h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
            margin:0 0 8px; font-weight:600; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; }
  input[type=text], input[type=number], textarea, select {
    width:100%; background:var(--bg); color:var(--fg); border:1px solid var(--line);
    border-radius:6px; padding:7px 10px; font:inherit; font-size:13px; }
  textarea { resize:vertical; min-height:64px; }
  .row { display:flex; gap:8px; }
  .row > * { flex:1; min-width:0; }
  button { background:var(--accent); color:#0b1220; border:0; border-radius:6px; padding:9px 14px;
           font:inherit; font-weight:600; cursor:pointer; }
  button.ghost { background:transparent; color:var(--fg); border:1px solid var(--line); font-weight:400; }
  button:disabled { opacity:.4; cursor:default; }
  .scenelist { display:flex; flex-direction:column; gap:4px; }
  .scenelist button { text-align:left; background:transparent; border:1px solid var(--line);
                      color:var(--fg); font-weight:400; font-size:12.5px; padding:8px 10px; }
  .scenelist button.on { border-color:var(--accent); color:var(--accent); }
  .layerlist { display:flex; flex-direction:column; gap:4px; }
  .layerlist .item { display:flex; gap:6px; align-items:center; }
  .layerlist .item button:first-child { flex:1; }
  #issues { font-size:12px; }
  #issues div { padding:6px 9px; border-radius:5px; margin-bottom:5px; }
  #issues .err { background:rgba(248,81,73,.14); color:var(--err); }
  #issues .ok { background:rgba(63,185,80,.14); color:#3fb950; }
  footer { padding:14px 16px; border-top:1px solid var(--line); display:flex; gap:8px; }
  kbd { background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-size:11px; }
</style>
</head>
<body>
<div id="left">
  <div id="stagewrap"><div id="stage"></div></div>
  <div id="bar">
    <button class="ghost" id="play">▶ 재생</button>
    <input type="range" id="time" min="0" max="1000" value="0">
    <span id="clock" style="font-variant-numeric:tabular-nums; color:var(--muted); min-width:96px">0.00s</span>
  </div>
</div>

<div id="right">
  <header>
    <h1>장면 주석</h1>
    <div class="sub">영역을 끌어 옮기고 <kbd>↑</kbd><kbd>↓</kbd>로 순서를 바꾸세요. 보호 영역(빗금)은 순서에서 자동으로 계산됩니다.</div>
  </header>
  <div id="panel">
    <div class="grp"><h2>장면</h2><div class="scenelist" id="scenes"></div></div>
    <div class="grp"><h2>요소</h2><div class="layerlist" id="layers"></div></div>
    <div class="grp" id="editor"></div>
    <div class="grp"><h2>검사</h2><div id="issues"></div></div>
  </div>
  <footer>
    <button id="save">주석 JSON 내려받기</button>
    <button class="ghost" id="reset">되돌리기</button>
  </footer>
</div>

<script>
const DATA = ${data};
const original = JSON.stringify(DATA);
let doc = JSON.parse(original);
let si = 0, li = 0, playing = false, t = 0, raf = null;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), wrap = $('stagewrap');

function fit() {
  const s = Math.min(wrap.clientWidth / doc.canvas.width, wrap.clientHeight / doc.canvas.height) * 0.94;
  stage.style.transform = 'scale(' + s + ')';
  stage.style.left = ((wrap.clientWidth - doc.canvas.width * s) / 2) + 'px';
  stage.style.top = ((wrap.clientHeight - doc.canvas.height * s) / 2) + 'px';
  stage.dataset.scale = s;
}
addEventListener('resize', fit);

const scene = () => doc.scenes[si];
const layer = () => scene() && scene().layers[li];
const totalMs = () => doc.scenes.reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0);

function intersects(a, b) {
  return Math.min(a.x+a.w, b.x+b.w) > Math.max(a.x, b.x) && Math.min(a.y+a.h, b.y+b.h) > Math.max(a.y, b.y);
}

/** 순서가 바뀌면 보호 영역을 다시 계산한다. 사람이 손으로 관리할 정보가 아니다. */
function recomputeProtection() {
  for (const sc of doc.scenes) {
    sc.layers.forEach((l, i) => {
      const later = sc.layers.slice(i + 1).map(x => x.region).filter(Boolean);
      const prot = l.region ? later.filter(r => intersects(l.region, r)) : [];
      if (prot.length) l.protectedRegions = prot; else delete l.protectedRegions;
    });
  }
}

function drawStage() {
  stage.innerHTML = '';
  const sc = scene();
  if (!sc) return;
  sc.layers.forEach((l, i) => {
    if (!l.region) return;
    if (i === li) for (const p of (l.protectedRegions || [])) {
      const d = document.createElement('div');
      d.className = 'prot';
      Object.assign(d.style, { left: p.x+'px', top: p.y+'px', width: p.w+'px', height: p.h+'px' });
      stage.appendChild(d);
    }
    const el = document.createElement('div');
    el.className = 'region' + (i === li ? ' sel' : '');
    Object.assign(el.style, { left: l.region.x+'px', top: l.region.y+'px', width: l.region.w+'px', height: l.region.h+'px' });
    el.innerHTML = '<div class="lbl">' + (i+1) + ' · ' + l.id + '</div>' +
      '<div class="txt">' + escapeHtml((l.block && l.block.text) || (l.render && l.render.art && l.render.art.text && l.render.art.text.content) || '') + '</div>' +
      '<div class="h"></div>';
    el.onmousedown = (e) => startDrag(e, i, e.target.classList.contains('h'));
    stage.appendChild(el);
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function startDrag(e, idx, resize) {
  e.preventDefault();
  li = idx; renderAll();
  const l = scene().layers[idx], s = +stage.dataset.scale || 1;
  const x0 = e.clientX, y0 = e.clientY, r0 = { ...l.region };
  const move = (ev) => {
    const dx = Math.round((ev.clientX - x0) / s), dy = Math.round((ev.clientY - y0) / s);
    if (resize) { l.region.w = Math.max(40, r0.w + dx); l.region.h = Math.max(40, r0.h + dy); }
    else { l.region.x = r0.x + dx; l.region.y = r0.y + dy; }
    recomputeProtection(); drawStage(); renderEditor(); check();
  };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
  addEventListener('mousemove', move); addEventListener('mouseup', up);
}

function renderScenes() {
  $('scenes').innerHTML = doc.scenes.map((s, i) =>
    '<button class="' + (i === si ? 'on' : '') + '" data-i="' + i + '">' +
    (i+1) + '. ' + s.id + ' <span style="color:var(--muted)">' + (s.durationMs/1000).toFixed(1) + 's · ' +
    s.layers.length + '요소</span></button>').join('');
  $('scenes').querySelectorAll('button').forEach(b =>
    b.onclick = () => { si = +b.dataset.i; li = 0; t = doc.scenes[si].startMs; renderAll(); });
}

function renderLayers() {
  const sc = scene();
  $('layers').innerHTML = sc.layers.map((l, i) =>
    '<div class="item"><button class="' + (i === li ? 'on' : '') + '" data-i="' + i + '">' +
    (i+1) + '. ' + l.id + '</button>' +
    '<button class="ghost" data-up="' + i + '" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
    '<button class="ghost" data-dn="' + i + '" ' + (i === sc.layers.length-1 ? 'disabled' : '') + '>↓</button></div>').join('');
  $('layers').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { li = +b.dataset.i; renderAll(); });
  $('layers').querySelectorAll('[data-up]').forEach(b => b.onclick = () => reorder(+b.dataset.up, -1));
  $('layers').querySelectorAll('[data-dn]').forEach(b => b.onclick = () => reorder(+b.dataset.dn, 1));
}

function reorder(i, dir) {
  const a = scene().layers;
  const j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  li = j;
  recomputeProtection(); renderAll();
}

function renderEditor() {
  const l = layer(), sc = scene();
  if (!l) { $('editor').innerHTML = ''; return; }
  const text = (l.render && l.render.art && l.render.art.text && l.render.art.text.content) || (l.block && l.block.text) || '';
  $('editor').innerHTML =
    '<h2>선택한 요소 · ' + l.id + '</h2>' +
    '<label>자막 / 본문</label><textarea id="f-text">' + escapeHtml(text) + '</textarea>' +
    '<div class="row"><div><label>등장 (ms)</label><input type="number" id="f-enter" value="' + (l.enterMs||0) + '" step="100"></div>' +
    '<div><label>퇴장 (ms)</label><input type="number" id="f-exit" value="' + (l.exitMs != null ? l.exitMs : sc.durationMs) + '" step="100"></div></div>' +
    '<div class="row"><div><label>필기 모드</label><select id="f-mode">' +
      ['skeleton','grid'].map(m => '<option value="' + m + '"' + ((l.render&&l.render.mode)===m?' selected':'') + '>' + m + '</option>').join('') +
      '</select></div><div><label>쓸어내는 방향</label><select id="f-sweep">' +
      ['left-right','right-left','top-bottom','bottom-top'].map(m => '<option value="' + m + '"' + ((l.render&&l.render.sweep)===m?' selected':'') + '>' + m + '</option>').join('') +
      '</select></div></div>' +
    '<div class="row"><div><label>x</label><input type="number" id="f-x" value="' + l.region.x + '"></div>' +
    '<div><label>y</label><input type="number" id="f-y" value="' + l.region.y + '"></div>' +
    '<div><label>w</label><input type="number" id="f-w" value="' + l.region.w + '"></div>' +
    '<div><label>h</label><input type="number" id="f-h" value="' + l.region.h + '"></div></div>' +
    '<label>장면 자막 (scene.subtitle)</label><textarea id="f-sub">' + escapeHtml(sc.subtitle || '') + '</textarea>';

  const bind = (id, fn) => { const e = $(id); if (e) e.oninput = () => { fn(e.value); recomputeProtection(); drawStage(); check(); }; };
  bind('f-text', v => {
    if (l.render && l.render.art && l.render.art.text) l.render.art.text.content = v;
    if (l.block) { l.block.text = v; l.block.alt = v; }
  });
  bind('f-enter', v => l.enterMs = +v || 0);
  bind('f-exit', v => l.exitMs = +v || 0);
  bind('f-mode', v => { l.render = l.render || { plugin: 'whiteboard' }; l.render.mode = v; });
  bind('f-sweep', v => { l.render = l.render || { plugin: 'whiteboard' }; l.render.sweep = v; });
  for (const k of ['x','y','w','h']) bind('f-' + k, v => l.region[k] = Math.round(+v || 0));
  bind('f-sub', v => sc.subtitle = v);
}

/** 편집 중에도 검사가 돈다. 저장한 뒤에 틀렸다는 걸 아는 것보다 낫다. */
function check() {
  const out = [];
  const C = doc.canvas;
  for (const sc of doc.scenes) {
    sc.layers.forEach((l, i) => {
      const r = l.region;
      if (!r) return;
      if (r.x < 0 || r.y < 0 || r.x + r.w > C.width || r.y + r.h > C.height)
        out.push(sc.id + '/' + l.id + ': 영역이 캔버스 밖으로 나갑니다');
      if ((l.exitMs != null ? l.exitMs : sc.durationMs) <= (l.enterMs || 0))
        out.push(sc.id + '/' + l.id + ': 퇴장이 등장보다 빠릅니다');
      if ((l.enterMs || 0) > sc.durationMs)
        out.push(sc.id + '/' + l.id + ': 등장이 장면 길이를 넘어 화면에 나오지 않습니다');
      for (const other of sc.layers.slice(i + 1)) {
        if (!other.region || !intersects(r, other.region)) continue;
        const ok = (l.protectedRegions || []).some(p =>
          p.x === other.region.x && p.y === other.region.y && p.w === other.region.w && p.h === other.region.h);
        if (!ok) out.push(sc.id + '/' + l.id + ': ' + other.id + '가 미리 드러납니다');
      }
    });
  }
  $('issues').innerHTML = out.length
    ? out.map(m => '<div class="err">' + escapeHtml(m) + '</div>').join('')
    : '<div class="ok">문제 없음</div>';
  $('save').disabled = out.length > 0;
}

function renderTime() {
  const sc = doc.scenes.find(s => t >= s.startMs && t < s.startMs + s.durationMs);
  if (sc) { const i = doc.scenes.indexOf(sc); if (i !== si) { si = i; li = 0; renderScenes(); renderLayers(); renderEditor(); drawStage(); } }
  $('clock').textContent = (t / 1000).toFixed(2) + 's / ' + (totalMs() / 1000).toFixed(2) + 's';
  $('time').value = Math.round((t / Math.max(1, totalMs())) * 1000);
}

function renderAll() { renderScenes(); renderLayers(); renderEditor(); drawStage(); renderTime(); check(); fit(); }

$('time').oninput = (e) => { t = (+e.target.value / 1000) * totalMs(); renderTime(); };
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? '❚❚ 정지' : '▶ 재생';
  let last = performance.now();
  const step = (now) => {
    if (!playing) return;
    t = (t + (now - last)) % Math.max(1, totalMs());
    last = now; renderTime(); raf = requestAnimationFrame(step);
  };
  if (playing) raf = requestAnimationFrame(step); else cancelAnimationFrame(raf);
};
$('reset').onclick = () => { doc = JSON.parse(original); si = 0; li = 0; t = 0; renderAll(); };
$('save').onclick = () => {
  recomputeProtection();
  const blob = new Blob([JSON.stringify({ id: doc.id, canvas: doc.canvas, scenes: doc.scenes }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = doc.id + '-annotation.json';
  a.click();
};
addEventListener('keydown', (e) => {
  if (/input|textarea|select/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowUp') { e.preventDefault(); reorder(li, -1); }
  if (e.key === 'ArrowDown') { e.preventDefault(); reorder(li, 1); }
});

recomputeProtection();
renderAll();
</script>
</body>
</html>
`;
}
