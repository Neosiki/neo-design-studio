#!/usr/bin/env node
/**
 * tts-doubao.mjs · 두바오 음성 TTS (화산 엔진 openspeech)
 *
 * ⚠️ 선택적 클라우드 기능: 이 스크립트는 합성할 텍스트를 바이트댄스 공식 TTS API (openspeech.bytedance.com)로 전송합니다,
 * 자신의 key와 endpoint를 사용하며 도메인 화이트리스트를 강제 확인합니다. 최초 호출 시 --yes 또는 DESIGN_CLOUD_OK=1 필요
 * 명시적 확인. 데이터 흐름 선언은 저장소 루트의 SECURITY.md를 참조하세요.
 *
 * 사용법:
 *   node scripts/cloud/tts-doubao.mjs --text "안녕하세요" --out demo.mp3 --yes
 *   node scripts/cloud/tts-doubao.mjs --text-file script.txt --out out.mp3 --speed 1.0 --yes
 *   node scripts/cloud/tts-doubao.mjs --text "안녕하세요" --out demo.mp3 --timestamps --yes   # 글자 단위 타임스탬프 포함
 *
 * 출력:
 *   - mp3 파일이 --out 경로에 기록됩니다
 *   - stdout에 한 줄 JSON 출력: {"path":"...","duration":12.34,"bytes":54321}
 *   - --timestamps 사용 시 추가로 words: [{text,start,end,confidence}] (초, 해당 오디오 단락의 시작 기준)
 *     주의: 타임스탬프 텍스트는 TN 처리 후의 텍스트(예: "2025"는 각 자리의 한자로 변환됨), 구두점은 앞 글자에 붙습니다;
 *     2.0 리소스가 필요합니다 (seed-tts-2.0 / seed-icl-2.0), 중국어와 영어만 지원.
 *
 * 의존성: Node 18+ (내장 fetch/crypto), ffprobe (길이 측정, brew install ffmpeg)
 *
 * env (자동으로 skill 루트 디렉토리의 .env에서 읽음, 또는 process.env로 덮어쓸 수 있음):
 *   DOUBAO_TTS_API_KEY     선택 (신형 API Key 인증)
 *   DOUBAO_APP_ID          선택 (콘솔 App ID, DOUBAO_ACCESS_KEY와 세트)
 *   DOUBAO_ACCESS_KEY      선택 (콘솔 Access Token, DOUBAO_APP_ID와 세트)
 *   DOUBAO_TTS_VOICE_ID    필수 (음색 id)
 *   DOUBAO_TTS_RESOURCE_ID 선택 (기본적으로 음색에 따라 자동 추론)
 *   DOUBAO_TTS_ENDPOINT    기본값 https://openspeech.bytedance.com/api/v3/tts/unidirectional
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const envPath = path.join(SKILL_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

function parseArgs(argv) {
  const args = { speed: '1.0', encoding: 'mp3' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--text') args.text = argv[++i];
    else if (a === '--text-file') args.textFile = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--speed') args.speed = argv[++i];
    else if (a === '--voice') args.voice = argv[++i];
    else if (a === '--encoding') args.encoding = argv[++i];
    else if (a === '--timestamps') args.timestamps = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.error(`
tts-doubao.mjs · 두바오 음성 TTS

  --text <str>          합성할 텍스트
  --text-file <path>    파일에서 텍스트 읽기 (--text와 둘 중 하나만 사용)
  --out <path>          출력 mp3 경로 (필수)
  --speed <float>       속도 배율, 기본 1.0 (0.5-2.0)
  --voice <voice_id>    .env의 음색 id를 덮어씀
  --encoding <ext>      mp3 / wav / pcm, 기본 mp3
  --timestamps          글자 단위 타임스탬프 요청 (enable_subtitle), 결과 JSON에 words 배열 추가
  --yes                 텍스트를 두바오 TTS 공식 API로 전송하는 것을 승인합니다 (또는 DESIGN_CLOUD_OK=1 설정)
`.trim());
  process.exit(1);
}

function getDuration(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf8' });
    return parseFloat(out.trim());
  } catch (e) {
    return null;
  }
}

function inferResourceId(voiceId) {
  // 복제 음색은 기본적으로 2.0 사용: 이 계정은 seed-icl-2.0만 활성화되어 있음 (1.0은 403 resource not granted),
  // 또한 글자 단위 타임스탬프 (enable_subtitle)는 2.0 리소스에서만 지원됩니다.
  if (voiceId.startsWith('S_')) return 'seed-icl-2.0';
  if (voiceId.includes('uranus')) return 'seed-tts-2.0';
  return 'seed-tts-1.0';
}

function speedToSpeechRate(speed) {
  const ratio = parseFloat(speed);
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(-50, Math.min(100, Math.round((ratio - 1) * 100)));
}

function buildAuthHeaders({ requestId, resourceId }) {
  const apiKey = process.env.DOUBAO_TTS_API_KEY;
  const appId = process.env.DOUBAO_APP_ID;
  const accessKey = process.env.DOUBAO_ACCESS_KEY;
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': requestId,
  };

  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
    return headers;
  }

  if (!appId) throw new Error('DOUBAO_TTS_API_KEY 또는 DOUBAO_APP_ID가 없습니다(.env를 확인하세요)');
  if (!accessKey) throw new Error('DOUBAO_ACCESS_KEY가 없습니다(.env를 확인하세요)');

  headers['X-Api-App-Id'] = appId;
  headers['X-Api-Access-Key'] = accessKey;
  return headers;
}

async function readV3Audio(res) {
  const text = await res.text();
  const chunks = [];
  const words = []; // 글자 단위 타임스탬프 (enable_subtitle 활성화 시 서버가 문장별로 sentence.words 반환)
  let finalCode = null;
  let finalMessage = '';

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let json;
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`API 응답 라인이 JSON이 아님: ${trimmed.slice(0, 200)}`);
    }

    const code = json.code ?? 0;
    if (code === 20000000) {
      finalCode = code;
      finalMessage = json.message || '';
      break;
    }
    if (code !== 0) {
      throw new Error(`API 오류 반환 code=${code} msg=${json.message || JSON.stringify(json)}`);
    }
    if (json.data) chunks.push(Buffer.from(json.data, 'base64'));
    if (json.sentence && Array.isArray(json.sentence.words)) {
      for (const w of json.sentence.words) {
        words.push({
          text: w.word,
          start: w.startTime,
          end: w.endTime,
          confidence: w.confidence,
        });
      }
    }
  }

  if (!chunks.length) {
    const detail = finalCode ? `종료 코드 ${finalCode} ${finalMessage}` : text.slice(0, 500);
    throw new Error(`API 응답에 오디오 데이터가 없습니다: ${detail}`);
  }
  return { audio: Buffer.concat(chunks), words };
}

// endpoint 도메인 화이트리스트: key와 텍스트는 바이트댄스 공식 도메인으로만 전송 허용, .env가 변조되어 리디렉션되는 것을 방지
const ALLOWED_ENDPOINT_HOSTS = /(^|\.)(bytedance\.com|volces\.com)$/;

async function tts({ text, voice, speed, encoding, timestamps }) {
  const endpoint = process.env.DOUBAO_TTS_ENDPOINT || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
  const host = new URL(endpoint).hostname;
  if (!ALLOWED_ENDPOINT_HOSTS.test(host)) {
    throw new Error(`DOUBAO_TTS_ENDPOINT 도메인 ${host}이(가) 화이트리스트에 없습니다 (*.bytedance.com / *.volces.com), 전송 거부`);
  }
  const voiceId = voice || process.env.DOUBAO_TTS_VOICE_ID || process.env.DOUBAO_SPEAKER;
  const resourceId = process.env.DOUBAO_TTS_RESOURCE_ID || inferResourceId(voiceId || '');
  const requestId = randomUUID();

  if (!voiceId) throw new Error('DOUBAO_TTS_VOICE_ID가 없습니다(.env를 확인하거나 --voice로 전달하세요)');

  const body = {
    user: { uid: 'design-studio' },
    req_params: {
      text,
      speaker: voiceId,
      audio_params: {
        format: encoding,
        sample_rate: 24000,
        speech_rate: speedToSpeechRate(speed),
        // 글자 단위 타임스탬프: 2.0 리소스 (seed-tts-2.0 / seed-icl-2.0) 에서만 지원, 중국어·영어만
        ...(timestamps ? { enable_subtitle: true } : {}),
      },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: buildAuthHeaders({ requestId, resourceId }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  return readV3Audio(res);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) usage();

  let text = args.text;
  if (!text && args.textFile) {
    text = fs.readFileSync(args.textFile, 'utf8').trim();
  }
  if (!text) {
    console.error('오류: --text 또는 --text-file 누락');
    usage();
  }
  if (!args.out) {
    console.error('오류: --out 누락');
    usage();
  }

  if (!args.yes && process.env.DESIGN_CLOUD_OK !== '1') {
    const host = new URL(process.env.DOUBAO_TTS_ENDPOINT || 'https://openspeech.bytedance.com').hostname;
    console.error(
      `[클라우드 기능 확인] 이번에 약${text.length}자 텍스트를 ${host} (두바오TTS 공식 API, 자신의 key로 음성 합성)로 전송합니다.\n` +
      `확인되면 다시 실행하고 --yes를 추가하거나 환경변수 DESIGN_CLOUD_OK=1을 설정하세요. 데이터 흐름 선언은 SECURITY.md를 참조하세요.`,
    );
    process.exit(2);
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const { audio, words } = await tts({
    text,
    voice: args.voice,
    speed: args.speed,
    encoding: args.encoding,
    timestamps: args.timestamps,
  });

  fs.writeFileSync(outPath, audio);
  const duration = getDuration(outPath);
  const result = {
    path: outPath,
    bytes: audio.length,
    duration,
    text_chars: text.length,
  };
  if (args.timestamps) result.words = words;
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(`TTS 실패: ${err.message}`);
  process.exit(1);
});
