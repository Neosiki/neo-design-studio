/**
 * api/revise.mjs — 에이전트용 구조적 편집 연산
 *
 * Studio 편집기는 사람이 손으로 고치는 자리다. 에이전트에게는 그 자리가 없다 —
 * IR 전체를 다시 써서 넘기면 한 글자 고치려고 수천 줄을 왕복해야 하고, 그 과정에서
 * 관계없는 부분이 조용히 바뀐다.
 *
 * 그래서 **무엇을 바꾸는지만 말하는 연산 목록**을 받는다. 적용은 원자적이다:
 * 메모리에서 전부 적용하고 검사한 뒤, 통과했을 때만 디스크에 쓴다. 하나라도 걸리면
 * 아무것도 바뀌지 않는다. Studio 패치와 같은 보증이다.
 */

import path from 'node:path';
import { writeJson } from '../util.mjs';
import { loadArtifactIr, validateArtifactIr, validateManifest } from '../project.mjs';
import { auditMask, deriveProtectedRegions, intersect } from '../reveal-mask.mjs';

/** 연산 종류와 필요한 인자. MCP·REST 도구 설명이 여기서 나온다. */
export const OPERATIONS = {
  setText: { args: ['artifact', 'block', 'value'], optional: ['container'], desc: '블록의 텍스트를 바꾼다' },
  setItems: { args: ['artifact', 'block', 'items'], optional: ['container'], desc: '불릿 목록 항목을 바꾼다' },
  setStyle: { args: ['artifact', 'block', 'key', 'value'], optional: ['container'], desc: 'fontSize·weight·color·align·lineHeight·letterSpacing 등 스타일 한 항목을 바꾼다. lineHeight·letterSpacing을 지우면(value: null) 언어·크기별 기본값으로 돌아간다' },
  setBox: { args: ['artifact', 'block', 'box'], optional: ['container'], desc: '블록의 위치·크기를 바꾼다 {x,y,w,h}' },
  setAlt: { args: ['artifact', 'block', 'value'], optional: ['container'], desc: '이미지 대체 텍스트를 바꾼다' },
  setToken: { args: ['group', 'key', 'value'], desc: '브랜드 토큰 한 항목을 바꾼다 (group: color·radius 등)' },
  setFont: { args: ['role', 'family'], optional: ['fallback'], desc: 'display·body·mono 글꼴을 바꾼다' },
  reorder: { args: ['artifact', 'order'], optional: ['kind'], desc: '슬라이드·장면·섹션 순서를 바꾼다 (order: id 배열)' },
  setTiming: { args: ['artifact', 'scene'], optional: ['startMs', 'durationMs'], desc: '장면 길이를 바꾼다 (뒤 장면은 자동으로 밀린다)' },
  setSubtitle: { args: ['artifact', 'scene', 'value'], desc: '장면 자막을 바꾼다' },
  setLayerTiming: { args: ['artifact', 'scene', 'layer'], optional: ['enterMs', 'exitMs'], desc: '레이어 등장·퇴장 시각을 바꾼다' },
  setRegion: { args: ['artifact', 'scene', 'layer', 'region'], desc: '영상 레이어의 영역을 바꾼다 {x,y,w,h}. 블록 없이 render.art만 있는 레이어(화이트보드 등)는 이걸로 옮긴다. 보호 영역이 자동 재계산된다.' },
  addClaim: { args: ['artifact', 'block', 'text', 'sourceId'], optional: ['container', 'kind', 'locator'], desc: '주장·수치에 출처를 연결한다' },
};

class ReviseError extends Error {
  constructor(message, op, index) {
    super(index === undefined ? message : `연산 ${index + 1}(${op}): ${message}`);
    this.op = op;
  }
}

/* ── IR 탐색 ──────────────────────────────────────────────────── */

function* iterContainers(ir) {
  for (const page of ir.pages || []) {
    for (const section of page.sections || []) yield { id: section.id, blocks: section.blocks || [], node: section, kind: 'section' };
  }
  for (const slide of ir.slides || []) yield { id: slide.id, blocks: slide.blocks || [], node: slide, kind: 'slide' };
  for (const scene of ir.scenes || []) {
    yield { id: scene.id, blocks: (scene.layers || []).map((l) => l.block).filter(Boolean), node: scene, kind: 'scene' };
  }
}

