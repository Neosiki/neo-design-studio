/**
 * media.mjs — 영상 타임라인, 오디오, 산출물 파일 무결성, PPTX 구조
 */

import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from '../util.mjs';
import { loadArtifactIr } from '../project.mjs';

export const id = 'media';
export const title = '미디어 · 산출물';

export function run(ctx) {
  const findings = [];

  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);

    if (ir && ir.type === 'video') findings.push(...checkVideo(ctx, artRef, ir));
    if (ir && ir.type === 'deck') findings.push(...checkDeck(ctx, artRef, ir));

    for (const out of artRef.outputs || []) {
      const abs = path.resolve(ctx.dir, out.path);
      const where = `artifacts[${artRef.id}].outputs → ${out.path}`;
      if (!fs.existsSync(abs)) {
        findings.push({
          check: 'output.missing',
          level: 'error',
          where,
          message: '매니페스트에 기록된 산출물 파일이 없습니다.',
        });
        continue;
      }
      const stat = fs.statSync(abs);
      if (stat.size === 0) {
        findings.push({ check: 'output.empty', level: 'error', where, message: '파일 크기가 0입니다.' });
        continue;
      }
      if (out.sha256 && sha256File(abs) !== out.sha256) {
        findings.push({
          check: 'output.stale',
          level: 'warn',
          where,
          message: '파일이 기록된 해시와 다릅니다. design render로 다시 만들거나 매니페스트를 갱신하세요.',
        });
      }
      if (out.format === 'pptx') findings.push(...checkPptx(abs, where));
    }
  }

  return findings;
}

function checkVideo(ctx, artRef, ir) {
  const findings = [];
  const scenes = [...(ir.scenes || [])].sort((a, b) => a.startMs - b.startMs);
  const canvas = ir.canvas;

  let cursor = 0;
  for (const scene of scenes) {
    const where = `${artRef.id} → scenes.${scene.id}`;
    if (scene.startMs > cursor + 1) {
      findings.push({
        check: 'video.gap',
        level: 'warn',
        where,
        message: `앞 장면과 ${scene.startMs - cursor}ms 공백이 있습니다.`,
      });
    } else if (scene.startMs < cursor - 1) {
      findings.push({
        check: 'video.overlap',
        level: 'error',
        where,
        message: `앞 장면과 ${cursor - scene.startMs}ms 겹칩니다.`,
      });
    }
    cursor = scene.startMs + scene.durationMs;

    if (scene.durationMs < 800) {
      findings.push({
        check: 'video.tooShort',
        level: 'warn',
        where,
        message: `${scene.durationMs}ms — 0.8초 미만 장면은 읽히지 않습니다.`,
      });
    }
    if (scene.durationMs > 12000) {
      findings.push({
        check: 'video.tooLong',
        level: 'warn',
        where,
        message: `${Math.round(scene.durationMs / 1000)}초 — 12초를 넘는 단일 장면은 지루해집니다. 분할을 검토하세요.`,
      });
    }
    if (!scene.subtitle && ir.captions?.srt) {
      findings.push({
        check: 'video.subtitle',
        level: 'warn',
        where,
        message: '자막 트랙이 있는데 이 장면에 대응 자막이 없습니다.',
      });
    }

    for (const layer of scene.layers || []) {
      const lwhere = `${where}.${layer.id}`;
      if (layer.enterMs !== undefined && layer.enterMs > scene.durationMs) {
        findings.push({
          check: 'video.layerTiming',
          level: 'error',
          where: lwhere,
          message: `enterMs(${layer.enterMs})가 장면 길이(${scene.durationMs}ms)를 넘습니다. 화면에 나오지 않습니다.`,
        });
      }
      if (layer.exitMs !== undefined && layer.enterMs !== undefined && layer.exitMs <= layer.enterMs) {
        findings.push({
          check: 'video.layerTiming',
          level: 'error',
          where: lwhere,
          message: 'exitMs가 enterMs보다 크지 않습니다.',
        });
      }
      const regions = [layer.region, ...(layer.protectedRegions || [])].filter(Boolean);
      for (const region of regions) {
        if (!canvas) break;
        if (region.x < 0 || region.y < 0 || region.x + region.w > canvas.width || region.y + region.h > canvas.height) {
          findings.push({
            check: 'video.regionBounds',
            level: 'error',
            where: lwhere,
            message: '영역이 캔버스 밖을 가리킵니다.',
          });
        }
      }
    }

    // 뒤에 등장할 요소를 보호 영역으로 선언했는지 (선노출 방지)
    const layers = scene.layers || [];
    for (let i = 0; i < layers.length; i += 1) {
      const later = layers.slice(i + 1).filter((l) => l.region);
      if (later.length === 0) continue;
      const declared = layers[i].protectedRegions || [];
      const missing = later.filter(
        (l) => !declared.some((p) => p.x === l.region.x && p.y === l.region.y && p.w === l.region.w && p.h === l.region.h)
      );
      if (declared.length > 0 && missing.length > 0) {
        findings.push({
          check: 'video.protectedRegions',
          level: 'warn',
          where: `${where}.${layers[i].id}`,
          message: `보호 영역을 선언했지만 이후 요소 ${missing.map((l) => l.id).join(', ')}가 빠졌습니다. 미리 드러날 수 있습니다.`,
        });
      }
    }
  }

  const total = cursor;
  if (total === 0) {
    findings.push({ check: 'video.empty', level: 'error', where: artRef.id, message: '장면이 없습니다.' });
  }

  const audio = ir.audio || {};
  if (audio.bgm && audio.voiceover) {
    const bgmGain = audio.bgm.gainDb ?? -18;
    const voGain = audio.voiceover.gainDb ?? 0;
    if (bgmGain > voGain - 8) {
      findings.push({
        check: 'audio.balance',
        level: 'warn',
        where: `${artRef.id} → audio`,
        message: `BGM(${bgmGain}dB)이 보이스오버(${voGain}dB) 대비 큽니다. 최소 8dB 아래로 낮추세요.`,
      });
    }
  }
  for (const key of ['voiceover', 'bgm']) {
    const track = audio[key];
    if (track?.path && !fs.existsSync(path.resolve(ctx.dir, track.path))) {
      findings.push({
        check: 'audio.missing',
        level: 'error',
        where: `${artRef.id} → audio.${key}`,
        message: `오디오 파일이 없습니다: ${track.path}`,
      });
    }
  }
  if (ir.captions?.srt && !fs.existsSync(path.resolve(ctx.dir, ir.captions.srt))) {
    findings.push({
      check: 'captions.missing',
      level: 'error',
      where: `${artRef.id} → captions.srt`,
      message: `자막 파일이 없습니다: ${ir.captions.srt}`,
    });
  }

  return findings;
}

