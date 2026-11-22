#!/usr/bin/env node
/**
 * tts-edge.mjs · 한국어 무료 TTS (Edge 읽어주기 엔진, 비공식 클라이언트 edge-tts 사용)
 *
 * ⚠️ 선택적 클라우드 기능: 합성할 텍스트가 Microsoft Edge 읽어주기 서버(speech.platform.bing.com)로 전송됩니다.
 * edge-tts는 이 서버를 쓰는 비공식 오픈소스 클라이언트이며, 가용성·품질·약관은 Microsoft 정책에 따라 바뀔 수 있습니다.
 * 상업 납품·장기 운영에는 공식 Azure Speech(키 필요) 사용을 권장합니다. API 키는 필요 없습니다.
 * 최초 호출 시 --yes 또는 DESIGN_CLOUD_OK=1 로 명시적으로 승인해야 합니다. 데이터 흐름은 SECURITY.md 참조.
 *
 * 사용법:
 *   node skills/shorts-studio/scripts/cloud/tts-edge.mjs --text "안녕하세요" --out demo.mp3 --yes
 *   node skills/shorts-studio/scripts/cloud/tts-edge.mjs --text-file script.txt --out out.mp3 --voice ko-KR-InJoonNeural --rate +10% --yes
 *   node skills/shorts-studio/scripts/cloud/tts-edge.mjs --list-voices --yes        # 한국어 음색 목록
 *
 * 출력: mp3 + stdout 한 줄 JSON {"path","duration","sentences":[{text,start,end}]|null,"provider":"edge"}
 *   sentences는 edge-tts가 돌려주는 문장 경계(VTT)에서 읽은 값입니다. 경계를 못 받으면 null (호출자가 추정).
 *
 * 의존성: Node 18+, Python 3 + `pip install edge-tts`, ffprobe
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const ALLOWED_HOST = 'speech.platform.bing.com'; // edge-tts가 접속하는 유일한 호스트(문서화용)

function parseArgs(argv) {
  const a = { voice: 'ko-KR-SunHiNeural', rate: '+0%', pitch: '+0Hz', volume: '+0%' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--text') a.text = v();
    else if (k === '--text-file') a.textFile = v();
    else if (k === '--out') a.out = v();
    else if (k === '--voice') a.voice = v();
    else if (k === '--rate') a.rate = v();
    else if (k === '--pitch') a.pitch = v();
    else if (k === '--volume') a.volume = v();
    else if (k === '--list-voices') a.list = true;
    else if (k === '--yes') a.yes = true;
    else if (k === '--help' || k === '-h') a.help = true;
  }
  return a;
}

function findPython() {
  for (const cand of [process.env.PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
    const r = spawnSync(cand, ['-c', 'import edge_tts'], { encoding: 'utf8' });
    if (r.status === 0) return cand;
  }
  return null;
}

function vttTime(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d+):(\d+)[.,](\d+)$/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]);
}

export function parseVtt(vtt) {
  const out = [];
  const blocks = vtt.replace(/\r/g, '').split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [s, e] = lines[ti].split('-->');
    const text = lines.slice(ti + 1).join(' ').trim();
    const start = vttTime(s), end = vttTime(e.trim().split(/\s+/)[0]);
    if (text && Number.isFinite(start) && Number.isFinite(end)) out.push({ text, start: +start.toFixed(3), end: +end.toFixed(3) });
  }
  return out;
}

function duration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim());
}

function main() {
  const a = parseArgs(process.argv);
  if (a.help || (!a.list && !a.out)) {
    console.error('사용법: tts-edge.mjs --text "..." | --text-file f.txt --out out.mp3 [--voice ko-KR-SunHiNeural] [--rate +0%] --yes\n        tts-edge.mjs --list-voices --yes');
    process.exit(a.help ? 0 : 1);
  }
  if (!a.yes && process.env.DESIGN_CLOUD_OK !== '1') {
    console.error(`🛑 이 작업은 합성할 텍스트를 Microsoft Edge 읽어주기 서버(${ALLOWED_HOST})로 전송합니다.\n` +
      '확인되면 다시 실행하고 --yes를 추가하거나 DESIGN_CLOUD_OK=1을 설정하세요. (SECURITY.md 참조)');
    process.exit(2);
  }
  const py = findPython();
  if (!py) {
    console.error('edge-tts를 찾지 못했습니다. `pip install edge-tts` 후 다시 실행하세요. (Windows는 `py -m pip install edge-tts`)');
    process.exit(3);
  }
  if (a.list) {
    const out = execFileSync(py, ['-m', 'edge_tts', '--list-voices'], { encoding: 'utf8' });
    console.log(out.split('\n').filter((l) => /^ko-KR/.test(l) || /^Name/.test(l)).join('\n'));
    return;
  }
  let text = a.text;
  if (!text && a.textFile) text = fs.readFileSync(a.textFile, 'utf8');
  if (!text || !text.trim()) { console.error('텍스트가 비어 있습니다.'); process.exit(1); }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-edge-'));
  const tf = path.join(tmp, 'in.txt');
  const vtt = path.join(tmp, 'out.vtt');
  fs.writeFileSync(tf, text.trim(), 'utf8');
  fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
  const args = ['-m', 'edge_tts', '--file', tf, '--voice', a.voice, `--rate=${a.rate}`, `--pitch=${a.pitch}`,
    `--volume=${a.volume}`, '--write-media', a.out, '--write-subtitles', vtt];
  const r = spawnSync(py, args, { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(a.out)) {
    console.error('edge-tts 실행 실패:\n' + (r.stderr || r.stdout || '').slice(-800));
    process.exit(4);
  }
  let sentences = null;
  try { const s = parseVtt(fs.readFileSync(vtt, 'utf8')); if (s.length) sentences = s; } catch { /* 경계 없음 */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify({ path: a.out, duration: +duration(a.out).toFixed(3), sentences, provider: 'edge', voice: a.voice }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tts-edge.mjs')) main();
