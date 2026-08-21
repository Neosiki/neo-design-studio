/**
 * checkpoint.mjs — 작업 스냅샷과 변경 전후 비교
 *
 * 편집기가 생기면 "되돌리기"가 필요해진다. git이 있으면 git이 낫지만, 프로젝트가
 * 저장소 밖에 있거나 아직 커밋할 상태가 아닌 경우가 대부분이라 프로젝트 안에
 * 자체 스냅샷을 둔다.
 *
 * 스냅샷 대상은 **상태를 결정하는 파일만** — 매니페스트와 IR. 산출물(out/)은 다시
 * 만들 수 있으므로 담지 않는다. 그래야 스냅샷이 가볍고, 복구가 "다시 렌더하면 된다"로
 * 끝난다.
 *
 * 저장 위치: <project>/.design/checkpoints/<id>/
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso, sha256File } from './util.mjs';
import { MANIFEST_NAME } from './project.mjs';

const DIR = path.join('.design', 'checkpoints');
const MAX_KEEP = 30;

function checkpointRoot(ctx) {
  return path.join(ctx.dir, DIR);
}

/** 스냅샷에 담을 파일 목록 (프로젝트 상대 경로) */
function trackedFiles(ctx) {
  const files = [MANIFEST_NAME];
  for (const art of ctx.manifest.artifacts || []) {
    if (art.ir && fs.existsSync(path.resolve(ctx.dir, art.ir))) files.push(art.ir);
  }
  return files;
}

export function createCheckpoint(ctx, { label = '', auto = false } = {}) {
  const at = nowIso();
  const id = `${at.replace(/[:.]/g, '-')}${auto ? '-auto' : ''}`;
  const dest = path.join(checkpointRoot(ctx), id);
  fs.mkdirSync(dest, { recursive: true });

  const files = {};
  for (const rel of trackedFiles(ctx)) {
    const src = path.resolve(ctx.dir, rel);
    if (!fs.existsSync(src)) continue;
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(src, to);
    files[rel] = sha256File(src);
  }

  const meta = {
    id,
    at,
    label,
    auto,
    files,
    artifacts: (ctx.manifest.artifacts || []).map((a) => ({ id: a.id, type: a.type, status: a.status })),
    qa: ctx.manifest.qa?.status || 'never',
  };
  writeJson(path.join(dest, 'checkpoint.json'), meta);

  prune(ctx);
  return meta;
}

/** 오래된 자동 스냅샷부터 지운다. 라벨이 붙은 것은 남긴다. */
function prune(ctx) {
  const all = listCheckpoints(ctx);
  const auto = all.filter((c) => c.auto);
  if (auto.length <= MAX_KEEP) return;
  for (const c of auto.slice(0, auto.length - MAX_KEEP)) {
    fs.rmSync(path.join(checkpointRoot(ctx), c.id), { recursive: true, force: true });
  }
}

