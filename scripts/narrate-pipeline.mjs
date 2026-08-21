#!/usr/bin/env node
/**
 * narrate-pipeline.mjs · L2 장편 해설 총지휘
 *
 * 입력: markdown 해설 원고(## scene-id로 분절, [[cue:id]]로 핵심 문장 표시)
 * 출력: voiceover.mp3(이어붙인 전체 음성) + timeline.json(각 구간의 start/end + cues 절대 시간)
 *
 * 사용법:
 *   node scripts/narrate-pipeline.mjs --script demo.md --out-dir _narration_demo
 *
 * 해설 원고 형식:
 *   ---
 *   title: LLM이란 무엇인가
 *   voice: S_JSdgdWk22   # 선택사항, 미작성 시 .env 사용
 *   speed: 1.0           # 선택사항
 *   gap: 0.3             # 구간 간 무음(초), 기본값 0.3
 *   ---
 *
 *   ## intro
 *   안녕하세요, 저는 Neo입니다. 오늘은 5분 안에 LLM이 무엇인지 명확히 설명합니다.
 *
 *   ## what-is
 *   LLM의 정식 명칭은 Large Language Model이며, [[cue:bigmodel]] 수천억 개의 파라미터를 가진 신경망입니다.
 *   본질적으로는 텍스트 연쇄 예측기입니다.
 *
 * 출력 파일 구조(out-dir 아래):
 *   audio/
 *     intro.mp3
 *     what-is.mp3
 *   voiceover.mp3       모든 scene을 이어붙인 전체 음성
 *   timeline.json       스키마는 references/voiceover-pipeline.md 참조
 *
 * 의존성: tts-doubao.mjs, ffmpeg, ffprobe
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const TTS_SCRIPT = path.join(__dirname, 'cloud', 'tts-doubao.mjs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--script') args.script = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--no-timestamps') args.noTimestamps = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.error(`
narrate-pipeline.mjs · L2 장편 해설 총지휘

  --script <path>     해설 원고 .md 파일(필수)
  --out-dir <path>    출력 디렉토리(필수)
  --no-timestamps     문자 단위 타임스탬프 요청 안 함(기본은 요청, chunks에 words 포함되어 카라오케 자막용)
  --yes               해설 원고 텍스트를 두바오 TTS 공식 API로 전송하는 것을 승인(또는 DESIGN_CLOUD_OK=1 설정)

출력: <out-dir>/voiceover.mp3 + <out-dir>/timeline.json
`.trim());
  process.exit(1);
}

/**
 * Parse frontmatter + scene blocks from markdown
 * Returns { meta, scenes: [{ id, raw }] }
 */
function parseScript(md) {
  const meta = {};
  let body = md;
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
    body = md.slice(fmMatch[0].length);
  }
  const scenes = [];
  const re = /^##\s+([\w-]+)\s*\n([\s\S]*?)(?=^##\s+[\w-]+\s*\n|$(?![\r\n]))/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    scenes.push({ id: m[1], raw: m[2].trim() });
  }
  return { meta, scenes };
}

/**
 * Split a scene's text by [[cue:id]] markers into chunks.
 * Returns: { chunks: [{ text, cueAfter? }] }
 *   cueAfter is the cue id that follows this chunk (chunk's end = cue position)
 *
 * Example: "A[[cue:x]]B[[cue:y]]C" =>
 *   chunks: [
 *     { text: "A", cueAfter: "x" },
 *     { text: "B", cueAfter: "y" },
 *     { text: "C" }
 *   ]
 */
function splitByCues(text) {
  const chunks = [];
  const re = /\[\[cue:([\w-]+)\]\]/g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(lastIdx, m.index).trim();
    chunks.push({ text: before, cueAfter: m[1] });
    lastIdx = m.index + m[0].length;
  }
  const tail = text.slice(lastIdx).trim();
  chunks.push({ text: tail });
  // 빈 텍스트 블록 필터링(cue가 구간 시작/끝에 붙어 있을 때)
  return chunks.filter((c) => c.text.length > 0 || c.cueAfter);
}