function findBlock(ir, blockId, containerId) {
  const hits = [];
  for (const c of iterContainers(ir)) {
    if (containerId && c.id !== containerId) continue;
    const block = c.blocks.find((b) => b.id === blockId);
    if (block) hits.push({ container: c, block });
  }
  if (hits.length === 0) {
    const known = [...iterContainers(ir)].flatMap((c) => c.blocks.map((b) => `${c.id}/${b.id}`));
    throw new Error(`블록을 찾을 수 없습니다: ${containerId ? `${containerId}/` : ''}${blockId}. 있는 것: ${known.slice(0, 12).join(', ')}${known.length > 12 ? ` 외 ${known.length - 12}개` : ''}`);
  }
  if (hits.length > 1) {
    throw new Error(`블록 id '${blockId}'가 여러 곳에 있습니다(${hits.map((h) => h.container.id).join(', ')}). container를 함께 지정하세요.`);
  }
  return hits[0];
}

function findScene(ir, sceneId) {
  const scene = (ir.scenes || []).find((s) => s.id === sceneId);
  if (!scene) throw new Error(`장면을 찾을 수 없습니다: ${sceneId}. 있는 것: ${(ir.scenes || []).map((s) => s.id).join(', ')}`);
  return scene;
}

function requireIr(state, artifactId) {
  if (!state.irs[artifactId]) {
    throw new Error(`산출물을 찾을 수 없습니다: ${artifactId}. 있는 것: ${Object.keys(state.irs).join(', ')}`);
  }
  return state.irs[artifactId];
}

/* ── 연산 적용 ────────────────────────────────────────────────── */