export function listCheckpoints(ctx) {
  const root = checkpointRoot(ctx);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const metaPath = path.join(root, e.name, 'checkpoint.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        return readJson(metaPath);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function findCheckpoint(ctx, ref) {
  const all = listCheckpoints(ctx);
  if (all.length === 0) return null;
  if (!ref || ref === 'last') return all[all.length - 1];
  return all.find((c) => c.id === ref) || all.find((c) => c.id.startsWith(ref)) || all.find((c) => c.label === ref) || null;
}

/**
 * 스냅샷으로 되돌린다. 되돌리기 직전 상태도 자동으로 한 번 찍는다 —
 * 복구가 새로운 되돌릴 수 없는 행동이 되면 안 된다.
 */
export function restoreCheckpoint(ctx, meta) {
  const safety = createCheckpoint(ctx, { label: `restore 직전 (${meta.id})`, auto: true });
  const src = path.join(checkpointRoot(ctx), meta.id);
  const restored = [];
  for (const rel of Object.keys(meta.files)) {
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.resolve(ctx.dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    restored.push(rel);
  }
  return { restored, safety };
}

/* ── 변경 전후 비교 ────────────────────────────────────────────── */

/**
 * 스냅샷과 현재 상태의 차이를 구조적으로 비교한다.
 * 줄 단위 diff가 아니라 **무엇이 달라졌는지**를 낸다 — JSON 줄 diff는 사람이 못 읽는다.
 */
export function diffCheckpoint(ctx, meta) {
  const src = path.join(checkpointRoot(ctx), meta.id);
  const changes = [];

  for (const rel of new Set([...Object.keys(meta.files), ...trackedFiles(ctx)])) {
    const before = path.join(src, rel);
    const after = path.resolve(ctx.dir, rel);
    const hasBefore = fs.existsSync(before);
    const hasAfter = fs.existsSync(after);

    if (hasBefore && !hasAfter) { changes.push({ file: rel, kind: 'removed', path: '', before: '(파일 있음)', after: '(없음)' }); continue; }
    if (!hasBefore && hasAfter) { changes.push({ file: rel, kind: 'added', path: '', before: '(없음)', after: '(파일 생김)' }); continue; }
    if (!hasBefore && !hasAfter) continue;
    if (sha256File(before) === sha256File(after)) continue;

    try {
      diffJson(readJson(before), readJson(after), '', changes, rel);
    } catch {
      changes.push({ file: rel, kind: 'changed', path: '', before: '(JSON 아님)', after: '(내용 변경)' });
    }
  }

  return changes;
}

/** 검수·이력처럼 매 실행마다 바뀌는 항목은 비교에서 제외한다 (노이즈) */
const IGNORE = new Set(['updatedAt', 'history', 'qa', 'cache', 'renderedAt', 'sha256', 'bytes', 'lastRun', 'generatedAt']);

function diffJson(before, after, prefix, out, file, depth = 0) {
  if (depth > 12 || out.length > 400) return;

  const bothObjects =
    before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) === !Array.isArray(after);

  if (!bothObjects) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({ file, kind: 'changed', path: prefix, before: brief(before), after: brief(after) });
    }
    return;
  }

  if (Array.isArray(before)) {
    const key = (item, i) => (item && typeof item === 'object' && item.id ? item.id : String(i));
    const bMap = new Map(before.map((item, i) => [key(item, i), item]));
    const aMap = new Map(after.map((item, i) => [key(item, i), item]));

    for (const [k, item] of bMap) {
      if (!aMap.has(k)) out.push({ file, kind: 'removed', path: `${prefix}[${k}]`, before: brief(item), after: '(삭제)' });
    }
    for (const [k, item] of aMap) {
      if (!bMap.has(k)) { out.push({ file, kind: 'added', path: `${prefix}[${k}]`, before: '(없음)', after: brief(item) }); continue; }
      diffJson(bMap.get(k), item, `${prefix}[${k}]`, out, file, depth + 1);
    }
    // 순서 변경도 변화다 — 화이트보드에서는 등장 순서가 의미를 바꾼다
    const bOrder = [...bMap.keys()].filter((k) => aMap.has(k));
    const aOrder = [...aMap.keys()].filter((k) => bMap.has(k));
    if (bOrder.join(',') !== aOrder.join(',')) {
      out.push({ file, kind: 'reordered', path: prefix, before: bOrder.join(' → '), after: aOrder.join(' → ') });
    }
    return;
  }

  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORE.has(k)) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in after)) { out.push({ file, kind: 'removed', path: p, before: brief(before[k]), after: '(삭제)' }); continue; }
    if (!(k in before)) { out.push({ file, kind: 'added', path: p, before: '(없음)', after: brief(after[k]) }); continue; }
    diffJson(before[k], after[k], p, out, file, depth + 1);
  }
}

function brief(value, max = 60) {
  if (value === undefined) return '(없음)';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s && s.length > max ? `${s.slice(0, max)}…` : String(s);
}
