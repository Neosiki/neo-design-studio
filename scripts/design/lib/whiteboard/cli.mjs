/**
 * whiteboard/cli.mjs — design whiteboard <plan|annotate|preview|render|verify>
 *
 * 이 플러그인은 기본 영상 엔진에 섞이지 않는다. 영상 IR의
 * `layers[].render.plugin === 'whiteboard'` 라는 한 지점으로만 붙고,
 * 나머지(매니페스트·승인 게이트·검수·캐시·시크 렌더)는 전부 P0 기반 구조를 그대로 쓴다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXIT, log, c, writeJson, readJson, repoRoot, nowIso } from '../util.mjs';
import { validate } from '../schema.mjs';
import { loadProject, saveProject, loadArtifactIr, validateArtifactIr, checkGates, printGateBlock, stampOutput } from '../project.mjs';
import { planWhiteboardIr, DEFAULTS } from './plan.mjs';
import { renderAnnotator } from './annotate.mjs';
import { auditMask, deriveProtectedRegions } from '../reveal-mask.mjs';
import { renderArtifactHtml } from '../render/html.mjs';
import { buildMixPlan, writeMixScript } from './audio.mjs';
import { createCheckpoint } from '../checkpoint.mjs';

const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

function loadSchema(name) {
  return readJson(path.join(repoRoot(), 'schemas', name));
}

/**
 * 테마 토큰. 아무것도 주지 않으면 브랜드 토큰을 그대로 상속한다 —
 * 원본 저장소처럼 미색 종이를 강요하지 않기 위한 기본값이다.
 */
function themeFromFlags(flags) {
  const theme = {};
  for (const key of ['paper', 'ink', 'accent']) {
    if (typeof flags[key] === 'string') theme[key] = flags[key];
  }
  if (flags.strokeWidth) theme.strokeWidth = Number(flags.strokeWidth);
  if (flags.speed) theme.pxPerSecond = Number(flags.speed);
  if (flags.grain) theme.grain = Number(flags.grain);
  return Object.keys(theme).length ? theme : null;
}

/** whiteboard 레이어만 골라 whiteboard-scene 스키마로 검증한다. */
function validateWhiteboardSpecs(ir) {
  const schema = loadSchema('whiteboard-scene.schema.json');
  const errors = [];
  for (const scene of ir.scenes || []) {
    for (const layer of scene.layers || []) {
      if (layer.render?.plugin !== 'whiteboard') continue;
      const r = validate(layer.render, schema);
      for (const err of r.errors) {
        errors.push({ where: `${scene.id}.${layer.id}.render${err.path ? `.${err.path}` : ''}`, message: err.message });
      }
    }
  }
  return errors;
}

function findArtifact(ctx, id) {
  const arts = (ctx.manifest.artifacts || []).filter((a) => a.type === 'video');
  if (arts.length === 0) return null;
  if (id) return arts.find((a) => a.id === id) || null;
  // whiteboard 레이어가 있는 영상을 우선 고른다
  for (const art of arts) {
    const { ir } = loadArtifactIr(ctx, art);
    if (ir?.scenes?.some((s) => (s.layers || []).some((l) => l.render?.plugin === 'whiteboard'))) return art;
  }
  return arts[0];
}

/* ── plan ─────────────────────────────────────────────────────── */

