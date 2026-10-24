/** Optional local film scaffold and sidecar checks. This module never calls a model. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validate } from '../schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const TEMPLATE = path.join(ROOT, 'assets', 'openfilm');
const FILES = ['film.html', 'scenes/title.html', 'film-plan.json'];

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function entryExists(file) {
  try { fs.lstatSync(file); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/** Resolve relative files without allowing absolute paths, traversal, ADS or symlink escape. */
export function localFile(root, relative) {
  root = fs.realpathSync(root);
  if (typeof relative !== 'string' || !relative || /[\0?#:]/.test(relative)
      || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative)
      || relative.replaceAll('\\', '/').split('/').includes('..')) {
    throw new Error(`프로젝트 상대 파일 경로만 허용됩니다: ${String(relative)}`);
  }
  const absolute = path.resolve(root, ...relative.replaceAll('\\', '/').split('/'));
  if (!inside(root, absolute)) throw new Error(`프로젝트 밖 경로입니다: ${relative}`);
  const real = fs.realpathSync(absolute);
  if (!inside(root, real)) throw new Error(`심볼릭 링크가 프로젝트 밖을 가리킵니다: ${relative}`);
  if (!fs.statSync(real).isFile()) throw new Error(`일반 파일이 아닙니다: ${relative}`);
  return real;
}

/** Create three original local templates. Any existing destination aborts before file writes. */
export function scaffoldFilm(dir) {
  const destination = path.resolve(dir);
  fs.mkdirSync(destination, { recursive: true });
  const root = fs.realpathSync(destination);
  for (const relative of FILES) {
    const target = path.join(root, relative);
    if (entryExists(target)) throw new Error(`기존 파일을 덮어쓰지 않습니다: ${relative}`);
    let parent = path.dirname(target);
    while (!entryExists(parent)) parent = path.dirname(parent);
    if (!inside(root, fs.realpathSync(parent))) throw new Error(`대상 디렉터리가 프로젝트 밖을 가리킵니다: ${relative}`);
  }
  const created = [];
  for (const relative of FILES) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!inside(root, fs.realpathSync(path.dirname(target)))) throw new Error(`대상 디렉터리가 프로젝트 밖을 가리킵니다: ${relative}`);
    fs.writeFileSync(target, fs.readFileSync(path.join(TEMPLATE, relative)), { flag: 'wx' });
    created.push(relative);
  }
  return { dir: destination, created };
}

/** Structural, reference and frozen-file checks. Pending human review is a warning, never a pass. */
export function checkFilmPlan(dir) {
  const errors = [];
  const warnings = [];
  const fail = (check, message) => errors.push({ check, message });
  const warn = (check, message) => warnings.push({ check, message });
  const result = () => ({ ok: errors.length === 0, errors, warnings });
  let root;
  let plan;
  try {
    root = fs.realpathSync(path.resolve(dir));
    const file = localFile(root, 'film-plan.json');
    try { plan = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
      fail('film.plan.json', `film-plan.json을 읽을 수 없습니다: ${error.message}`);
      return result();
    }
  } catch (error) {
    fail('film.plan.file', `film-plan.json을 찾거나 안전하게 열 수 없습니다: ${error.message}`);
    return result();
  }

  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', 'film-plan.schema.json'), 'utf8'));
  const validation = validate(plan, schema);
  for (const error of validation.errors) fail('film.schema', `${error.path || '(root)'}: ${error.message}`);
  if (!validation.valid) return result();

  const index = (records, label) => {
    const found = new Map();
    for (const record of records) {
      if (found.has(record.id)) fail('film.id.duplicate', `${label} id가 중복됩니다: ${record.id}`);
      found.set(record.id, record);
    }
    return found;
  };
  const shots = index(plan.shots, 'shot');
  try { localFile(root, 'film.html'); } catch (error) { fail('film.edit.file', error.message); }
  const characters = index(plan.characters, 'character');
  const assets = index(plan.assets, 'asset');
  index(plan.generationAttempts, 'generationAttempt');

  const refs = (ids, known, where) => {
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) fail('film.ref.duplicate', `${where}: 참조가 중복됩니다: ${id}`);
      seen.add(id);
      if (!known.has(id)) fail('film.ref.missing', `${where}: 등록되지 않은 id입니다: ${id}`);
    }
  };
  const review = (value, where) => {
    if (value.status === 'pending') warn('film.review.pending', `${where}: 수동 시각 검수가 남아 있습니다.`);
    if (value.status === 'failed') fail('film.review.failed', `${where}: 수동 시각 검수에서 반려됐습니다.${value.notes ? ` ${value.notes}` : ''}`);
  };
  review(plan.visualReview, 'film');

  for (const shot of plan.shots) {
    if (!Number.isFinite(shot.duration) || shot.duration <= 0) fail('film.duration', `${shot.id}: duration은 0보다 큰 유한한 초 단위 값이어야 합니다.`);
    refs(shot.characterIds, characters, `shot ${shot.id}.characterIds`);
    try { localFile(root, shot.page); } catch (error) { fail('film.shot.page', `${shot.id}: ${error.message}`); }
    review(shot.visualReview, `shot ${shot.id}`);
  }
  for (const character of plan.characters) refs(character.referenceAssetIds, assets, `character ${character.id}.referenceAssetIds`);
  for (const asset of plan.assets) {
    try {
      const file = localFile(root, asset.path);
      const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (actual !== asset.sha256) fail('film.asset.hash', `${asset.id}: 기록한 SHA-256과 파일이 다릅니다.`);
    } catch (error) { fail('film.asset.file', `${asset.id}: ${error.message}`); }
    if (asset.provenance.origin === 'unknown') fail('film.asset.provenance', `${asset.id}: 자산 출처를 먼저 확인해야 합니다.`);
  }
  const selected = new Set();
  for (const attempt of plan.generationAttempts) {
    if (!shots.has(attempt.shotId)) fail('film.ref.missing', `attempt ${attempt.id}: 등록되지 않은 shotId입니다: ${attempt.shotId}`);
    refs(attempt.referenceAssetIds, assets, `attempt ${attempt.id}.referenceAssetIds`);
    if (attempt.outputAssetId && !assets.has(attempt.outputAssetId)) fail('film.attempt.output', `attempt ${attempt.id}: 산출물 자산이 없습니다: ${attempt.outputAssetId}`);
    if (attempt.selected) {
      if (selected.has(attempt.shotId)) fail('film.attempt.selection', `${attempt.shotId}: 선택한 생성 결과는 샷당 하나만 허용됩니다.`);
      selected.add(attempt.shotId);
    }
  }
  return result();
}
