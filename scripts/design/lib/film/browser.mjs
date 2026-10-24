/** NeoDesign's local page sampler. This is NOT the OpenFilm host or renderer. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { checkFilmPlan, localFile } from './plan.mjs';
export { localFile } from './plan.mjs';

const require = createRequire(import.meta.url);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const finding = (check, message) => ({ check, message });
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.gif':'image/gif', '.mp4':'video/mp4', '.webm':'video/webm', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.vtt':'text/vtt', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.bin':'application/octet-stream' };

function dependencies() {
  try { return { chromium: require('playwright').chromium, sharp: require('sharp') }; }
  catch (cause) { const e = new Error('film 브라우저 검수에는 playwright·sharp와 Chromium이 필요합니다. package.json의 의존성을 설치하고 브라우저 경로를 확인하세요.', { cause }); e.exitCode = 5; throw e; }
}

async function launch(chromium) {
  try { return await chromium.launch({ headless: true }); }
  catch (cause) { const e = new Error(`Chromium 시작 실패: ${cause.message}`); e.exitCode = 5; throw e; }
}

async function bounded(promise, label, ms = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: ${ms}ms 시간 초과`)), ms); })]); }
  finally { clearTimeout(timer); }
}

// The baseline records only the person's protected edits; unrelated additions remain editable.
export async function inspectFilm(dir) {
  const html = fs.readFileSync(localFile(dir, 'film.html'), 'utf8');
  const { chromium } = dependencies();
  const browser = await launch(chromium);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    return await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const errors = [];
      const tracks = [...doc.body.children];
      const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content');
      if (viewport && (!/\bwidth\s*=\s*\d+/.test(viewport) || !/\bheight\s*=\s*\d+/.test(viewport))) errors.push({check:'film.viewport',message:'film.html의 viewport에는 숫자 width와 height를 함께 적습니다.'});
      if (doc.querySelector('script')) errors.push({ check:'film.script', message:'film.html에는 script를 넣지 않습니다. 장면 코드는 샷 페이지로 옮기세요.' });
      if (!tracks.length || tracks.some(x => x.tagName !== 'SECTION')) errors.push({ check:'film.tracks', message:'film.html body의 직접 자식은 section 트랙이어야 합니다.' });
      const ids = new Set(), edits = [], lockedTracks = [], clips = [];
      tracks.forEach((track, index) => {
        const key = track.id ? `id:${track.id}` : `track:${index}`;
        if (track.hasAttribute('locked')) lockedTracks.push({ key, index, html:track.outerHTML });
        [...track.children].forEach(clip => {
          if (!['IFRAME','VIDEO','IMG','AUDIO'].includes(clip.tagName)) errors.push({ check:'film.clip', message:`지원하지 않는 클립: ${clip.tagName}` });
          if (clip.hasAttribute('width') || clip.hasAttribute('height')) errors.push({check:'film.clipSize',message:`${clip.id}: 클립의 width/height 속성 대신 허용된 style 또는 size를 사용하세요.`});
          if (!clip.id || ids.has(clip.id)) errors.push({ check:'film.clipId', message:'부분 수정 추적을 위해 모든 클립에 고유 id가 필요합니다.' });
          ids.add(clip.id);
          clips.push({id:clip.id,tag:clip.tagName,src:clip.getAttribute('src') || ''});
          const edit = { key:clip.id };
          if (clip.hasAttribute('size')) edit.size = clip.getAttribute('size');
          if (clip.hasAttribute('overrides')) {
            try { edit.overrides = JSON.parse(clip.getAttribute('overrides')); if (!Array.isArray(edit.overrides)) throw new Error(); }
            catch { errors.push({ check:'film.overrides', message:`${clip.id}: overrides는 JSON 배열이어야 합니다.` }); }
          }
          if ('size' in edit || 'overrides' in edit) edits.push(edit);
        });
      });
      return { errors, clips, protection: { schemaVersion:'1.0', lockedTracks, edits } };
    }, html);
  } finally { await browser.close(); }
}

/** NeoDesign convention: a planned shot id identifies its iframe clip. This is not the full OpenFilm parser. */
export function compareTimeline(plan, clips) {
  const errors = [], warnings = [], starts = {};
  for (const shot of plan.shots) {
    const clip = clips.find(x => x.id === shot.id && x.tag === 'IFRAME');
    if (!clip) { errors.push(finding('film.timeline.shot',`${shot.id}: 계획에 대응하는 iframe 클립이 없습니다.`)); continue; }
    const [file,fragment = ''] = clip.src.split('#');
    if (path.posix.normalize(file.replaceAll('\\','/')) !== path.posix.normalize(shot.page.replaceAll('\\','/'))) errors.push(finding('film.timeline.source',`${shot.id}: film.html의 src와 계획의 page가 다릅니다.`));
    let start = 0;
    if (fragment) {
      const match = /^t=(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(fragment);
      if (!match) errors.push(finding('film.timeline.fragment',`${shot.id}: 지원하지 않는 미디어 구간입니다.`));
      else {
        start = Number(match[1]);
        if (match[2] !== undefined && Math.abs(Number(match[2])-start-shot.duration) > 0.001) errors.push(finding('film.timeline.duration',`${shot.id}: 클립 사용 구간과 계획의 duration이 다릅니다.`));
      }
    }
    starts[shot.id] = start;
  }
  for (const clip of clips.filter(x=>x.tag==='IFRAME')) if (!plan.shots.some(x=>x.id===clip.id)) warnings.push(finding('film.timeline.unplanned',`${clip.id}: 계획에 없는 페이지는 샷 표본 검사에서 제외됩니다.`));
  return {errors,warnings,starts};
}

const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);