function checkDeck(ctx, artRef, ir) {
  const findings = [];
  const slides = ir.slides || [];
  if (slides.length === 0) {
    findings.push({ check: 'deck.empty', level: 'error', where: artRef.id, message: '슬라이드가 없습니다.' });
  }
  const seen = new Set();
  for (const slide of slides) {
    if (seen.has(slide.id)) {
      findings.push({
        check: 'deck.duplicateId',
        level: 'error',
        where: `${artRef.id} → slides.${slide.id}`,
        message: '슬라이드 id가 중복됩니다.',
      });
    }
    seen.add(slide.id);
    const bullets = (slide.blocks || []).filter((b) => b.kind === 'bullets');
    for (const block of bullets) {
      if ((block.items || []).length > 7) {
        findings.push({
          check: 'deck.bulletCount',
          level: 'warn',
          where: `${artRef.id} → slides.${slide.id}.${block.id}`,
          message: `불릿 ${block.items.length}개 — 7개를 넘으면 슬라이드를 나누는 편이 낫습니다.`,
        });
      }
    }
  }
  return findings;
}

/** PPTX가 실제로 열리는 zip인지, 필수 파트가 있는지 확인한다(외부 의존성 없음). */
function checkPptx(abs, where) {
  const findings = [];
  const buf = fs.readFileSync(abs);
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    findings.push({ check: 'pptx.zip', level: 'error', where, message: 'zip(PPTX) 파일이 아닙니다.' });
    return findings;
  }
  const text = buf.toString('latin1');
  const required = ['[Content_Types].xml', 'ppt/presentation.xml'];
  for (const part of required) {
    if (!text.includes(part)) {
      findings.push({ check: 'pptx.part', level: 'error', where, message: `필수 파트가 없습니다: ${part}` });
    }
  }
  const slideCount = (text.match(/ppt\/slides\/slide\d+\.xml/g) || []).length;
  if (slideCount === 0) {
    findings.push({ check: 'pptx.slides', level: 'error', where, message: '슬라이드 파트를 찾을 수 없습니다.' });
  }
  return findings;
}
