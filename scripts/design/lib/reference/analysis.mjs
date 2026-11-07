import { WIDTH, HEIGHT, audioEnvelope, framePixels } from './media.mjs';

const FULL = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };
const round = (value) => Number(value.toFixed(6));

function proxyRegion(roi, metadata) {
  if (!roi) return null;
  const [x, y, width, height] = roi;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > metadata.width || y + height > metadata.height) {
    throw new Error('자막 영역이 표시 화면의 범위를 벗어납니다.');
  }
  return {
    left: Math.floor(x * WIDTH / metadata.width),
    top: Math.floor(y * HEIGHT / metadata.height),
    right: Math.ceil((x + width) * WIDTH / metadata.width),
    bottom: Math.ceil((y + height) * HEIGHT / metadata.height),
  };
}

function pixelDifference(a, b, region = FULL) {
  let sum = 0;
  let changed = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const p = (y * WIDTH + x) * 3;
      const delta = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
      sum += delta;
      if (delta >= 90) changed += 1;
    }
  }
  const count = (region.right - region.left) * (region.bottom - region.top);
  return { score: sum / (count * 765), changed: changed / count };
}

export function inspectVideo(video, { roi, cutThreshold, captionThreshold }) {
  const { metadata } = video;
  const region = proxyRegion(roi, metadata);
  const changes = [null];
  for (let index = 1; index < metadata.frameCount; index += 1) {
    const a = framePixels(video, index - 1);
    const b = framePixels(video, index);
    changes.push({ ...pixelDifference(a, b), caption: region ? pixelDifference(a, b, region).score : null });
  }
  const event = (type, index, score) => ({ type, ...metadata.frames[index], score: round(score) });
  const cuts = [];
  const flashes = [];
  const isCut = (index) => changes[index]?.score >= cutThreshold && changes[index].changed >= 0.4;
  for (let index = 1; index < metadata.frameCount; index += 1) {
    if (!isCut(index)) continue;
    if (isCut(index + 1)
        && pixelDifference(framePixels(video, index - 1), framePixels(video, index + 1)).score < cutThreshold * 0.35) {
      flashes.push(event('flash', index, changes[index].score));
      index += 1;
    } else {
      cuts.push(event('cut', index, changes[index].score));
    }
  }
  const boundaries = new Set(cuts.map(item => item.frame));
  for (const flash of flashes) {
    boundaries.add(flash.frame);
    boundaries.add(flash.frame + 1);
  }
  const captions = [];
  if (region) {
    for (let index = 1; index < metadata.frameCount; index += 1) {
      if (!boundaries.has(index) && changes[index].caption >= captionThreshold) {
        captions.push(event('caption-region', index, changes[index].caption));
      }
    }
  }
  const starts = [0, ...cuts.map(item => item.frame)];
  const shots = starts.map((start, index) => {
    const end = starts[index + 1] ?? metadata.frameCount;
    const startSeconds = metadata.frames[start].seconds;
    const endSeconds = metadata.frames[end]?.seconds ?? metadata.duration;
    return { id: 'shot-' + String(index + 1).padStart(3, '0'), startFrame: start, endFrameExclusive: end,
      startSeconds, endSeconds, duration: endSeconds - startSeconds };
  });
  return {
    source: metadata, roi, thresholds: { cut: cutThreshold, caption: captionThreshold },
    events: [...cuts, ...flashes, ...captions].sort((a, b) => a.frame - b.frame), shots,
  };
}

function matchEvents(source, render, window, tolerance) {
  const matches = [];
  const missing = [];
  const used = new Set();
  for (const original of source) {
    let best = -1;
    let distance = window;
    for (let index = 0; index < render.length; index += 1) {
      const candidate = render[index];
      if (used.has(index) || candidate.type !== original.type) continue;
      const delta = Math.abs(candidate.seconds - original.seconds);
      if (delta <= distance) { best = index; distance = delta; }
    }
    if (best < 0) { missing.push(original); continue; }
    used.add(best);
    const target = render[best];
    const offset = target.seconds - original.seconds;
    matches.push({ type: original.type, source: original, render: target,
      offsetMs: round(offset * 1000), status: Math.abs(offset) > tolerance ? 'shifted' : 'aligned' });
  }
  return { matches, missing, extra: render.filter((_, index) => !used.has(index)) };
}

function correlation(a, b, shift) {
  const start = Math.max(0, -shift);
  const end = Math.min(a.length, b.length - shift);
  const count = end - start;
  if (count < 25) return -1;
  let sumA = 0, sumB = 0, squaresA = 0, squaresB = 0, product = 0;
  for (let i = start; i < end; i += 1) {
    const x = a[i], y = b[i + shift];
    sumA += x; sumB += y; squaresA += x * x; squaresB += y * y; product += x * y;
  }
  const scale = Math.sqrt(Math.max(0, squaresA - sumA ** 2 / count) * Math.max(0, squaresB - sumB ** 2 / count));
  return scale > 1e-10 ? (product - sumA * sumB / count) / scale : -1;
}