export function compareProtection(baseline, current) {
  const errors = [];
  if (baseline?.schemaVersion !== '1.0' || !Array.isArray(baseline.lockedTracks) || !Array.isArray(baseline.edits)) return [finding('film.baseline', '지원하지 않거나 손상된 보호 스냅샷입니다.')];
  for (const field of ['lockedTracks','edits']) {
    for (const old of baseline[field]) {
      const next = current[field].find(x => x.key === old.key);
      // Extra manual properties are allowed, but existing protected properties cannot disappear/change.
      if (!next || Object.keys(old).some(k => canonical(old[k]) !== canonical(next[k]))) errors.push(finding(`film.protected.${field}`, `${old.key}: 보호된 사용자 편집이 바뀌거나 없어졌습니다. 이전 버전과 대조하세요.`));
    }
  }
  return errors;
}

export function comparePixels(a, b, { delta = 3, fraction = 0.0001 } = {}) {
  if (a.length !== b.length || a.length % 4) return { ok:false, changedFraction:1, maxDelta:255 };
  let changed = 0, maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i+c] - b[i+c]));
    maxDelta = Math.max(maxDelta, d);
    if (d > delta) changed++;
  }
  const changedFraction = changed / (a.length / 4 || 1);
  return { ok:changedFraction <= fraction, changedFraction, maxDelta };
}

export function sampleTimes(duration, count = 12) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(count) || count < 2 || count > 60) throw new Error('duration은 양수, count는 2~60의 정수여야 합니다.');
  return Array.from({ length:count }, (_, i) => i * Math.max(0, duration - Math.min(0.001, duration / 1000)) / (count - 1));
}

export function shuffledIndices(count, seed) {
  const order = Array.from({ length:count }, (_, i) => i);
  let state = seed >>> 0;
  for (let i = count - 1; i > 0; i--) { state = (Math.imul(state,1664525) + 1013904223) >>> 0; const j = state % (i+1); [order[i],order[j]] = [order[j],order[i]]; }
  return order;
}