function cmdPlan(args) {
  const srtPath = args.positional[1];
  if (!srtPath) {
    log.error('SRT 파일 경로가 필요합니다.');
    log.hint('design whiteboard plan narration.srt [--artifact teaser] [--mode grid] [--target 28]');
    return EXIT.USAGE;
  }

  const ctx = loadProject(args.flags.project);
  const abs = path.resolve(ctx.dir, srtPath);
  if (!fs.existsSync(abs)) {
    log.error(`SRT 파일이 없습니다: ${srtPath}`);
    return EXIT.NOT_FOUND;
  }

  const artifactId = args.flags.artifact || 'whiteboard';
  const existing = (ctx.manifest.artifacts || []).find((a) => a.id === artifactId);
  const irRel = existing?.ir || `ir/${artifactId}.json`;

  const { ir, plan, warnings } = planWhiteboardIr(fs.readFileSync(abs), {
    id: artifactId,
    title: args.flags.title || existing?.title || '화이트보드 영상',
    mode: args.flags.mode,
    lang: args.flags.lang,
    targetMs: args.flags.target ? Number(args.flags.target) * 1000 : DEFAULTS.targetMs,
    minMs: args.flags.min ? Number(args.flags.min) * 1000 : DEFAULTS.minMs,
    maxMs: args.flags.max ? Number(args.flags.max) * 1000 : DEFAULTS.maxMs,
    srtPath: path.relative(ctx.dir, abs).split(path.sep).join('/'),
    voiceoverPath: args.flags.voiceover,
    bgmPath: args.flags.bgm,
    width: args.flags.width ? Number(args.flags.width) : undefined,
    height: args.flags.height ? Number(args.flags.height) : undefined,
    theme: themeFromFlags(args.flags),
  });

  for (const w of warnings) log.warn(w);

  // 테마 토큰과 손 이미지를 프로젝트 자산에서 연결한다 (하드코딩 금지)
  const handAsset = (ctx.manifest.assets || []).find((a) => a.id === (args.flags.hand || 'hand'));
  if (handAsset) {
    for (const scene of ir.scenes) {
      for (const layer of scene.layers) {
        if (layer.render?.plugin === 'whiteboard') layer.render.hand = { assetId: handAsset.id, show: true };
      }
    }
    log.hint(`손 이미지: ${handAsset.id} (${handAsset.path})`);
  } else {
    log.hint('손 이미지 자산이 없습니다. --hand <assetId>로 지정하면 펜을 든 손이 경로를 따라갑니다.');
  }

  const schemaResult = validateArtifactIr(ir);
  if (!schemaResult.valid) {
    for (const err of schemaResult.errors) log.error(`${err.path}: ${err.message}`);
    return EXIT.SCHEMA_INVALID;
  }
  const wbErrors = validateWhiteboardSpecs(ir);
  if (wbErrors.length) {
    for (const err of wbErrors) log.error(`${err.where}: ${err.message}`);
    return EXIT.SCHEMA_INVALID;
  }

  writeJson(path.resolve(ctx.dir, irRel), ir);

  if (!existing) {
    ctx.manifest.artifacts.push({
      id: artifactId,
      type: 'video',
      title: ir.title,
      ir: irRel,
      status: 'planned',
      outputs: [],
    });
  } else {
    existing.status = 'planned';
  }

  console.log(`\n${c.bold('장면 계획')} ${c.dim(`(${plan.lang} · 총 ${(plan.totalMs / 1000).toFixed(1)}초)`)}`);
  for (const s of plan.scenes) {
    console.log(`  ${s.id}  ${String((s.durationMs / 1000).toFixed(1)).padStart(5)}초  자막 ${String(s.cueCount).padStart(2)}개  ${c.dim(s.reason)}`);
  }
  console.log('');
  log.ok(`IR 생성 → ${irRel}`);
  saveProject(ctx, { command: `whiteboard plan ${srtPath}`, note: `${plan.scenes.length}개 장면` });
  log.info('');
  log.info(`다음 단계: ${c.bold('design whiteboard annotate')} — 브라우저에서 영역·순서·시간을 고칩니다.`);
  return EXIT.OK;
}

/* ── annotate ─────────────────────────────────────────────────── */

