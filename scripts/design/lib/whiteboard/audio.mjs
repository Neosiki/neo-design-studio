/**
 * whiteboard/audio.mjs — 음성 · BGM · 자막 합성 계획
 *
 * 원본 저장소가 그대로 도입하면 안 되는 것으로 꼽힌 항목: 결과 MP4에 음성·BGM·자막을
 * 합치지 않는다는 점. SRT는 장면과 타이밍을 정하는 데만 쓰이고 소리는 사라진다.
 *
 * 여기서는 두 벌을 낸다.
 *   - final:  음성 + BGM(더킹) + 자막 트랙이 들어간 배포본
 *   - silent: 무음 작업본 — 편집·검수·골든 프레임 비교용
 *
 * ffmpeg 명령을 직접 실행하지 않고 **계획을 파일로 남긴다.** 렌더는 오래 걸리고
 * 환경마다 ffmpeg 유무가 달라서, 무엇이 실행될지 먼저 보이는 편이 안전하다.
 */

import fs from 'node:fs';
import path from 'node:path';

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/**
 * 믹싱 계획을 만든다.
 * 반환: { targets, missing, filters, commands, meta }
 */
export function buildMixPlan(ctx, artifactRef, ir) {
  const audio = ir.audio || {};
  const captions = ir.captions || {};
  const base = artifactRef.id;
  const totalMs = (ir.scenes || []).reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0);

  const resolve = (rel) => (rel ? path.resolve(ctx.dir, rel) : null);
  const assetById = new Map((ctx.manifest.assets || []).map((a) => [a.id, a]));
  const trackPath = (track) => {
    if (!track) return null;
    if (track.path) return track.path;
    const asset = track.assetId ? assetById.get(track.assetId) : null;
    return asset ? asset.path : null;
  };

  const voPath = trackPath(audio.voiceover);
  const bgmPath = trackPath(audio.bgm);
  const srtPath = captions.srt || null;

  const missing = [];
  if (audio.voiceover && (!voPath || !fs.existsSync(resolve(voPath)))) missing.push('voiceover');
  if (audio.bgm && (!bgmPath || !fs.existsSync(resolve(bgmPath)))) missing.push('bgm');
  if (srtPath && !fs.existsSync(resolve(srtPath))) missing.push('captions');

  const hasVo = Boolean(voPath) && !missing.includes('voiceover');
  const hasBgm = Boolean(bgmPath) && !missing.includes('bgm');
  const hasSrt = Boolean(srtPath) && !missing.includes('captions');

  const voGain = audio.voiceover?.gainDb ?? 0;
  const bgmGain = audio.bgm?.gainDb ?? -20;
  const duckDb = audio.bgm?.duckDb ?? -6;
  const lufs = audio.targetLufs ?? -16;

  /* 오디오 필터 그래프
   * BGM은 보이스오버가 있는 구간에서 자동으로 더킹된다(sidechaincompress).
   * 마지막에 loudnorm으로 목표 라우드니스를 맞춘다 — 채널마다 소리 크기가 다른 문제를 막는다. */
  const filters = [];
  let mixOut = null;
  if (hasVo && hasBgm) {
    filters.push(
      `[1:a]volume=${voGain}dB,asplit=2[vo][vokey]`,
      `[2:a]volume=${bgmGain}dB[bgmraw]`,
      `[bgmraw][vokey]sidechaincompress=threshold=0.05:ratio=${(1 / Math.max(0.05, 10 ** (duckDb / 20))).toFixed(2)}:attack=20:release=400[bgm]`,
      `[vo][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`,
      `[mixed]loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`
    );
    mixOut = '[aout]';
  } else if (hasVo) {
    filters.push(`[1:a]volume=${voGain}dB,loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
    mixOut = '[aout]';
  } else if (hasBgm) {
    filters.push(`[1:a]volume=${bgmGain}dB,loudnorm=I=${lufs}:TP=-1.5:LRA=11[aout]`);
    mixOut = '[aout]';
  }

  const silentMp4 = `${base}-silent.mp4`;
  const finalMp4 = `${base}.mp4`;

  const commands = [];
  const inputs = [q(silentMp4)];
  if (hasVo) inputs.push(q(voPath));
  if (hasBgm) inputs.push(q(bgmPath));

  if (mixOut) {
    const burn = captions.burnIn && hasSrt ? ` -vf ${q(`subtitles=${srtPath}`)}` : '';
    const softSub = hasSrt && !captions.burnIn ? ` -i ${q(srtPath)} -c:s mov_text -metadata:s:s:0 language=${captions.language || 'kor'}` : '';
    commands.push({
      name: 'final',
      description: `음성${hasBgm ? ' + BGM(더킹)' : ''}${hasSrt ? ` + 자막(${captions.burnIn ? '번인' : '소프트'})` : ''} · ${lufs} LUFS`,
      cmd: `ffmpeg -y -i ${inputs.join(' -i ')}${softSub} -filter_complex ${q(filters.join(';'))} -map 0:v ${
        softSub ? `-map ${inputs.length}:s ` : ''
      }-map ${mixOut}${burn} -c:v copy -c:a aac -b:a 192k ${q(finalMp4)}`,
    });
  }

  const targets = [
    { name: silentMp4, description: '무음 작업본 — 편집·검수·골든 프레임 비교용 (항상 만든다)' },
    ...(mixOut ? [{ name: finalMp4, description: commands[0].description }] : []),
    ...(hasSrt ? [{ name: path.basename(srtPath), description: '자막 트랙 (장면 계획의 입력이자 출력)' }] : []),
  ];

  return {
    schemaVersion: '1.0',
    artifact: base,
    generatedAt: new Date().toISOString(),
    durationMs: totalMs,
    sources: {
      voiceover: hasVo ? voPath : null,
      bgm: hasBgm ? bgmPath : null,
      captions: hasSrt ? srtPath : null,
    },
    levels: { voiceoverDb: voGain, bgmDb: bgmGain, duckDb, targetLufs: lufs },
    silentVariant: audio.silentVariant !== false,
    targets,
    filters,
    commands,
    missing,
  };
}

/** 계획을 실행 가능한 셸 스크립트로 쓴다. 실행 여부는 사람이 정한다. */
export function writeMixScript(outDir, plan) {
  const scriptPath = path.join(outDir, 'mix.sh');
  const lines = [
    '#!/bin/bash',
    '# design whiteboard render 가 만든 오디오 믹싱 스크립트.',
    '# 무음 MP4가 이미 있다고 가정한다 (design export --format mp4).',
    'set -euo pipefail',
    `cd "$(dirname "$0")"`,
    '',
    `# 길이 ${(plan.durationMs / 1000).toFixed(2)}초 · 목표 ${plan.levels.targetLufs} LUFS`,
    `# 음성 ${plan.levels.voiceoverDb}dB · BGM ${plan.levels.bgmDb}dB · 더킹 ${plan.levels.duckDb}dB`,
    '',
    'command -v ffmpeg >/dev/null || { echo "ffmpeg가 필요합니다" >&2; exit 5; }',
    '',
  ];

  if (plan.missing.length) {
    lines.push(`echo "경고: 오디오 소스 없음 — ${plan.missing.join(', ')}" >&2`, '');
  }
  if (plan.commands.length === 0) {
    lines.push('echo "믹싱할 오디오가 없습니다. 무음 작업본만 사용하세요." >&2', 'exit 0');
  }
  for (const cmd of plan.commands) {
    lines.push(`echo "→ ${cmd.name}: ${cmd.description}"`, cmd.cmd, '');
  }
  lines.push('echo "완료"');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(scriptPath, `${lines.join('\n')}\n`, 'utf8');
  try {
    fs.chmodSync(scriptPath, 0o755);
  } catch {
    /* Windows에서는 무시 */
  }
  return scriptPath;
}