const APPLY = {
  setText(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    block.text = String(op.value);
    if (block.kind !== 'image' && block.kind !== 'logo' && block.alt !== undefined) block.alt = block.text;
    // 화이트보드 레이어는 그리는 대상도 같이 바꿔야 한다
    for (const scene of ir.scenes || []) {
      for (const layer of scene.layers || []) {
        if (layer.block?.id === op.block && layer.render?.art?.text) layer.render.art.text.content = block.text;
      }
    }
    return `${op.artifact}/${op.block} 텍스트`;
  },

  setItems(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    if (!Array.isArray(op.items)) throw new Error('items는 문자열 배열이어야 합니다');
    block.items = op.items.map(String);
    return `${op.artifact}/${op.block} 항목 ${block.items.length}개`;
  },

  setStyle(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    block.style = block.style || {};
    if (op.value === null || op.value === '') delete block.style[op.key];
    else block.style[op.key] = op.value;
    return `${op.artifact}/${op.block} style.${op.key}`;
  },

  setBox(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    for (const k of ['x', 'y', 'w', 'h']) {
      if (typeof op.box?.[k] !== 'number') throw new Error(`box.${k}가 숫자가 아닙니다`);
    }
    block.box = { x: op.box.x, y: op.box.y, w: op.box.w, h: op.box.h };
    // 영상 레이어면 region도 따라간다 (마스크 계산의 기준)
    for (const scene of ir.scenes || []) {
      for (const layer of scene.layers || []) {
        if (layer.block?.id === op.block) layer.region = { ...block.box };
      }
    }
    reprotect(ir);
    return `${op.artifact}/${op.block} 위치·크기`;
  },

  setAlt(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    block.alt = String(op.value);
    return `${op.artifact}/${op.block} alt`;
  },

  setToken(state, op) {
    const tokens = state.manifest.brand.tokens;
    if (!tokens[op.group]) throw new Error(`토큰 그룹이 없습니다: ${op.group}. 있는 것: ${Object.keys(tokens).join(', ')}`);
    tokens[op.group][op.key] = op.value;
    return `토큰 ${op.group}.${op.key} = ${op.value}`;
  },

  setFont(state, op) {
    const typo = state.manifest.brand.tokens.typography;
    if (!['display', 'body', 'mono'].includes(op.role)) throw new Error(`role은 display·body·mono 중 하나여야 합니다`);
    typo[op.role] = { ...(typo[op.role] || {}), family: String(op.family) };
    if (op.fallback) typo[op.role].fallback = op.fallback.map(String);
    return `글꼴 ${op.role} = ${op.family}`;
  },

  reorder(state, op) {
    const ir = requireIr(state, op.artifact);
    const kind = op.kind || (ir.slides ? 'slides' : ir.scenes ? 'scenes' : 'sections');
    const arr = kind === 'sections' ? ir.pages?.[0]?.sections : ir[kind];
    if (!Array.isArray(arr)) throw new Error(`${kind}가 없습니다`);

    const byId = new Map(arr.map((x) => [x.id, x]));
    const missing = op.order.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`없는 id: ${missing.join(', ')}. 있는 것: ${[...byId.keys()].join(', ')}`);
    if (op.order.length !== arr.length) {
      throw new Error(`순서에 ${op.order.length}개를 줬는데 ${kind}는 ${arr.length}개입니다. 전부 나열해야 합니다.`);
    }

    const next = op.order.map((id) => byId.get(id));
    arr.length = 0;
    arr.push(...next);
    if (kind === 'scenes') resequence(ir);
    return `${op.artifact} ${kind} 순서: ${op.order.join(' → ')}`;
  },

  setTiming(state, op) {
    const ir = requireIr(state, op.artifact);
    const scene = findScene(ir, op.scene);
    if (op.durationMs !== undefined) {
      if (op.durationMs < 1) throw new Error('durationMs는 1 이상이어야 합니다');
      scene.durationMs = Math.round(op.durationMs);
    }
    if (op.startMs !== undefined) scene.startMs = Math.round(op.startMs);
    resequence(ir);
    return `${op.artifact}/${op.scene} 길이 ${(scene.durationMs / 1000).toFixed(1)}초`;
  },

  setSubtitle(state, op) {
    const ir = requireIr(state, op.artifact);
    findScene(ir, op.scene).subtitle = String(op.value);
    return `${op.artifact}/${op.scene} 자막`;
  },

  setLayerTiming(state, op) {
    const ir = requireIr(state, op.artifact);
    const scene = findScene(ir, op.scene);
    const layer = (scene.layers || []).find((l) => l.id === op.layer);
    if (!layer) throw new Error(`레이어를 찾을 수 없습니다: ${op.layer}. 있는 것: ${(scene.layers || []).map((l) => l.id).join(', ')}`);
    if (op.enterMs !== undefined) layer.enterMs = Math.round(op.enterMs);
    if (op.exitMs !== undefined) layer.exitMs = Math.round(op.exitMs);
    return `${op.artifact}/${op.scene}/${op.layer} 타이밍`;
  },

  setRegion(state, op) {
    const ir = requireIr(state, op.artifact);
    const scene = findScene(ir, op.scene);
    const layer = (scene.layers || []).find((l) => l.id === op.layer);
    if (!layer) throw new Error(`레이어를 찾을 수 없습니다: ${op.layer}. 있는 것: ${(scene.layers || []).map((l) => l.id).join(', ')}`);
    for (const k of ['x', 'y', 'w', 'h']) {
      if (typeof op.region?.[k] !== 'number') throw new Error(`region.${k}가 숫자가 아닙니다`);
    }
    layer.region = { x: op.region.x, y: op.region.y, w: op.region.w, h: op.region.h };
    if (layer.block?.box) layer.block.box = { ...layer.region };
    reprotect(ir);
    return `${op.artifact}/${op.scene}/${op.layer} 영역`;
  },

  addClaim(state, op) {
    const ir = requireIr(state, op.artifact);
    const { block } = findBlock(ir, op.block, op.container);
    const known = (state.manifest.sources || []).map((s) => s.id);
    if (!known.includes(op.sourceId)) {
      throw new Error(`등록되지 않은 sourceId: ${op.sourceId}. 있는 것: ${known.join(', ') || '(없음)'}`);
    }
    block.claims = block.claims || [];
    block.claims.push({
      text: String(op.text),
      sourceId: op.sourceId,
      kind: op.kind || 'fact',
      ...(op.locator ? { locator: op.locator } : {}),
    });
    return `${op.artifact}/${op.block} 출처 연결 → ${op.sourceId}`;
  },
};