function cmdAnnotate(args) {
  const ctx = loadProject(args.flags.project);
  const art = findArtifact(ctx, args.flags.artifact);
  if (!art) {
    log.error('영상 산출물을 찾을 수 없습니다. design whiteboard plan을 먼저 실행하세요.');
    return EXIT.NOT_FOUND;
  }
  const { file, ir } = loadArtifactIr(ctx, art);
  if (!ir) {
    log.error(`IR 파일이 없습니다: ${art.ir}`);
    return EXIT.NOT_FOUND;
  }

  // --apply: 편집기가 내려준 주석 JSON을 반영한다 (검사 통과해야 반영)
  if (args.flags.apply) {
    const patchPath = path.resolve(ctx.dir, String(args.flags.apply));
    if (!fs.existsSync(patchPath)) {
      log.error(`주석 파일이 없습니다: ${args.flags.apply}`);
      return EXIT.NOT_FOUND;
    }
    const patch = readJson(patchPath);
    if (patch.id && patch.id !== ir.id) {
      log.error(`주석 파일의 id(${patch.id})가 IR(${ir.id})과 다릅니다.`);
      return EXIT.USAGE;
    }

    const next = { ...ir, canvas: patch.canvas || ir.canvas, scenes: patch.scenes || ir.scenes };
    for (const scene of next.scenes) {
      const derived = deriveProtectedRegions(scene.layers || []);
      scene.layers.forEach((layer, i) => {
        if (derived[i].length) layer.protectedRegions = derived[i];
        else delete layer.protectedRegions;
      });
    }

    const schemaResult = validateArtifactIr(next);
    if (!schemaResult.valid) {
      for (const err of schemaResult.errors) log.error(`${err.path}: ${err.message}`);
      log.hint('주석을 반영하지 않았습니다. 원본 IR은 그대로입니다.');
      return EXIT.SCHEMA_INVALID;
    }
    const wbErrors = validateWhiteboardSpecs(next);
    if (wbErrors.length) {
      for (const err of wbErrors) log.error(`${err.where}: ${err.message}`);
      return EXIT.SCHEMA_INVALID;
    }
    let maskProblems = 0;
    for (const scene of next.scenes) {
      for (const p of auditMask(scene.layers || [], next.canvas)) {
        log.error(`${scene.id}.${p.layer}: ${p.message}`);
        maskProblems += 1;
      }
    }
    if (maskProblems) {
      log.hint('주석을 반영하지 않았습니다. 편집기에서 순서나 영역을 고치세요.');
      return EXIT.QA_FAILED;
    }

    const cp = createCheckpoint(ctx, { label: '화이트보드 주석 반영 직전', auto: true });
    writeJson(file, next);
    log.ok(`주석 반영 → ${art.ir}`);
    log.hint(`되돌리려면: design checkpoint restore ${cp.id}`);
    saveProject(ctx, { command: `whiteboard annotate --apply ${args.flags.apply}` });
    log.info('');
    log.info(`다음 단계: ${c.bold('design whiteboard render')}`);
    return EXIT.OK;
  }

  const outPath = path.resolve(ctx.dir, args.flags.out || `out/${art.id}/annotate.html`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderAnnotator(ir), 'utf8');

  log.ok(`편집기 생성 → ${path.relative(ctx.dir, outPath).split(path.sep).join('/')}`);
  log.info('');
  log.info('1. 브라우저로 열어 영역·순서·시간·자막을 고칩니다');
  log.info('2. 「주석 JSON 내려받기」를 누릅니다');
  log.info(`3. ${c.bold(`design whiteboard annotate --apply ${art.id}-annotation.json`)}`);
  log.hint('반영 전에 스키마·선노출 검사를 다시 통과해야 합니다. 통과하지 못하면 원본은 건드리지 않습니다.');
  return EXIT.OK;
}

/* ── preview / render ─────────────────────────────────────────── */

function renderHtml(ctx, art, ir, outFlag) {
  const outDir = path.resolve(ctx.dir, outFlag || 'out', art.id);
  const outputs = renderArtifactHtml(ctx, art, ir, outDir);
  return outputs.map((o) => stampOutput(ctx, o));
}

