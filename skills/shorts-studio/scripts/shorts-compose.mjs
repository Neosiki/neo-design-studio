#!/usr/bin/env node
/**
 * shorts-compose.mjs · 9:16 쇼츠 최종 합성: 배경 영상(또는 단색) + 해설 음성 + BGM(음성 구간 자동 낮춤) + ASS 자막 번인
 * bash 없이 Node와 FFmpeg만으로 돌아갑니다(Windows PowerShell 포함).
 *
 * 사용법:
 *   node skills/shorts-studio/scripts/shorts-compose.mjs --voiceover _shorts/voiceover.mp3 --ass _shorts/subs.ass --out shorts.mp4 \
 *        [--video bg.mp4 | --image bg.jpg] [--bgm assets/bgm-educational.mp3] [--fontsdir <폰트 폴더>] \
 *        [--size 1080x1920] [--bgm-vol 0.35] [--lufs -14]
 *
 * 영상/이미지를 주지 않으면 짙은 녹색 단색 배경으로 만듭니다(자막·음성 리허설용).
 * 영상은 화면을 꽉 채우도록 확대 후 중앙 크롭, 길이는 음성 길이에 맞춥니다(짧으면 반복).
 * 출력 규격: H.264 yuv420p · AAC · 30fps · 목표 음량 -14 LUFS(단일 패스 loudnorm이라 ±2 정도 오차가 날 수 있음)
 * FFmpeg·FFprobe가 PATH에 없으면 환경 변수 FFMPEG, FFPROBE로 실행 파일 경로를 줄 수 있습니다.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const USAGE = '사용법: shorts-compose.mjs --voiceover voiceover.mp3 --out shorts.mp4 [--ass subs.ass] [--video bg.mp4 | --image bg.jpg] [--bgm bgm.mp3] [--fontsdir 폴더] [--size 1080x1920] [--bgm-vol 0.35] [--lufs -14]';

export function parseArgs(argv) {
  const a = { size: '1080x1920', bgmVol: '0.35', lufs: '-14' };
  const map = { '--voiceover': 'voiceover', '--ass': 'ass', '--out': 'out', '--video': 'video', '--image': 'image', '--bgm': 'bgm', '--fontsdir': 'fontsdir', '--size': 'size', '--bgm-vol': 'bgmVol', '--lufs': 'lufs' };
  for (let i = 0; i < argv.length; i++) {
    const key = map[argv[i]];
    if (!key) throw new Error(`알 수 없는 옵션: ${argv[i]}`);
    if (i + 1 >= argv.length) throw new Error(`${argv[i]} 뒤에 값이 필요합니다`);
    a[key] = argv[++i];
  }
  if (!a.voiceover || !a.out) throw new Error('--voiceover와 --out은 필수입니다');
  if (!/^\d+x\d+$/.test(a.size)) throw new Error(`--size는 1080x1920 형식입니다: ${a.size}`);
  if (!Number.isFinite(Number(a.bgmVol)) || !Number.isFinite(Number(a.lufs))) throw new Error('--bgm-vol과 --lufs는 숫자여야 합니다');
  return a;
}

/**
 * FFmpeg 필터 옵션에 넣을 경로를 만든다. 역슬래시는 슬래시로, 콜론(C:)과 작은따옴표는 이스케이프하고
 * 전체를 작은따옴표로 감싼다. 셸을 거치지 않고 인자 배열로 넘기므로 Windows 경로도 그대로 동작한다.
 */
export function escapeFilterPath(p) {
  const s = String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\\\''");
  return `'${s}'`;
}

/** 음성 길이(duration, 초)가 정해진 뒤 FFmpeg 인자 배열을 만든다. 순수 함수라 테스트할 수 있다. */
export function buildFfmpegArgs(a, duration) {
  const [W, H] = a.size.split('x');
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p`;
  let sub = '';
  if (a.ass) {
    sub = `,ass=${escapeFilterPath(a.ass)}`;
    if (a.fontsdir) sub += `:fontsdir=${escapeFilterPath(a.fontsdir)}`;
  }
  const input = [];
  if (a.video) input.push('-stream_loop', '-1', '-i', a.video);
  else if (a.image) input.push('-loop', '1', '-i', a.image);
  else input.push('-f', 'lavfi', '-i', `color=c=0x263a2e:s=${W}x${H}:r=30`);
  input.push('-i', a.voiceover);
  let af;
  if (a.bgm) {
    input.push('-stream_loop', '-1', '-i', a.bgm);
    af = `[1:a]asplit=2[vo][sc];[2:a]volume=${a.bgmVol}[bg];[bg][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];` +
      `[vo][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=${a.lufs}:TP=-1.5:LRA=11[a]`;
  } else {
    af = `[1:a]loudnorm=I=${a.lufs}:TP=-1.5:LRA=11[a]`;
  }
  return ['-y', '-loglevel', 'error', ...input, '-filter_complex', `[0:v]${fit}${sub}[v];${af}`, '-map', '[v]', '-map', '[a]',
    '-t', String(duration), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', a.out];
}

function probeDuration(ffprobe, file) {
  const r = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffprobe를 실행하지 못했습니다(${r.error.code || r.error.message}). FFmpeg를 설치하거나 FFPROBE 환경 변수로 경로를 주세요.`);
  const d = parseFloat(String(r.stdout).trim());
  if (r.status !== 0 || !(d > 0)) throw new Error(`음성 길이를 읽지 못했습니다: ${file}\n${r.stderr || ''}`.trim());
  return d;
}

function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`${e.message}\n${USAGE}`); process.exit(1); }
  const ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe';
  try {
    const duration = probeDuration(ffprobe, a.voiceover);
    const r = spawnSync(ffmpeg, buildFfmpegArgs(a, duration), { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.error) throw new Error(`ffmpeg를 실행하지 못했습니다(${r.error.code || r.error.message}). FFmpeg(libass 포함)를 설치하거나 FFMPEG 환경 변수로 경로를 주세요.`);
    if (r.status !== 0) throw new Error(`ffmpeg가 종료 코드 ${r.status}로 끝났습니다. 위 오류 메시지를 확인하세요.`);
    console.log(`완료: ${a.out} (${duration.toFixed(1)}초, ${a.size})`);
  } catch (e) { console.error(e.message); process.exit(1); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
