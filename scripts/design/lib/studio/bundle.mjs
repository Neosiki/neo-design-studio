/**
 * studio/bundle.mjs — 렌더 코어를 브라우저용 한 덩어리로 묶는다.
 *
 * 왜 번들러를 안 쓰나: Studio는 파일 하나짜리 HTML이어야 한다. 서버도, 빌드 단계도,
 * node_modules도 없이 열리는 것이 이 편집기의 조건이다. 묶을 모듈이 셋뿐이고 전부
 * 우리가 쓴 코드라, import/export만 걷어내고 이어 붙이면 끝난다.
 *
 * 중요한 건 **편집기가 CLI와 같은 렌더 코드를 쓴다**는 점이다. 미리보기용 렌더러를
 * 따로 만들면 화면에서 본 것과 파일로 나온 것이 갈라진다. 테스트가 이 동등성을 지킨다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../util.mjs';

/** 의존 순서대로. 서로만 참조하므로 이 순서면 충분하다. */
const MODULES = ['lib/render/shared.mjs', 'lib/reveal-mask.mjs', 'lib/render/whiteboard.mjs', 'lib/render/core.mjs'];

function stripModuleSyntax(source) {
  return source
    // import ... from '...';  (여러 줄 포함)
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // export { a, b };
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    // export function / export const / export let
    .replace(/^export\s+(function|const|let|class)\s/gm, '$1 ')
    .trim();
}

const TOP_LEVEL_DECL = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * 최상위 이름 충돌을 찾는다.
 *
 * 평평하게 이어 붙이면 모듈마다 따로 둔 `esc`, `round` 같은 도우미가 서로를 덮어쓰고,
 * 브라우저는 "Identifier already declared"로 스크립트 전체를 버린다 — 편집기가 통째로
 * 죽는다. 실제로 한 번 겪었기 때문에 조용히 지나가지 않게 검사로 만들었다.
 * 공유 도구는 render/shared.mjs 한 곳에 둔다.
 */
export function findCollisions() {
  const base = path.join(repoRoot(), 'scripts', 'design');
  const seen = new Map();
  const collisions = [];
  for (const rel of MODULES) {
    const source = fs.readFileSync(path.join(base, rel), 'utf8');
    const names = new Set();
    let m;
    TOP_LEVEL_DECL.lastIndex = 0;
    while ((m = TOP_LEVEL_DECL.exec(source)) !== null) names.add(m[1]);
    for (const name of names) {
      if (seen.has(name)) collisions.push({ name, first: seen.get(name), second: rel });
      else seen.set(name, rel);
    }
  }
  return collisions;
}

/**
 * 브라우저에서 바로 실행 가능한 소스 한 덩어리를 만든다.
 * 최상위 이름들이 그대로 노출되므로 renderIrFiles를 바로 부를 수 있다.
 */
export function bundleRenderCore() {
  const collisions = findCollisions();
  if (collisions.length) {
    const detail = collisions.map((c) => `  ${c.name}: ${c.first} ↔ ${c.second}`).join('\n');
    throw new Error(
      `브라우저 번들의 최상위 이름이 충돌합니다. 공유 도구는 render/shared.mjs로 옮기세요.\n${detail}`
    );
  }
  const base = path.join(repoRoot(), 'scripts', 'design');
  const parts = MODULES.map((rel) => {
    const source = fs.readFileSync(path.join(base, rel), 'utf8');
    return `/* ── ${rel} ────────────────────────────────── */\n${stripModuleSyntax(source)}`;
  });
  return parts.join('\n\n');
}

/** 번들 안에서 실제로 쓸 수 있어야 하는 이름들 — 테스트가 확인한다. */
export const REQUIRED_EXPORTS = ['renderIrFiles', 'mergeTokens', 'renderWhiteboardLayer', 'buildAllowedPath', 'deriveProtectedRegions'];
