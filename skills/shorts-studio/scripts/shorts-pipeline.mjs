#!/usr/bin/env node
/**
 * shorts-pipeline.mjs · 쇼츠 대본(.md) → voiceover.mp3 + timeline.json (한국어, 카라오케 자막용 단어 타이밍 포함)
 *
 * 사용법:
 *   node skills/shorts-studio/scripts/shorts-pipeline.mjs --script shorts.md --out-dir _shorts --provider silent          # 리허설: 네트워크 없음, 무음 오디오
 *   node skills/shorts-studio/scripts/shorts-pipeline.mjs --script shorts.md --out-dir _shorts --provider edge --yes       # 한국어 무료 음성(Edge 읽어주기)
 *
 * 대본 형식 (skills/shorts-studio/references/shorts-9x16.md 참조):
 *   ---
 *   title: 열두달사진관 소개
 *   voice: ko-KR-SunHiNeural     # 선택
 *   rate: +0%                    # 선택
 *   gap: 0.25                    # 장면 사이 무음(초), 기본 0.25
 *   ---
 *   ## hook
 *   **지금** 이 사진, 우리 동네에서 찍을 수 있어요.
 *   ## s1
 *   ...
 *   **강조**로 감싼 낱말은 자막에서 강조색으로 표시됩니다(음성에는 영향 없음).
 *
 * 출력: <out-dir>/voiceover.mp3, <out-dir>/audio/<id>.mp3, <out-dir>/timeline.json
 *   timeline.json은 references/voiceover-pipeline.md의 schema와 호환되며, 단어 타이밍은 문장 경계 안에서
 *   글자 수 비례로 추정한 값입니다(words[].estimated=true). 두바오 TTS의 실측 글자 타임스탬프와 달리 근사값입니다.
 *
 * 규칙 점검(경고): 장면 8개 초과, hook 약 3초 초과, 한 장면이 길어 두 문장 이상, 장면당 45자 초과
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const a = { provider: 'silent' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--script') a.script = v();
    else if (k === '--out-dir') a.outDir = v();
    else if (k === '--provider') a.provider = v();
    else if (k === '--voice') a.voice = v();
    else if (k === '--rate') a.rate = v();
    else if (k === '--yes') a.yes = true;
  }
  return a;
}

export function parseScript(md) {
  const meta = {};
  let body = md.replace(/\r/g, '');
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).split('#')[0].trim();
    }
    body = body.slice(fm[0].length);
  }
  const scenes = [];
  const re = /^##\s+([\w-]+)\s*\n([\s\S]*?)(?=^##\s+[\w-]+\s*\n|(?![\s\S]))/gm;
  let m;
  while ((m = re.exec(body)) !== null) scenes.push({ id: m[1], raw: m[2].trim() });
  return { meta, scenes };
}

const PUNCT = /[.,!?…。，、~"'“”‘’()\[\]{}·:;]/g;
const weightOf = (tok) => Math.max(1, tok.replace(PUNCT, '').length) + (/[,，、]$/.test(tok) ? 0.6 : 0) + (/[.!?…。]$/.test(tok) ? 1.2 : 0);

/** 강조 표기를 걷어내고 [{text, em}] 낱말 목록을 만든다 */
export function tokenize(raw) {
  const words = [];
  const re = /\*\*(.+?)\*\*|(\S+)/g;
  // 먼저 강조 구간을 낱말 단위로 풀어낸다
  let out = [], last = 0, m;
  const emRe = /\*\*(.+?)\*\*/g;
  let pos = 0, plain = '';
  const marks = [];
  while ((m = emRe.exec(raw)) !== null) {
    plain += raw.slice(pos, m.index);
    const s = plain.length;
    plain += m[1];
    marks.push([s, plain.length]);
    pos = m.index + m[0].length;
  }
  plain += raw.slice(pos);
  const tre = /\S+/g;
  while ((m = tre.exec(plain)) !== null) {
    const s = m.index, e = s + m[0].length;
    words.push({ text: m[0], em: marks.some(([ms, me]) => s < me && e > ms) });
  }
  return { plain: plain.replace(/\s+/g, ' ').trim(), words };
}

const splitSentences = (t) => t.split(/(?<=[.!?…。])\s+/).filter(Boolean);

export function estimateSentences(plain, dur, lead = 0.06, tail = 0.15) {
  const sents = splitSentences(plain);
  const w = sents.map((s) => s.split(/\s+/).reduce((n, t) => n + weightOf(t), 0));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.1, dur - lead - tail);
  let t = lead;
  return sents.map((s, i) => { const d = (w[i] / total) * span; const r = { text: s, start: +t.toFixed(3), end: +(t + d).toFixed(3) }; t += d; return r; });
}

