#!/usr/bin/env node
/**
 * shorts-batch.mjs · CSV 목록 → 쇼츠 여러 편 (대본→음성→자막→합성을 한 줄씩 순서대로)
 *
 * 사용법:
 *   node skills/shorts-studio/scripts/shorts-batch.mjs --csv batch.csv --out-dir _batch --provider silent
 *   node skills/shorts-studio/scripts/shorts-batch.mjs --csv batch.csv --out-dir _batch --provider edge --yes --font "Malgun Gothic" --fontsdir C:\Windows\Fonts
 *
 * CSV 열(첫 줄은 머리글): id, script, preset, video, title
 *   id      산출 이름(영문·숫자·-_)       예: studio-01
 *   script  대본 .md 경로(shorts-pipeline 형식)
 *   preset  skills/shorts-studio/scripts/shorts-presets.json의 키   예: studio   (비우면 service)
 *   video   배경 영상/이미지 경로(선택). 비우면 단색 배경(리허설)
 *   title   상단 제목 띠(선택)
 * 출력: <out-dir>/<id>/{voiceover.mp3,timeline.json,subs.ass,<id>.mp4}, <out-dir>/report.csv (성공/경고/실패)
 * 한 편이 실패해도 다음 편으로 넘어가고, 마지막에 요약합니다. (병렬 실행은 하지 않습니다: TTS 서버 부하와 승인 범위를 단순하게 유지)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const a = { provider: 'silent', font: 'Malgun Gothic', assets: path.join(HERE, '..', '..', '..', 'assets') };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i], v = () => process.argv[++i];
  if (k === '--csv') a.csv = v(); else if (k === '--out-dir') a.outDir = v(); else if (k === '--provider') a.provider = v();
  else if (k === '--yes') a.yes = true; else if (k === '--font') a.font = v(); else if (k === '--fontsdir') a.fontsdir = v(); else if (k === '--assets') a.assets = v();
}
if (!a.csv || !a.outDir) { console.error('사용법: shorts-batch.mjs --csv batch.csv --out-dir _batch [--provider silent|edge] [--yes]'); process.exit(1); }
if (a.provider === 'edge' && !a.yes && process.env.DESIGN_CLOUD_OK !== '1') { console.error('🛑 --provider edge는 모든 대본 텍스트를 Microsoft Edge 읽어주기 서버로 전송합니다. 승인하시면 --yes를 추가하세요.'); process.exit(2); }

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
  return rows;
}
const rows = parseCsv(fs.readFileSync(a.csv, 'utf8').replace(/^\uFEFF/, ''));
const head = rows.shift().map((h) => h.trim().toLowerCase());
const items = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
const presets = JSON.parse(fs.readFileSync(path.join(HERE, 'shorts-presets.json'), 'utf8'));
const node = process.execPath;
const report = [['id', 'status', 'note']];
fs.mkdirSync(a.outDir, { recursive: true });

for (const it of items) {
  const id = it.id;
  try {
    if (!/^[\w-]+$/.test(id || '')) throw new Error('id는 영문·숫자·-_만 가능합니다');
    if (!it.script || !fs.existsSync(it.script)) throw new Error(`대본 없음: ${it.script}`);
    const p = presets[it.preset || 'service'];
    if (!p) throw new Error(`알 수 없는 preset: ${it.preset}`);
    const dir = path.join(a.outDir, id); fs.mkdirSync(dir, { recursive: true });
    const pipe = ['--script', it.script, '--out-dir', dir, '--provider', a.provider, '--voice', p.voice, '--rate', p.rate, ...(a.yes ? ['--yes'] : [])];
    const out = execFileSync(node, [path.join(HERE, 'shorts-pipeline.mjs'), ...pipe], { encoding: 'utf8' });
    const warns = out.split('\n').filter((l) => l.startsWith('⚠️')).map((l) => l.slice(3).trim());
    execFileSync(node, [path.join(HERE, 'subtitle-ass.mjs'), '--timeline', path.join(dir, 'timeline.json'), '--out', path.join(dir, 'subs.ass'),
      '--preset', p.caption, '--font', a.font, '--hl', p.hl, '--em', p.em, ...(it.title ? ['--title', it.title] : [])]);
    const comp = ['--voiceover', path.join(dir, 'voiceover.mp3'), '--ass', path.join(dir, 'subs.ass'), '--out', path.join(dir, `${id}.mp4`)];
    if (it.video) comp.push(/\.(png|jpe?g|webp)$/i.test(it.video) ? '--image' : '--video', it.video);
    const bgm = path.join(a.assets, p.bgm); if (fs.existsSync(bgm)) comp.push('--bgm', bgm);
    if (a.fontsdir) comp.push('--fontsdir', a.fontsdir);
    execFileSync(node, [path.join(HERE, 'shorts-compose.mjs'), ...comp], { stdio: 'pipe' });
    report.push([id, warns.length ? 'warn' : 'ok', warns.join(' | ')]);
    console.log(`${warns.length ? '⚠️ ' : '✅'} ${id}${warns.length ? ' · ' + warns.join(' | ') : ''}`);
  } catch (e) {
    const msg = String(e.stderr || e.message || e).split('\n').filter(Boolean).pop();
    report.push([id || '(id 없음)', 'fail', msg]); console.log(`❌ ${id}: ${msg}`);
  }
}
fs.writeFileSync(path.join(a.outDir, 'report.csv'), '\uFEFF' + report.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
const ok = report.filter((r) => r[1] === 'ok').length, w = report.filter((r) => r[1] === 'warn').length, f = report.filter((r) => r[1] === 'fail').length;
console.log(`\n완료: 성공 ${ok} · 경고 ${w} · 실패 ${f} → ${path.join(a.outDir, 'report.csv')}`);
process.exit(f ? 1 : 0);
