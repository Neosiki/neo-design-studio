/**
 * styles/registry.mjs — 스타일 레지스트리 읽기·검색·추천·적용
 *
 * 레지스트리의 존재 이유는 두 가지다.
 *
 * 1. **에이전트가 스타일을 고를 수 있게 한다.** 63KB 문서를 매번 다 읽는 대신
 *    산출물 종류·용도·온도·재현도로 좁힌다.
 * 2. **삼방향 게이트의 실패 모드를 기계로 막는다.** 문서가 직접 말한다 —
 *    "세 방향이 전부 미백+여백+포인트색 하나로 가면 안 된다". 그게 가장 흔한 실패다.
 *    suggest는 온도가 겹치지 않는 세 방향만 낸다.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { repoRoot, readJson } from '../util.mjs';

export const REGISTRY_PATH = path.join('styles', 'registry.json');
export const SOURCE_PATH = path.join('references', 'design-styles.md');

let cache = null;

export function loadRegistry({ force = false } = {}) {
  if (cache && !force) return cache;
  const file = path.join(repoRoot(), REGISTRY_PATH);
  if (!fs.existsSync(file)) {
    const err = new Error(`스타일 레지스트리가 없습니다: ${REGISTRY_PATH}. design styles rebuild로 만드세요.`);
    err.exitCode = 6;
    throw err;
  }
  cache = readJson(file);
  return cache;
}

/**
 * 원본 문서의 **내용** 해시. 줄바꿈을 LF로 맞춘 뒤 계산한다 —
 * 같은 문서를 Windows에서 체크아웃했다고 해서 레지스트리가 낡았다고 하면 안 된다.
 */