/** 문장 경계 안에서 글자 수 비례로 낱말 타이밍을 추정 */
export function estimateWords(words, sentences, dur) {
  const sents = sentences && sentences.length ? sentences : [{ text: '', start: 0.06, end: Math.max(0.2, dur - 0.15) }];
  const counts = sents.map((s) => (s.text ? s.text.split(/\s+/).filter(Boolean).length : 0));
  const sum = counts.reduce((a, b) => a + b, 0);
  const useSent = sentences && sentences.length && sum === words.length;
  const groups = useSent ? sents.map((s, i) => ({ s, ws: words.slice(counts.slice(0, i).reduce((a, b) => a + b, 0), counts.slice(0, i + 1).reduce((a, b) => a + b, 0)) }))
    : [{ s: { start: sents[0].start, end: sents[sents.length - 1].end }, ws: words }];
  const out = [];
  for (const g of groups) {
    const tw = g.ws.reduce((n, w) => n + weightOf(w.text), 0) || 1;
    let t = g.s.start;
    for (const w of g.ws) {
      const d = (weightOf(w.text) / tw) * (g.s.end - g.s.start);
      out.push({ text: w.text, em: w.em, start: +t.toFixed(3), end: +(t + d).toFixed(3), estimated: true });
      t += d;
    }
  }
  return out;
}

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim());

function synthSilent(plain, out) {
  const w = plain.split(/\s+/).reduce((n, t) => n + weightOf(t), 0);
  const dur = +(w * 0.18 + 0.25).toFixed(3);
  ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(dur), '-c:a', 'libmp3lame', '-b:a', '48k', out]);
  return { duration: probe(out), sentences: estimateSentences(plain, dur) };
}

function synthEdge(plain, out, a, meta) {
  const args = [path.join(HERE, 'cloud', 'tts-edge.mjs'), '--text', plain, '--out', out, '--voice', a.voice || meta.voice || 'ko-KR-SunHiNeural', '--rate', a.rate || meta.rate || '+0%', '--yes'];
  const r = JSON.parse(execFileSync('node', args, { encoding: 'utf8' }).trim().split('\n').pop());
  return { duration: r.duration, sentences: r.sentences };
}

function main() {
  const a = parseArgs(process.argv);
  if (!a.script || !a.outDir) { console.error('사용법: shorts-pipeline.mjs --script shorts.md --out-dir _shorts [--provider silent|edge] [--yes]'); process.exit(1); }
  if (a.provider === 'edge' && !a.yes && process.env.DESIGN_CLOUD_OK !== '1') {
    console.error('🛑 --provider edge는 대본 텍스트를 Microsoft Edge 읽어주기 서버로 전송합니다. 승인하시면 --yes를 추가하세요. (SECURITY.md 참조)'); process.exit(2);
  }
  const { meta, scenes } = parseScript(fs.readFileSync(a.script, 'utf8'));
  if (!scenes.length) { console.error('## 장면 제목을 찾지 못했습니다.'); process.exit(1); }
  const gap = parseFloat(meta.gap ?? '0.25');
  const audioDir = path.join(a.outDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const lint = [];
  if (scenes.length > 8) lint.push(`장면 ${scenes.length}개: 쇼츠는 8개 이하를 권장합니다.`);
  const gapFile = path.join(audioDir, '_gap.mp3');
  if (gap > 0) ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(gap), '-c:a', 'libmp3lame', '-b:a', '48k', gapFile]);

  const list = [];
  const outScenes = [];
  let t = 0;
  scenes.forEach((s, idx) => {
    const { plain, words } = tokenize(s.raw);
    if (plain.length > 45) lint.push(`[${s.id}] ${plain.length}자: 한 장면 45자 이하를 권장합니다.`);
    if (splitSentences(plain).length > 1) lint.push(`[${s.id}] 문장이 둘 이상입니다. 한 문장 = 한 장면을 권장합니다.`);
    const f = path.join(audioDir, `${s.id}.mp3`);
    const r = a.provider === 'edge' ? synthEdge(plain, f, a, meta) : synthSilent(plain, f);
    if (idx === 0 && r.duration > 3.6) lint.push(`[${s.id}] 훅이 ${r.duration.toFixed(1)}초입니다. 첫 3초 안에 핵심을 말하도록 줄이세요.`);
    const w = estimateWords(words, r.sentences, r.duration).map((x) => ({ ...x, absoluteStart: +(t + x.start).toFixed(3), absoluteEnd: +(t + x.end).toFixed(3) }));
    outScenes.push({
      id: s.id, start: +t.toFixed(3), end: +(t + r.duration).toFixed(3), duration: +r.duration.toFixed(3), audio: `audio/${s.id}.mp3`, text: plain,
      chunks: [{ text: plain, start: 0, end: +r.duration.toFixed(3), absoluteStart: +t.toFixed(3), absoluteEnd: +(t + r.duration).toFixed(3), words: w }], cues: [],
    });
    list.push(f);
    t += r.duration;
    if (gap > 0 && idx < scenes.length - 1) { list.push(gapFile); t += gap; }
  });

  const listTxt = path.join(audioDir, '_list.txt');
  fs.writeFileSync(listTxt, list.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join('\n'));
  const vo = path.join(a.outDir, 'voiceover.mp3');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listTxt, '-c:a', 'libmp3lame', '-ar', '24000', '-ac', '1', '-b:a', '64k', vo]);
  const total = probe(vo);

  const timeline = { title: meta.title || '', voice: a.voice || meta.voice || null, speed: 1, gap, provider: a.provider, totalDuration: +total.toFixed(3), voiceover: 'voiceover.mp3', timingsEstimated: true, lint, scenes: outScenes };
  fs.writeFileSync(path.join(a.outDir, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log(`장면 ${scenes.length}개 · 총 ${total.toFixed(1)}초 · provider=${a.provider}`);
  for (const l of lint) console.log('⚠️  ' + l);
}

if (process.argv[1]?.endsWith('shorts-pipeline.mjs')) main();