function cmdPreview(args) {
  const ctx = loadProject(args.flags.project);
  const art = findArtifact(ctx, args.flags.artifact);
  if (!art) return notFound();
  const { ir } = loadArtifactIr(ctx, art);
  if (!ir) return notFound();

  const outputs = renderHtml(ctx, art, ir, args.flags.out);
  for (const o of outputs) log.ok(`${o.path} (${o.bytes.toLocaleString('ko-KR')} bytes)`);
  log.info('');
  log.hint('브라우저로 열어 확인하세요. window.seek(초)로 아무 시각이나 볼 수 있습니다.');
  log.hint('미리보기는 매니페스트를 바꾸지 않습니다. 확정하려면 design whiteboard render.');
  return EXIT.OK;
}

function cmdRender(args) {
  const ctx = loadProject(args.flags.project);

  const gates = checkGates(ctx.manifest, 'render');
  if (!gates.ok && !args.flags.force) {
    printGateBlock(gates.blocked);
    saveProject(ctx, { command: 'whiteboard render', result: 'blocked' });
    return EXIT.GATE_BLOCKED;
  }

  const art = findArtifact(ctx, args.flags.artifact);
  if (!art) return notFound();
  const { ir } = loadArtifactIr(ctx, art);
  if (!ir) return notFound();

  const outputs = renderHtml(ctx, art, ir, args.flags.out);
  art.outputs = [...(art.outputs || []).filter((o) => o.format !== 'html'), ...outputs];
  art.status = 'rendered';
  for (const o of outputs) log.ok(`${o.path} (${o.bytes.toLocaleString('ko-KR')} bytes)`);

  // 오디오 믹싱 계획: 음성·BGM·자막 포함본과 무음 작업본을 모두 낸다
  const mix = buildMixPlan(ctx, art, ir);
  const outDir = path.resolve(ctx.dir, args.flags.out || 'out', art.id);
  const scriptPath = writeMixScript(outDir, mix);
  writeJson(path.join(outDir, 'mix-plan.json'), mix);

  console.log('');
  log.step('영상 · 오디오 출력 계획');
  for (const target of mix.targets) {
    console.log(`  ${target.name.padEnd(18)} ${c.dim(target.description)}`);
  }
  log.hint(`믹싱 스크립트: ${path.relative(ctx.dir, scriptPath).split(path.sep).join('/')}`);
  if (mix.missing.length) {
    log.warn(`오디오 소스가 없습니다: ${mix.missing.join(', ')} — 무음 작업본만 만들 수 있습니다.`);
  }

  saveProject(ctx, { command: 'whiteboard render' });
  log.info('');
  log.info(`다음 단계: ${c.bold('design whiteboard verify')} → ${c.bold('design export --format mp4')}`);
  return EXIT.OK;
}

/* ── verify ───────────────────────────────────────────────────── */