export function sourceHash(text) {
  return crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** 원본 문서가 레지스트리 생성 이후에 바뀌었는가 */
export function isStale(registry = loadRegistry()) {
  const src = path.join(repoRoot(), SOURCE_PATH);
  if (!fs.existsSync(src)) return { stale: false, reason: '원본 문서 없음 (배포본)' };
  const actual = sourceHash(fs.readFileSync(src, 'utf8'));
  if (actual === registry.generatedFrom?.sha256) return { stale: false };
  return { stale: true, reason: '원본 문서가 바뀌었습니다. design styles rebuild로 다시 만드세요.' };
}

export function getStyle(id, registry = loadRegistry()) {
  return registry.styles.find((s) => s.id === id) || null;
}

/* ── 검색 ─────────────────────────────────────────────────────── */

/**
 * 조건으로 좁힌다. 텍스트 질의는 이름·용도·DNA·참고사례를 함께 본다
 * (원문이 중국어라 한국어 질의는 걸리지 않는다 — 그래서 조건 필터가 주 수단이다).
 */
/**
 * 한글화 전 문서를 기준으로 저장된 질의도 계속 지원한다.
 * 테스트·자동화 입력은 계약이므로 번역하지 않고, 검색어만 한글 색인으로 확장한다.
 */
const TEXT_QUERY_ALIASES = { 스위스: ['스위스'] };

/**
 * 조건 하나를 배열로 정규화한다. **빈 배열은 "조건 없음"이다** —
 * 빈 배열은 truthy라서 그대로 필터에 넣으면 전부 걸러진다(실제로 겪었다).
 */
function want(value) {
  if (value === undefined || value === null || value === '') return null;
  const arr = Array.isArray(value) ? value : [value];
  return arr.length ? arr : null;
}

export function searchStyles(query = {}, registry = loadRegistry()) {
  let out = registry.styles.slice();

  const supports = want(query.supports);
  if (supports) out = out.filter((s) => supports.some((w) => s.supports.includes(w)));

  const section = want(query.section);
  if (section) out = out.filter((s) => section.includes(s.section));

  const temperature = want(query.temperature);
  if (temperature) out = out.filter((s) => temperature.includes(s.temperature));

  const contrast = want(query.contrast);
  if (contrast) out = out.filter((s) => contrast.includes(s.contrast));

  const motion = want(query.motionLevel);
  if (motion) out = out.filter((s) => motion.includes(s.motionLevel));

  if (query.minFidelity !== undefined && query.minFidelity !== null && query.minFidelity !== '') {
    out = out.filter((s) => s.fidelity >= Number(query.minFidelity));
  }

  if (query.text) {
    const needle = String(query.text).toLowerCase();
    const needles = [needle, ...(TEXT_QUERY_ALIASES[needle] || [])].map((value) => value.toLowerCase());
    out = out.filter((s) => {
      const haystack = [s.id, s.name, s.dna, s.references, s.html, ...(s.audiences || []), ...(s.fonts || [])]
        .join(' ')
        .toLowerCase();
      return needles.some((value) => haystack.includes(value));
    });
  }

  // 재현도가 높은 것을 앞에 — 낮은 것은 "이 부분은 단색으로 낮췄다"를 밝혀야 해서 비용이 든다
  out.sort((a, b) => b.fidelity - a.fidelity);
  return query.limit ? out.slice(0, Number(query.limit)) : out;
}

/**
 * 오타로 보이는 id에 대해 가까운 것을 찾는다.
 *
 * 부분 문자열 검색으로는 오타를 못 잡는다 — 'swiss-grid-repot'은 아무것도 포함하지 않는다.
 * 편집 거리를 봐야 "혹시 이걸 뜻했나요"를 말할 수 있다.
 */
export function findSimilar(id, { max = 3, threshold = 0.25 } = {}, registry = loadRegistry()) {
  const needle = String(id).toLowerCase();
  return registry.styles
    .map((s) => ({ id: s.id, name: s.name, distance: editDistance(needle, s.id) }))
    .filter((x) => x.distance <= Math.max(2, Math.ceil(needle.length * threshold)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.5) return Infinity;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/* ── 삼방향 추천 ──────────────────────────────────────────────── */

/** 같은 프로젝트는 같은 추천을 받는다. 시계가 아니라 씨앗에서 뽑아 재현 가능하게. */
function seededPick(items, seed, count) {
  if (items.length === 0) return [];
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pool = items.slice();
  const out = [];
  while (out.length < count && pool.length > 0) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

const ROLE = {
  quiet: { label: 'A · 안정 바닥', why: '내용이 주인공이어야 할 때의 안전한 바닥' },
  neutral: { label: 'B · 중간 대비', why: '안정과 대담 사이에서 균형을 잡는 자리' },
  bold: { label: 'C · 대담 주입', why: '문서가 강제하는 자리 — 셋 다 조용하면 그게 가장 흔한 실패다' },
};

/**
 * 삼방향 후보를 낸다. **온도가 겹치지 않는 세 개**를 보장한다.
 *
 * 반환: { candidates: [{ role, style, why }], diversity, warnings }
 */
export function suggestDirections(brief = {}, registry = loadRegistry()) {
  const warnings = [];
  const deliverables = brief.deliverables?.length ? brief.deliverables : ['html'];

  let pool = searchStyles({ supports: deliverables }, registry);
  if (pool.length < 3) {
    warnings.push(`${deliverables.join('/')} 를 지원하는 스타일이 ${pool.length}개뿐이라 전체에서 고릅니다.`);
    pool = registry.styles.slice();
  }

  // 재현도 하한: 낮은 것은 어느 부분을 낮췄는지 밝혀야 하므로 기본적으로 뒤로 뺀다
  const minFidelity = brief.minFidelity ?? 70;
  const usable = pool.filter((s) => s.fidelity >= minFidelity);
  if (usable.length >= 3) pool = usable;
  else warnings.push(`재현도 ${minFidelity}% 이상이 부족해 하한을 적용하지 않았습니다.`);

  if (brief.text) {
    const narrowed = searchStyles({ text: brief.text }, { styles: pool });
    if (narrowed.length >= 3) pool = narrowed;
    else if (narrowed.length > 0) warnings.push(`"${brief.text}"에 걸리는 스타일이 ${narrowed.length}개뿐이라 조건을 넓혔습니다.`);
  }

  const seed = brief.seed ?? brief.projectId ?? 'design';
  const candidates = [];
  const usedContrast = new Set();

  // 온도별로 한 개씩. 순서는 안정 → 중간 → 대담이지만, 대담이 비어 있으면 안 되므로 먼저 확보한다.
  for (const temp of ['bold', 'quiet', 'neutral']) {
    const byTemp = pool.filter((s) => s.temperature === temp);
    if (byTemp.length === 0) {
      warnings.push(`${ROLE[temp].label}: ${temp} 온도의 후보가 없습니다.`);
      continue;
    }
    // 이미 고른 것과 배경 밝기까지 다르면 더 좋다
    const fresh = byTemp.filter((s) => !usedContrast.has(s.contrast));
    const [picked] = seededPick(fresh.length ? fresh : byTemp, `${seed}:${temp}`, 1);
    if (!picked) continue;
    usedContrast.add(picked.contrast);
    candidates.push({ role: ROLE[temp].label, roleWhy: ROLE[temp].why, temperature: temp, style: picked });
  }

  candidates.sort((a, b) => ['quiet', 'neutral', 'bold'].indexOf(a.temperature) - ['quiet', 'neutral', 'bold'].indexOf(b.temperature));

  const temps = new Set(candidates.map((c) => c.temperature));
  const contrasts = new Set(candidates.map((c) => c.style.contrast));
  if (temps.size < 3) warnings.push('온도가 세 가지로 갈리지 않았습니다. 후보군이 좁습니다.');
  if (contrasts.size === 1 && candidates.length === 3) {
    warnings.push(`세 방향의 배경 밝기가 모두 ${[...contrasts][0]}입니다. 대비를 더 벌릴 후보를 찾아보세요.`);
  }

  return {
    candidates,
    diversity: { temperatures: [...temps], contrasts: [...contrasts] },
    poolSize: pool.length,
    warnings,
  };
}

/* ── 매니페스트에 적용 ────────────────────────────────────────── */

/**
 * 고른 스타일을 매니페스트의 style 항목으로 만든다.
 * **토큰은 자동으로 덮어쓰지 않는다.** 문서가 분명히 말한다 — 항목의 hex는 배합표가
 * 아니라 앵커이고, 그대로 복사하면 100명이 같은 색을 쓰게 된다. 색은 브랜드 자산·
 * 내용·문화 맥락에서 유도해야 한다. 그래서 팔레트는 참고로만 돌려준다.
 */
export function buildStyleEntry(style, { rationale, candidates = [], chosenId = null } = {}) {
  return {
    id: style.id,
    name: style.name,
    supports: style.supports,
    rationale,
    ...(candidates.length
      ? {
          candidates: candidates.map((c) => ({
            id: c.style.id,
            label: `${c.role} · ${c.style.name}`,
            ...(c.style.preview ? { preview: c.style.preview } : {}),
            ...(c.style.id === (chosenId || style.id) ? { chosen: true } : {}),
          })),
        }
      : {}),
  };
}
