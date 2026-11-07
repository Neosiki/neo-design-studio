import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EXIT } from '../util.mjs';

export const WIDTH = 96;
export const HEIGHT = 54;
export const FRAME_BYTES = WIDTH * HEIGHT * 3;
const MAX_FRAMES = 7200;
const MAX_SECONDS = 180;
const FORMATS = 'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpeg,mpegts';
const inputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', FORMATS];

function run(command, args, maxBuffer) {
  const result = spawnSync(command, args, { windowsHide: true, timeout: 120_000, maxBuffer });
  if (result.error?.code === 'ENOENT') {
    throw Object.assign(new Error(command + '을 PATH에서 찾을 수 없습니다.'), { exitCode: EXIT.MISSING_DEPENDENCY });
  }
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr.toString('utf8').trim().slice(0, 1000);
    throw new Error(command + ' 실행 실패: ' + detail);
  }
  return result.stdout;
}

function ratio(raw) {
  const [numerator, denominator] = String(raw).split('/').map(Number);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator <= 0 || denominator <= 0) {
    throw new Error('영상 시간 기준을 읽을 수 없습니다: ' + raw);
  }
  return { numerator, denominator, value: numerator / denominator };
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function loadVideo(input) {
  if (typeof input !== 'string' || /^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    throw new Error('로컬 영상 파일 경로를 지정하세요.');
  }
  const absolute = path.resolve(input);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw Object.assign(new Error('영상 파일이 없습니다: ' + input), { exitCode: EXIT.NOT_FOUND });
  }
  const file = fs.realpathSync(absolute);
  const before = fs.statSync(file);
  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error', ...inputOptions, '-show_streams', '-show_format', '-of', 'json', '-i', file,
  ], 2 * 1024 * 1024).toString('utf8'));
  const stream = probe.streams.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic);
  if (!stream) throw new Error('영상 트랙이 없습니다.');
  const audio = probe.streams.find(item => item.codec_type === 'audio');
  const fps = ratio(stream.avg_frame_rate === '0/0' ? stream.r_frame_rate : stream.avg_frame_rate);
  const timeBase = ratio(stream.time_base);
  if (Number(stream.duration) > MAX_SECONDS || Number(stream.nb_frames) > MAX_FRAMES) {
    throw new Error('분석 한도는 180초·7,200프레임입니다. 영상 구간을 나누어 실행하세요.');
  }
  const probeFrames = JSON.parse(run('ffprobe', [
    '-v', 'error', ...inputOptions, '-select_streams', String(stream.index), '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp,duration,pkt_duration', '-of', 'json', '-i', file,
  ], 8 * 1024 * 1024).toString('utf8')).frames;
  if (!probeFrames?.length || probeFrames.length > MAX_FRAMES) {
    throw new Error('프레임을 읽을 수 없거나 7,200프레임을 초과했습니다.');
  }
  const firstPts = Number(probeFrames[0].best_effort_timestamp);
  const frames = probeFrames.map((frame, index) => {
    const pts = Number(frame.best_effort_timestamp);
    if (!Number.isSafeInteger(pts) || (index && pts <= Number(probeFrames[index - 1].best_effort_timestamp))) {
      throw new Error('프레임 표시 시각(PTS)이 없거나 순서가 모호합니다.');
    }
    return { frame: index, pts, seconds: (pts - firstPts) * timeBase.numerator / timeBase.denominator };
  });
  const last = probeFrames.at(-1);
  const lastTicks = Number(last.duration ?? last.pkt_duration);
  const endInterval = lastTicks > 0 ? lastTicks * timeBase.value
    : frames.length > 1 ? frames.at(-1).seconds - frames.at(-2).seconds : 1 / fps.value;
  const duration = frames.at(-1).seconds + endInterval;
  if (duration > MAX_SECONDS + 0.001) throw new Error('영상 구간이 180초를 초과합니다.');
  const variableFrameRate = frames.some((entry, index) => index
    && Math.abs(entry.seconds - frames[index - 1].seconds - 1 / fps.value) > timeBase.value * 1.01);
  const rotation = Number(stream.side_data_list?.find(side => side.rotation !== undefined)?.rotation ?? 0);
  if (!Number.isFinite(rotation) || rotation % 90) throw new Error('90도 단위의 영상 회전 메타데이터만 지원합니다.');
  const rotated = Math.abs(rotation % 180) === 90;
  const width = rotated ? stream.height : stream.width;
  const height = rotated ? stream.width : stream.height;
  const pixels = run('ffmpeg', [
    '-nostdin', '-v', 'error', ...inputOptions, '-i', file, '-map', '0:' + stream.index,
    '-an', '-sn', '-dn', '-vf', 'scale=96:54:flags=area', '-fps_mode', 'passthrough',
    '-frames:v', String(frames.length + 1), '-pix_fmt', 'rgb24', '-c:v', 'rawvideo', '-threads', '1',
    '-f', 'rawvideo', 'pipe:1',
  ], (frames.length + 2) * FRAME_BYTES);
  if (pixels.length !== frames.length * FRAME_BYTES) {
    throw new Error('표시 시각과 디코딩한 프레임 수가 일치하지 않습니다.');
  }
  const sha256 = await hashFile(file);
  const after = fs.statSync(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error('분석 중 원본 영상이 변경되었습니다.');
  }
  return {
    file, pixels, audio, videoStart: firstPts * timeBase.value,
    metadata: {
      name: path.basename(input), sha256, width, height, rotation,
      sampleAspectRatio: stream.sample_aspect_ratio ?? null,
      fps, timeBase, variableFrameRate, duration, frameCount: frames.length, frames,
      hasAudio: Boolean(audio),
    },
  };
}

export function framePixels(video, index) {
  return video.pixels.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES);
}

// Energy at 20 ms intervals. The leading offset remains in the video's time basis.
export function audioEnvelope(video) {
  const rate = 8000;
  const blockSize = 160;
  const seconds = 60;
  const pcm = run('ffmpeg', [
    '-nostdin', '-v', 'error', ...inputOptions, '-i', video.file, '-map', '0:' + video.audio.index,
    '-vn', '-sn', '-dn', '-t', String(seconds), '-ac', '1', '-ar', String(rate), '-f', 'f32le', 'pipe:1',
  ], (seconds + 1) * rate * 4);
  const values = [];
  for (let offset = 0; offset + blockSize * 4 <= pcm.length; offset += blockSize * 4) {
    let power = 0;
    for (let i = 0; i < blockSize; i += 1) power += pcm.readFloatLE(offset + i * 4) ** 2;
    values.push(Math.sqrt(power / blockSize));
  }
  const start = Number(video.audio.start_time);
  return {
    values, interval: blockSize / rate,
    start: Number.isFinite(start) ? start - video.videoStart : 0,
    startKnown: Number.isFinite(start),
  };
}