async function serve(root) {
  const server = http.createServer((req, res) => {
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//,'');
      const file = localFile(root, rel);
      const type = mime[path.extname(file).toLowerCase()];
      if (!type) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  return { origin:`http://127.0.0.1:${server.address().port}`, close:() => new Promise(resolve => server.close(resolve)) };
}

/** Samples raw shot pages, without timeline composition, overrides, audio or host clock shims. */
export async function sampleFilm(dir, { out, count = 12 } = {}) {
  const checked = checkFilmPlan(dir);
  if (!checked.ok) { const e = new Error(`샷 계획 검사 실패: ${checked.errors.map(x => x.message).join('; ')}`); e.exitCode = 4; throw e; }
  const plan = JSON.parse(fs.readFileSync(localFile(dir,'film-plan.json'),'utf8'));
  if (plan.canvas.width * plan.canvas.height > 16777216) throw new Error('표본 검수 캔버스는 16,777,216픽셀 이하로 줄이세요. 최종 렌더 해상도와 별개입니다.');
  out = path.resolve(out || path.join(dir,'out',`film-sample-${Date.now()}`));
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error(`비어 있지 않은 출력 폴더를 덮어쓰지 않습니다: ${out}`);
  const { chromium, sharp } = dependencies();
  const server = await serve(dir);
  let browser;
  const errors = [], warnings = [], shots = [];
  try {
    browser = await launch(chromium);
    fs.mkdirSync(out,{recursive:true});
    const inspected = await inspectFilm(dir);
    const timeline = compareTimeline(plan,inspected.clips);
    errors.push(...inspected.errors,...timeline.errors);
    warnings.push(...timeline.warnings);
    const context = await browser.newContext({ viewport:{ width:plan.canvas.width, height:plan.canvas.height }, deviceScaleFactor:1, serviceWorkers:'block' });
    await context.addInitScript(() => { window.filmHost = {version:'0.1',name:'neodesign-page-sampler',clockVirtualization:false}; });
    await context.route('**/*', route => {
      const req = route.request();
      if (new URL(req.url()).origin === server.origin && ['GET','HEAD'].includes(req.method())) return route.continue();
      errors.push(finding('film.externalRequest', `검수 중 외부 또는 쓰기 요청을 차단했습니다: ${new URL(req.url()).origin}`));
      return route.abort();
    });
    if (context.routeWebSocket) await context.routeWebSocket('**/*', socket => { errors.push(finding('film.websocket','검수 중 WebSocket 연결을 차단했습니다.')); socket.close(); });
    for (const shot of plan.shots) {
      if (errors.length) break;
      const times = sampleTimes(shot.duration,count).map(t=>t+(timeline.starts[shot.id] || 0));
      const page = await context.newPage();
      const shotErrors = [];
      const frameHashes = [], frames = [];
      page.on('pageerror', e => shotErrors.push(finding('film.pageError', `${shot.id}: ${e.message}`)));
      page.on('response', r => { if (r.status() >= 400) shotErrors.push(finding('film.resource',`${shot.id}: 로컬 자산 HTTP ${r.status()}`)); });
      try {
        localFile(dir,shot.page);
        await page.goto(`${server.origin}/${shot.page.replaceAll('\\','/').split('/').map(encodeURIComponent).join('/')}`, { waitUntil:'load', timeout:15000 });
        await bounded(page.waitForFunction(() => typeof window.film?.frame === 'function', null, {timeout:10000}),`${shot.id} frame 계약`);
        await bounded(page.evaluate(async () => { const ready = window.film.ready; await (typeof ready === 'function' ? ready() : ready); await document.fonts.ready; }),`${shot.id} ready`);
        const duration = await page.evaluate(() => window.film.duration ?? null);
        if (duration !== null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0)) throw new Error('선언된 film.duration은 유한한 양수여야 합니다.');
        if (duration !== null && times.at(-1) >= duration) warnings.push(finding('film.page.hold',`${shot.id}: 샷 구간이 페이지 duration보다 길어 마지막 프레임을 유지합니다.`));
        for (const round of [0,1]) {
          for (const index of shuffledIndices(count, round ? 918273 : 273819)) {
            const t = duration === null ? times[index] : Math.min(times[index],Math.max(0,duration-Math.min(0.001,duration/1000)));
            await bounded(page.evaluate(async t => { await window.film.frame(t); },t),`${shot.id} frame(${t})`);
            const png = await page.screenshot({ timeout:10000 });
            const raw = await sharp(png).ensureAlpha().raw().toBuffer();
            if (round === 0) {
              frames[index] = png; frameHashes[index] = hash(png);
              fs.writeFileSync(path.join(out,`${shot.id}-${String(index).padStart(2,'0')}.png`),png);
            } else {
              const first = await sharp(frames[index]).ensureAlpha().raw().toBuffer();
              const diff = comparePixels(first,raw);
              if (!diff.ok) shotErrors.push(finding('film.orderDependent',`${shot.id} t=${t.toFixed(3)}: 호출 순서에 따라 화면 변화 (${(diff.changedFraction*100).toFixed(4)}%).`));
            }
          }
        }
        const tiles = await Promise.all(frames.map(async (png,i) => ({ input:await sharp(png).resize(320,180,{fit:'contain',background:'#111827'}).extend({top:24,bottom:0,left:0,right:0,background:'#111827'}).composite([{input:Buffer.from(`<svg width="320" height="24"><text x="8" y="17" fill="white" font-size="13">${i+1} / t=${times[i].toFixed(3)}s</text></svg>`),top:0,left:0}]).png().toBuffer(), left:(i%4)*320,top:Math.floor(i/4)*204 })));
        await sharp({create:{width:1280,height:Math.ceil(count/4)*204,channels:4,background:'#111827'}}).composite(tiles).png().toFile(path.join(out,`${shot.id}-contact-sheet.png`));
      } catch(e) { shotErrors.push(finding('film.runtime',`${shot.id}: ${e.message}`)); }
      finally { await page.close(); }
      errors.push(...shotErrors);
      shots.push({id:shot.id,times,frameHashes,errors:shotErrors});
    }
    warnings.push(finding('film.scope','샷 페이지 표본 검사입니다. 합성 film.html·overrides 적용·오디오·자막·내용은 최종 재생으로 별도 확인하세요. OpenFilm의 시계·난수·미디어 프레임 가상화를 제공하지 않으므로 해당 기능에 의존하는 샷은 실제 OpenFilm look에서 확인하세요.'));
    const report = { schemaVersion:'1.0', checker:'neodesign-page-sampler', ok:errors.length===0, samplesPerShot:count, rounds:2, tolerance:{channelDelta:3,changedPixelFraction:0.0001}, shots, errors, warnings };
    fs.writeFileSync(path.join(out,'film-sample-report.json'),JSON.stringify(report,null,2)+'\n');
    return {...report,out};
  } finally { if (browser) await browser.close(); await server.close(); }
}