/** 장면 순서·길이가 바뀌면 타임라인을 이어 붙이고 보호 영역을 다시 계산한다 */
function resequence(ir) {
  let cursor = 0;
  (ir.scenes || []).forEach((scene, i) => {
    scene.sequence = i;
    scene.startMs = cursor;
    cursor += scene.durationMs;
    for (const layer of scene.layers || []) {
      if (layer.exitMs !== undefined && layer.exitMs > scene.durationMs) layer.exitMs = scene.durationMs;
    }
  });
  reprotect(ir);
}

function reprotect(ir) {
  for (const scene of ir.scenes || []) {
    const layers = scene.layers || [];
    const derived = deriveProtectedRegions(layers);
    layers.forEach((layer, i) => {
      if (derived[i].length) layer.protectedRegions = derived[i];
      else delete layer.protectedRegions;
    });
  }
}

/* ── 진입점 ───────────────────────────────────────────────────── */

/**
 * 연산 목록을 원자적으로 적용한다.
 * dryRun이면 검사만 하고 디스크는 건드리지 않는다.
 *
 * 반환: { ok, applied: [설명], errors: [{ where, message }], changedArtifacts: [id] }
 */
export function applyOperations(ctx, operations, { dryRun = false } = {}) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { ok: false, applied: [], errors: [{ where: 'operations', message: '연산이 비어 있습니다' }], changedArtifacts: [] };
  }

  // 후보 상태를 메모리에서 만든다 — 검사에 걸리면 디스크는 그대로다
  const state = {
    manifest: JSON.parse(JSON.stringify(ctx.manifest)),
    irs: {},
  };
  for (const ref of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, ref);
    if (ir) state.irs[ref.id] = ir;
  }

  const applied = [];
  const touched = new Set();

  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    const handler = APPLY[op?.op];
    if (!handler) {
      return {
        ok: false,
        applied,
        errors: [{ where: `operations[${i}]`, message: `알 수 없는 연산: ${op?.op}. 가능: ${Object.keys(OPERATIONS).join(', ')}` }],
        changedArtifacts: [],
      };
    }
    const spec = OPERATIONS[op.op];
    const missing = spec.args.filter((k) => op[k] === undefined);
    if (missing.length) {
      return {
        ok: false,
        applied,
        errors: [{ where: `operations[${i}] ${op.op}`, message: `필수 인자가 없습니다: ${missing.join(', ')}` }],
        changedArtifacts: [],
      };
    }
    try {
      applied.push(handler(state, op));
      if (op.artifact) touched.add(op.artifact);
    } catch (err) {
      return { ok: false, applied, errors: [{ where: `operations[${i}] ${op.op}`, message: err.message }], changedArtifacts: [] };
    }
  }

  // 토큰을 바꿨다면 모든 산출물이 영향을 받는다
  const tokensChanged = JSON.stringify(state.manifest.brand.tokens) !== JSON.stringify(ctx.manifest.brand.tokens);
  const changed = tokensChanged ? Object.keys(state.irs) : [...touched];

  const errors = [];
  const mResult = validateManifest(state.manifest);
  for (const e of mResult.errors) errors.push({ where: `manifest.${e.path}`, message: e.message });

  for (const id of changed) {
    const ir = state.irs[id];
    if (!ir) continue;
    for (const e of validateArtifactIr(ir).errors) errors.push({ where: `${id}.${e.path}`, message: e.message });
    for (const scene of ir.scenes || []) {
      for (const p of auditMask(scene.layers || [], ir.canvas)) {
        errors.push({ where: `${id}.${scene.id}.${p.layer}`, message: p.message });
      }
    }
  }

  if (errors.length) return { ok: false, applied, errors, changedArtifacts: [] };
  if (dryRun) return { ok: true, applied, errors: [], changedArtifacts: changed, dryRun: true };

  // 검사를 통과한 뒤에만 쓴다
  ctx.manifest.brand.tokens = state.manifest.brand.tokens;
  for (const id of changed) {
    const ref = ctx.manifest.artifacts.find((a) => a.id === id);
    if (!ref || !state.irs[id]) continue;
    writeJson(path.resolve(ctx.dir, ref.ir), state.irs[id]);
    if (ref.status === 'rendered' || ref.status === 'exported') ref.status = 'stale';
  }

  return { ok: true, applied, errors: [], changedArtifacts: changed };
}

export { intersect };