function cmdVerify(args) {
  const ctx = loadProject(args.flags.project);
  const art = findArtifact(ctx, args.flags.artifact);
  if (!art) return notFound();
  const { ir } = loadArtifactIr(ctx, art);
  if (!ir) return notFound();

  let errors = 0;
  let warnings = 0;

  const schemaResult = validateArtifactIr(ir);
  for (const err of schemaResult.errors) { log.error(`IR ${err.path}: ${err.message}`); errors += 1; }
  for (const err of validateWhiteboardSpecs(ir)) { log.error(`${err.where}: ${err.message}`); errors += 1; }
  if (errors === 0) log.ok('스키마 검증 통과 (영상 IR + whiteboard 주석)');

  // 선노출 검사 — 이 플러그인의 존재 이유
  let maskProblems = 0;
  for (const scene of ir.scenes || []) {
    for (const p of auditMask(scene.layers || [], ir.canvas)) {
      log.error(`${scene.id}.${p.layer}: ${p.message}`);
      maskProblems += 1;
    }
  }
  if (maskProblems === 0) log.ok('선노출 검사 통과 (겹치는 요소가 모두 보호 영역으로 선언됨)');
  errors += maskProblems;

  // 자막 ↔ 장면 연결
  let unlinked = 0;
  for (const scene of ir.scenes || []) {
    if (!scene.subtitle) { unlinked += 1; log.warn(`${scene.id}: 대응 자막이 없습니다.`); }
  }
  warnings += unlinked;
  if (unlinked === 0) log.ok(`자막 연결 확인 (${(ir.scenes || []).length}개 장면 전부)`);

  // 모드 일관성
  const modes = new Set();
  for (const scene of ir.scenes || []) {
    for (const layer of scene.layers || []) {
      if (layer.render?.plugin === 'whiteboard') modes.add(layer.render.mode || 'skeleton');
    }
  }
  if (modes.size > 1) {
    log.warn(`필기 모드가 섞여 있습니다: ${[...modes].join(', ')} — 의도한 것이 아니면 하나로 통일하세요.`);
    warnings += 1;
  } else if (modes.size === 1) {
    log.ok(`필기 모드: ${[...modes][0]}`);
  }

  // 오디오
  const mix = buildMixPlan(ctx, art, ir);
  if (mix.missing.length) { log.warn(`오디오 소스 없음: ${mix.missing.join(', ')}`); warnings += 1; }
  else log.ok('오디오 소스 확인 (음성·BGM 파일 존재)');

  console.log('');
  if (errors) { log.error(`검증 실패 — 오류 ${errors}건, 경고 ${warnings}건`); return EXIT.QA_FAILED; }
  if (warnings) log.warn(`경고 ${warnings}건 — 통과하되 확인이 필요합니다.`);
  else log.ok('검증 통과');
  return EXIT.OK;
}

function notFound() {
  log.error('영상 산출물 또는 IR을 찾을 수 없습니다.');
  log.hint('design whiteboard plan <narration.srt> 를 먼저 실행하세요.');
  return EXIT.NOT_FOUND;
}

/* ── 진입점 ───────────────────────────────────────────────────── */

const SUB = { plan: cmdPlan, annotate: cmdAnnotate, preview: cmdPreview, render: cmdRender, verify: cmdVerify };

export function whiteboardCommand(args) {
  const sub = args.positional[0];
  if (!sub || sub === 'help') {
    console.log(`
${c.bold('design whiteboard')} — SRT 기반 화이트보드 영상 (선택형 플러그인)

  plan <file.srt>   자막을 장면 계획으로 바꾸고 영상 IR을 만든다
                      --artifact <id> --mode skeleton|grid --lang ko|en|zh|ja
                      --target 28 --min 18 --max 38  (초)
                      --hand <assetId> --voiceover <경로> --bgm <경로>
                      --paper #hex --ink #hex --accent #hex --strokeWidth 6 --speed 900
                      (테마를 주지 않으면 브랜드 토큰을 그대로 상속한다)
  annotate          브라우저 주석 편집기를 만든다
                      --apply <주석.json> 으로 편집 결과를 반영 (검사 통과해야 반영됨)
  preview           매니페스트를 건드리지 않고 HTML만 렌더링한다
  render            렌더 + 오디오 믹싱 계획 (승인 게이트 적용)
  verify            스키마 · 선노출 · 자막 연결 · 모드 · 오디오 검증

${c.dim('영상 IR의 layers[].render.plugin === "whiteboard" 한 지점으로만 붙는다.')}
${c.dim('매니페스트 · 승인 게이트 · 검수 · 캐시 · 시크 렌더는 전부 기본 구조를 그대로 쓴다.')}
`);
    return EXIT.OK;
  }
  const handler = SUB[sub];
  if (!handler) {
    log.error(`알 수 없는 하위 명령: ${sub}`);
    log.hint(`가능: ${Object.keys(SUB).join(', ')}`);
    return EXIT.USAGE;
  }
  return handler(args);
}