function compareAudio(source, render) {
  if (!source.audio && !render.audio) return { status: 'no-audio' };
  if (!source.audio || !render.audio) return { status: source.audio ? 'missing-audio' : 'extra-audio' };
  const a = audioEnvelope(source);
  const b = audioEnvelope(render);
  if (!a.startKnown || !b.startKnown) return { status: 'uncertain', reason: 'stream-start-unavailable' };
  const candidates = [];
  for (let shift = -50; shift <= 50; shift += 1) {
    candidates.push({ shift, score: correlation(a.values, b.values, shift) });
  }
  candidates.sort((x, y) => y.score - x.score || Math.abs(x.shift) - Math.abs(y.shift));
  const best = candidates[0];
  const second = candidates.find(item => Math.abs(item.shift - best.shift) > 2);
  if (best.score < 0.65 || best.score - second.score < 0.03 || Math.abs(best.shift) === 50) {
    return { status: 'uncertain', correlation: round(best.score), reason: 'weak-or-ambiguous-energy-match' };
  }
  return { status: 'estimated', offsetMs: round((best.shift * a.interval + b.start - a.start) * 1000),
    correlation: round(best.score), resolutionMs: a.interval * 1000, analyzedSeconds: Math.min(a.values.length, b.values.length) * a.interval };
}

export function compareVideos(source, render, options) {
  const a = inspectVideo(source, options);
  const targetRoi = options.roi?.map((value, index) => index % 2
    ? value * render.metadata.height / source.metadata.height : value * render.metadata.width / source.metadata.width);
  const b = inspectVideo(render, { ...options, roi: targetRoi });
  const tolerance = options.toleranceMs === undefined
    ? 0.5 / Math.max(a.source.fps.value, b.source.fps.value) : options.toleranceMs / 1000;
  const events = matchEvents(a.events, b.events, Math.max(0.15, tolerance), tolerance);
  const audio = compareAudio(source, render);
  const frameDeltas = [];
  let target = 0;
  for (const frame of a.source.frames) {
    if (frame.seconds >= b.source.duration) break;
    while (target + 1 < b.source.frameCount && b.source.frames[target + 1].seconds <= frame.seconds + 1e-9) target += 1;
    const score = pixelDifference(framePixels(source, frame.frame), framePixels(render, target)).score;
    frameDeltas.push({ seconds: frame.seconds, sourceFrame: frame.frame, renderFrame: target, score: round(score) });
  }
  const worst = [];
  const differences = frameDeltas.filter(item => item.score > options.pixelThreshold);
  for (const item of [...differences].sort((x, y) => y.score - x.score || x.seconds - y.seconds)) {
    if (worst.every(other => Math.abs(other.seconds - item.seconds) >= 0.25)) worst.push(item);
    if (worst.length === 12) break;
  }
  const findings = [];
  const add = (type, value) => findings.push({ type, value });
  const durationDeltaMs = round((b.source.duration - a.source.duration) * 1000);
  if (Math.abs(durationDeltaMs) > tolerance * 1000) add('duration', durationDeltaMs);
  if (a.source.width !== b.source.width || a.source.height !== b.source.height) add('canvas', true);
  if (Math.abs(a.source.fps.value - b.source.fps.value) > 1e-6 || a.source.variableFrameRate !== b.source.variableFrameRate) add('frame-rate', true);
  if (a.source.frameCount !== b.source.frameCount) add('frame-count', b.source.frameCount - a.source.frameCount);
  const shifted = events.matches.filter(item => item.status === 'shifted').length;
  if (shifted) add('shifted-events', shifted);
  if (events.missing.length) add('missing-events', events.missing.length);
  if (events.extra.length) add('extra-events', events.extra.length);
  if (differences.length) add('pixel-difference', differences.length);
  if (audio.status === 'missing-audio' || audio.status === 'extra-audio') add(audio.status, true);
  if (audio.status === 'estimated' && Math.abs(audio.offsetMs) > Math.max(tolerance * 1000, audio.resolutionMs)) {
    add('audio-offset', audio.offsetMs);
  }
  return {
    source: a.source, render: b.source, roi: a.roi, renderRoi: b.roi, toleranceMs: round(tolerance * 1000),
    thresholds: { ...a.thresholds, pixel: options.pixelThreshold }, durationDeltaMs, events, audio, findings,
    comparison: { framesCompared: frameDeltas.length, framesAboveThreshold: differences.length, worst,
      meanScore: round(frameDeltas.reduce((sum, item) => sum + item.score, 0) / Math.max(1, frameDeltas.length)) },
  };
}
