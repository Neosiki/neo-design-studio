/**
 * project.mjs — 매니페스트 로드/저장, 캐시, 승인 게이트
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, sha256File, nowIso, repoRoot, EXIT, log } from './util.mjs';
import { validate } from './schema.mjs';
import { artifactFreshness } from './freshness.mjs';

export const MANIFEST_NAME = 'design-project.json';
export const SUPPORTED_SCHEMA_MAJOR = '1';

/** render/export 전에 approved 또는 waived여야 하는 게이트 */
export const REQUIRED_GATES = {
  build: ['direction'],
  render: ['direction', 'outline'],
  export: ['direction', 'outline', 'draft'],
};

export function loadSchema(name) {
  return readJson(path.join(repoRoot(), 'schemas', name));
}

/** cwd에서 위로 올라가며 design-project.json을 찾는다. */
export function findProjectDir(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, MANIFEST_NAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadProject(dirHint) {
  const dir = dirHint ? path.resolve(dirHint) : findProjectDir();
  if (!dir || !fs.existsSync(path.join(dir, MANIFEST_NAME))) {
    const err = new Error(`${MANIFEST_NAME}을 찾을 수 없습니다. design init으로 먼저 프로젝트를 만드세요.`);
    err.exitCode = EXIT.NOT_FOUND;
    throw err;
  }
  const file = path.join(dir, MANIFEST_NAME);
  const manifest = readJson(file);
  const major = String(manifest.schemaVersion || '').split('.')[0];
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    const err = new Error(
      `매니페스트 스키마 버전 ${manifest.schemaVersion}은 이 CLI(${SUPPORTED_SCHEMA_MAJOR}.x)와 호환되지 않습니다.`
    );
    err.exitCode = EXIT.SCHEMA_INVALID;
    throw err;
  }
  return { dir, file, manifest };
}

export function saveProject(ctx, { command, result = 'ok', note } = {}) {
  ctx.manifest.updatedAt = nowIso();
  if (command) {
    ctx.manifest.history = (ctx.manifest.history || []).slice(-49);
    ctx.manifest.history.push({ at: ctx.manifest.updatedAt, command, result, ...(note ? { note } : {}) });
  }
  writeJson(ctx.file, ctx.manifest);
}

export function validateManifest(manifest) {
  return validate(manifest, loadSchema('project.schema.json'));
}

export function validateArtifactIr(ir) {
  return validate(ir, loadSchema('artifact.schema.json'));
}

export function loadArtifactIr(ctx, artifactRef) {
  const file = path.resolve(ctx.dir, artifactRef.ir);
  if (!fs.existsSync(file)) return { file, ir: null };
  return { file, ir: readJson(file) };
}

/* ── 승인 게이트 ───────────────────────────────────────────────── */

export function gateState(manifest, name) {
  return manifest.approvals?.[name]?.state || 'pending';
}

/**
 * 명령 실행에 필요한 게이트가 통과됐는지 확인한다.
 * 반환: { ok, blocked: [{ gate, state }] }
 */
export function checkGates(manifest, command) {
  const needed = REQUIRED_GATES[command] || [];
  const blocked = needed
    .map((gate) => ({ gate, state: gateState(manifest, gate) }))
    .filter(({ state }) => state !== 'approved' && state !== 'waived');
  return { ok: blocked.length === 0, blocked };
}

export const GATE_HELP = {
  facts: '핵심 원칙 #0: 제품·버전·규격 단언을 WebSearch로 확인하고 productFacts[]에 근거를 남기세요.',
  assets: '자산 협의: 브랜드 로고·폰트·스크린샷의 출처와 라이선스를 assets[]에 등록하세요.',
  direction: '삼방향 하드 게이트: 실제 초안 3개를 보여주고 사용자가 고른 결과를 style.candidates[]에 기록하세요.',
  outline: '구성 승인: 슬라이드·장면·섹션 구성을 사용자에게 확인받으세요.',
  draft: '초안 승인: 렌더 비용이 큰 작업 전에 시안을 확인받으세요.',
  final: '최종 승인: 배포 전 마지막 확인.',
};

/* ── 입력 캐시 ────────────────────────────────────────────────── */

/**
 * 프로젝트가 의존하는 입력 파일(에셋, IR, 레퍼런스 로컬 파일)의 현재 해시를 구한다.
 */
export function computeInputHashes(ctx) {
  const hashes = {};
  const add = (rel) => {
    if (!rel) return;
    const abs = path.resolve(ctx.dir, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return;
    hashes[rel] = sha256File(abs);
  };
  for (const asset of ctx.manifest.assets || []) add(asset.path);
  for (const ref of ctx.manifest.references || []) add(ref.path);
  for (const src of ctx.manifest.sources || []) add(src.path);
  for (const art of ctx.manifest.artifacts || []) add(art.ir);
  return hashes;
}

/**
 * 캐시와 비교해 변경된 입력만 돌려준다.
 * 반환: { changed: [rel], added: [rel], removed: [rel], unchanged: n }
 */
export function diffInputs(ctx) {
  const current = computeInputHashes(ctx);
  const cached = ctx.manifest.cache?.inputs || {};
  const changed = [];
  const added = [];
  let unchanged = 0;
  for (const [rel, hash] of Object.entries(current)) {
    if (!(rel in cached)) added.push(rel);
    else if (cached[rel] !== hash) changed.push(rel);
    else unchanged += 1;
  }
  const removed = Object.keys(cached).filter((rel) => !(rel in current));
  return { current, changed, added, removed, unchanged };
}

export function commitInputCache(ctx, current) {
  ctx.manifest.cache = { inputs: current };
}

/** 산출물이 최신인지 판단: 기록된 해시와 실제 파일이 같고, 입력이 안 바뀌었으면 최신 */
export function getArtifactFreshness(ctx, artifactRef, inputsDirty = false) { return artifactFreshness(ctx, artifactRef, inputsDirty); }

export function isArtifactFresh(ctx, artifactRef, inputsDirty) { return getArtifactFreshness(ctx, artifactRef, inputsDirty).fresh; }

export function stampOutput(ctx, out) {
  const abs = path.resolve(ctx.dir, out.path);
  if (!fs.existsSync(abs)) return out;
  const stat = fs.statSync(abs);
  return { ...out, sha256: sha256File(abs), bytes: stat.size, renderedAt: nowIso() };
}

export function printGateBlock(blocked) {
  log.error('승인 게이트가 통과되지 않아 중단합니다.');
  for (const { gate, state } of blocked) {
    log.hint(`${gate}: ${state} — ${GATE_HELP[gate] || ''}`);
  }
  log.hint('사용자 확인을 받은 뒤: design approve <gate> --note "..." --evidence path1,path2');
  log.hint('사용자가 명시적으로 건너뛰기를 요청했다면: design approve <gate> --waive --note "사용자 원문"');
}