function getDuration(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

let timestampsBroken = false; // 타임스탬프 요청이 한 번 실패하면 이후 chunk는 모두 하향 처리되어 반복 재시도를 방지

function callTTS(text, outPath, opts) {
  // 동의 확인은 이미 파이프라인 입구(main 참조)에서 처리됨, 자식 프로세스는 --yes를 직접 전달
  const args = ['--text', text, '--out', outPath, '--yes'];
  if (opts.voice) args.push('--voice', opts.voice);
  if (opts.speed) args.push('--speed', String(opts.speed));
  const wantTimestamps = opts.timestamps && !timestampsBroken;
  if (wantTimestamps) args.push('--timestamps');
  try {
    const out = execFileSync('node', [TTS_SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return JSON.parse(out.trim());
  } catch (e) {
    if (!wantTimestamps) throw e;
    // 문자 단위 타임스탬프는 현재 음색/리소스에서 지원되지 않을 수 있음(2.0 리소스 + 중영어만) — 하향 재시도: 타임스탬프 없이
    timestampsBroken = true;
    console.error('[narrate] ⚠ --timestamps 옵션으로 TTS 실패, 타임스탬프 비활성화로 하향( timeline에 words 없음, 카라오케 자막 사용 불가 )');
    const out = execFileSync('node', [TTS_SCRIPT, ...args.filter((a) => a !== '--timestamps')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return JSON.parse(out.trim());
  }
}

function ffmpegConcat(inputs, output) {
  // concat demuxer로 같은 인코딩의 mp3 합치기
  const listFile = output + '.list';
  fs.writeFileSync(
    listFile,
    inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
  );
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', output],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  fs.unlinkSync(listFile);
}

function makeSilence(duration, outPath) {
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(duration),
     '-q:a', '9', '-acodec', 'libmp3lame', outPath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.script || !args.outDir) usage();

  if (!args.yes && process.env.DESIGN_CLOUD_OK !== '1') {
    console.error(
      '[클라우드 권한 확인] 본 파이프라인은 해설 원고 텍스트를 분할하여 두바오TTS 공식 API(openspeech.bytedance.com, ' +
      '자신의 키로 합성합니다).\n문제가 없다면 다시 실행하고 --yes를 추가하거나 환경변수 DESIGN_CLOUD_OK=1을 설정하세요.' +
      '데이터 흐름 관련 선언은 SECURITY.md 참조.',
    );
    process.exit(2);
  }

  const scriptPath = path.resolve(args.script);
  const outDir = path.resolve(args.outDir);
  const audioDir = path.join(outDir, 'audio');
  const tmpDir = path.join(outDir, '.tmp');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const md = fs.readFileSync(scriptPath, 'utf8');
  const { meta, scenes } = parseScript(md);
  if (scenes.length === 0) {
    console.error('에러: 해설 원고에 ## scene 구간이 없습니다, 최소 한 구간 필요.');
    process.exit(1);
  }

  const voice = meta.voice || undefined;
  const speed = meta.speed ? parseFloat(meta.speed) : 1.0;
  const gap = meta.gap ? parseFloat(meta.gap) : 0.3;
  const timestamps = !args.noTimestamps && meta.timestamps !== 'false';

  console.error(`[narrate] script=${path.basename(scriptPath)} scenes=${scenes.length} voice=${voice || '(env)'} speed=${speed} gap=${gap}s`);

  // 구간 간 무음 파일(공용 하나)
  const gapFile = path.join(tmpDir, 'gap.mp3');
  if (gap > 0) makeSilence(gap, gapFile);

  const timeline = {
    title: meta.title || path.basename(scriptPath, '.md'),
    voice: voice || null,
    speed,
    gap,
    totalDuration: 0,
    scenes: [],
  };

  let cursor = 0;
  const sceneAudioFiles = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.error(`[narrate] (${i + 1}/${scenes.length}) scene="${scene.id}"`);

    const chunks = splitByCues(scene.raw);
    const chunkFiles = [];
    const cueRecords = [];
    const chunkRecords = []; // 각 chunk의 실측 start/end 구간 내 시간, 자막 표시용
    let sceneInternalCursor = 0;

    for (let j = 0; j < chunks.length; j++) {
      const chunk = chunks[j];
      if (!chunk.text) {
        // 빈 텍스트 블록(cue가 바로 붙어 있음): TTS는 건너뛰되 cue 위치는 기록
        if (chunk.cueAfter) {
          cueRecords.push({
            id: chunk.cueAfter,
            offset: sceneInternalCursor,
          });
        }
        continue;
      }
      const chunkPath = path.join(tmpDir, `${scene.id}-${j}.mp3`);
      const result = callTTS(chunk.text, chunkPath, { voice, speed, timestamps });
      const chunkStart = sceneInternalCursor;
      chunkFiles.push(chunkPath);
      sceneInternalCursor += result.duration;
      chunkRecords.push({
        text: chunk.text,
        start: chunkStart,
        end: sceneInternalCursor,
        duration: result.duration,
        // 문자 단위 타임스탬프(TTS 실측, TN 후 텍스트): 구간 내 상대 시간으로 환산
        words: (result.words || []).map((w) => ({
          text: w.text,
          start: chunkStart + w.start,
          end: chunkStart + w.end,
        })),
      });
      console.error(`  chunk ${j}: ${result.duration.toFixed(2)}s · ${chunk.text.length} 글자 · ${chunk.text.slice(0, 30)}${chunk.text.length > 30 ? '…' : ''}`);
      if (chunk.cueAfter) {
        cueRecords.push({
          id: chunk.cueAfter,
          offset: sceneInternalCursor,
        });
      }
    }

    // 구간 내 서브청크 합치기
    const sceneAudio = path.join(audioDir, `${scene.id}.mp3`);
    if (chunkFiles.length === 1) {
      fs.copyFileSync(chunkFiles[0], sceneAudio);
    } else {
      ffmpegConcat(chunkFiles, sceneAudio);
    }
    const sceneDuration = getDuration(sceneAudio);

    // 전체 트랙에 연결: 먼저 gap 추가(첫 구간 제외), 그다음 scene 추가
    if (i > 0 && gap > 0) {
      sceneAudioFiles.push(gapFile);
      cursor += gap;
    }
    sceneAudioFiles.push(sceneAudio);

    timeline.scenes.push({
      id: scene.id,
      start: cursor,
      end: cursor + sceneDuration,
      duration: sceneDuration,
      audio: path.relative(outDir, sceneAudio),
      text: scene.raw.replace(/\[\[cue:[\w-]+\]\]/g, ''),
      // chunks: 자막 문장 단위 표시용. start/end는 구간 내 상대 시간, absoluteStart/absoluteEnd는 전체 트랙의 절대 시간
      // words: 문자 단위 타임스탬프(카라오케 자막용; TN 후 텍스트로 chunk.text와 완전히 일치하지 않을 수 있음). 빈 배열=사용 불가
      chunks: chunkRecords.map((c) => ({
        text: c.text,
        start: c.start,
        end: c.end,
        absoluteStart: cursor + c.start,
        absoluteEnd: cursor + c.end,
        words: (c.words || []).map((w) => ({
          text: w.text,
          start: w.start,
          end: w.end,
          absoluteStart: cursor + w.start,
          absoluteEnd: cursor + w.end,
        })),
      })),
      cues: cueRecords.map((c) => ({
        id: c.id,
        offset: c.offset,
        absoluteTime: cursor + c.offset,
      })),
    });

    cursor += sceneDuration;
  }

  // 전체 트랙 병합
  const voiceoverPath = path.join(outDir, 'voiceover.mp3');
  ffmpegConcat(sceneAudioFiles, voiceoverPath);
  timeline.totalDuration = getDuration(voiceoverPath);
  timeline.voiceover = 'voiceover.mp3';

  fs.writeFileSync(
    path.join(outDir, 'timeline.json'),
    JSON.stringify(timeline, null, 2),
  );

  // tmp 정리
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.error(`\n[narrate] 완료.`);
  console.error(`  voiceover: ${voiceoverPath}`);
  console.error(`  timeline:  ${path.join(outDir, 'timeline.json')}`);
  console.error(`  총 재생 시간:    ${timeline.totalDuration.toFixed(2)}s (${(timeline.totalDuration / 60).toFixed(2)} min)`);
  console.error(`  구간 수:      ${timeline.scenes.length}`);
  const totalCues = timeline.scenes.reduce((sum, s) => sum + s.cues.length, 0);
  console.error(`  cue 수:    ${totalCues}`);
  const totalWords = timeline.scenes.reduce(
    (sum, s) => sum + s.chunks.reduce((a, c) => a + (c.words ? c.words.length : 0), 0), 0);
  console.error(`  문자 단위 타임스탬프: ${totalWords > 0 ? `${totalWords} words (<Subtitles karaoke /> 사용 가능)` : '없음'}`);
}

main().catch((err) => {
  console.error(`narrate-pipeline 실패: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
