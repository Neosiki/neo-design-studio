/**
 * design.mjs — 색상 대비, 타이포그래피, 레이아웃(넘침·겹침·안전영역)
 *
 * 브라우저 없이 IR만 보고 판단한다. 픽셀 단위 정밀 검사는 design render 이후
 * Playwright 경로가 맡고, 여기서는 "구조적으로 불가능한 배치"를 먼저 걸러낸다.
 */

import { contrastRatio, estimateTextWidth, rectsOverlap, parseHex } from '../util.mjs';
import { isCjkLang, defaultLineHeight, bodyBaseline } from '../render/shared.mjs';
import { loadArtifactIr } from '../project.mjs';
import { iterBlocks } from './structure.mjs';

export const id = 'design';
export const title = '디자인 · 레이아웃';

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const LARGE_TEXT_PX = 24;

export function run(ctx) {
  const findings = [];
  const tokens = ctx.manifest.brand?.tokens || {};
  const color = tokens.color || {};
  const assetById = new Map((ctx.manifest.assets || []).map((a) => [a.id, a]));
  const cjkLang = isCjkLang(ctx.manifest.brief?.language);

  /* ── 색상 대비 ── */
  const pairs = [
    ['fg', 'bg', AA_NORMAL, '본문 텍스트'],
    ['muted', 'bg', AA_LARGE, '보조 텍스트'],
    ['accentFg', 'accent', AA_NORMAL, '강조 배경 위 텍스트'],
    ['fg', 'surface', AA_NORMAL, '카드 위 본문'],
  ];
  for (const [fgKey, bgKey, min, label] of pairs) {
    const fg = color[fgKey];
    const bg = color[bgKey];
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio === null) {
      findings.push({
        check: 'color.parse',
        level: 'error',
        where: `brand.tokens.color.${fgKey}/${bgKey}`,
        message: '색상값을 해석할 수 없습니다.',
      });
      continue;
    }
    if (ratio < min) {
      findings.push({
        check: 'color.contrast',
        level: 'error',
        where: `brand.tokens.color.${fgKey} on ${bgKey}`,
        message: `${label} 대비 ${ratio.toFixed(2)}:1 — 기준 ${min}:1 미달`,
      });
    } else if (ratio < min + 0.5) {
      findings.push({
        check: 'color.contrast',
        level: 'warn',
        where: `brand.tokens.color.${fgKey} on ${bgKey}`,
        message: `${label} 대비 ${ratio.toFixed(2)}:1 — 기준을 겨우 넘습니다.`,
      });
    }
  }
  for (const [key, value] of Object.entries(color)) {
    if (!parseHex(value)) {
      findings.push({
        check: 'color.format',
        level: 'error',
        where: `brand.tokens.color.${key}`,
        message: `#hex 형식이 아닙니다: ${value}`,
      });
    }
  }

  /* ── 타이포그래피 ── */
  const typo = tokens.typography || {};
  const scale = typo.scale || [];
  if (scale.length > 0 && Math.min(...scale) < 12) {
    findings.push({
      check: 'type.scale',
      level: 'warn',
      where: 'brand.tokens.typography.scale',
      message: `가장 작은 크기 ${Math.min(...scale)}px — 12px 미만은 읽기 어렵습니다.`,
    });
  }
  for (const role of ['display', 'body', 'mono']) {
    const spec = typo[role];
    if (!spec) continue;
    if (!spec.assetId && (!spec.fallback || spec.fallback.length === 0)) {
      findings.push({
        check: 'type.fallback',
        level: 'warn',
        where: `brand.tokens.typography.${role}`,
        message: `'${spec.family}'를 자산으로 포함하지도, 폴백을 지정하지도 않았습니다. 다른 환경에서 글꼴이 깨집니다.`,
      });
    }
  }

  /* ── 레이아웃 ── */
  for (const artRef of ctx.manifest.artifacts || []) {
    const { ir } = loadArtifactIr(ctx, artRef);
    if (!ir) continue;
    const canvas = ir.canvas;
    // bodyMin은 "이보다 작으면 안 된다"는 하한이고, baseline은 "보통 이 크기다"라는
    // 기준이다. 둘은 다른 값이며 섞으면 넘침 추정이 렌더 결과와 어긋난다.
    const bodyMin = artRef.type === 'video' ? 28 : artRef.type === 'deck' ? 18 : 14;
    const baseline = bodyBaseline(artRef.type);

    // 컨테이너 단위로 모아 겹침을 본다
    const groups = new Map();
    for (const entry of iterBlocks(ir)) {
      const key = entry.where.split('.').slice(0, -1).join('.');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    for (const [groupKey, entries] of groups) {
      const boxed = entries.filter((e) => e.block.box);
      for (let i = 0; i < boxed.length; i += 1) {
        for (let j = i + 1; j < boxed.length; j += 1) {
          const a = boxed[i];
          const b = boxed[j];
          if (a.block.kind === 'shape' || b.block.kind === 'shape') continue;
          const { overlaps, area } = rectsOverlap(a.block.box, b.block.box);
          if (!overlaps) continue;
          const smallest = Math.min(a.block.box.w * a.block.box.h, b.block.box.w * b.block.box.h);
          const pct = smallest > 0 ? area / smallest : 0;
          if (pct > 0.12) {
            findings.push({
              check: 'layout.overlap',
              level: pct > 0.4 ? 'error' : 'warn',
              where: `${artRef.id} → ${groupKey}`,
              message: `${a.block.id} 와 ${b.block.id} 가 ${Math.round(pct * 100)}% 겹칩니다.`,
            });
          }
        }
      }

      for (const { block, where } of entries) {
        const box = block.box;
        const size = block.style?.fontSize;

        if (box && canvas) {
          if (box.x < 0 || box.y < 0 || box.x + box.w > canvas.width || box.y + box.h > canvas.height) {
            findings.push({
              check: 'layout.canvas',
              level: 'error',
              where: `${artRef.id} → ${where}`,
              message: `요소가 캔버스(${canvas.width}×${canvas.height}) 밖으로 나갑니다.`,
            });
          }
          const safe = canvas.safeArea;
          if (safe) {
            const outside =
              box.x < (safe.left || 0) ||
              box.y < (safe.top || 0) ||
              box.x + box.w > canvas.width - (safe.right || 0) ||
              box.y + box.h > canvas.height - (safe.bottom || 0);
            if (outside && block.kind !== 'image' && block.kind !== 'shape') {
              findings.push({
                check: 'layout.safeArea',
                level: 'warn',
                where: `${artRef.id} → ${where}`,
                message: '텍스트가 안전영역을 벗어납니다. 자막·UI에 가려질 수 있습니다.',
              });
            }
          }
        }

        if (size !== undefined && ['heading', 'subheading', 'body', 'bullets', 'quote', 'caption'].includes(block.kind)) {
          if (size < bodyMin) {
            findings.push({
              check: 'type.minSize',
              level: 'warn',
              where: `${artRef.id} → ${where}`,
              message: `${size}px — ${artRef.type} 산출물의 권장 최소 ${bodyMin}px 미만입니다.`,
            });
          }
        }

        // 텍스트 넘침 추정 — 명시적 줄바꿈(\n)과 목록 항목까지 센다
        const segments = textSegments(block);
        if (box && size && segments.length > 0) {
          // 렌더러가 실제로 쓰는 기본 행간과 같은 함수를 쓴다. 여기서 1.25로 어림잡으면
          // 한글 본문(기본 1.7)의 넘침을 통째로 놓친다.
          const lineHeight = block.style?.lineHeight ?? defaultLineHeight(block.kind, size, cjkLang, baseline);
          const usableW = Math.max(1, block.kind === 'bullets' ? box.w - size * 1.2 : box.w);
          const lines = segments.reduce((sum, seg) => {
            const width = estimateTextWidth(seg, size, { fontRole: block.style?.fontRole });
            return sum + Math.max(1, Math.ceil(width / usableW));
          }, 0);
          let needed = lines * size * lineHeight;
          // KPI 라벨은 별도 줄로 붙는다 (렌더러의 clamp 상한 36px 기준)
          if (block.kind === 'kpi' && block.items?.[0]) {
            needed += Math.min(36, Math.max(16, size * 0.2)) * 1.4 + size * 0.15;
          }
          if (needed > box.h * 1.05) {
            findings.push({
              check: 'layout.overflow',
              level: needed > box.h * 1.4 ? 'error' : 'warn',
              where: `${artRef.id} → ${where}`,
              message: `텍스트가 상자를 넘칩니다(추정 ${Math.round(needed)}px > ${Math.round(box.h)}px, ${lines}줄).`,
            });
          }
          const maxLines = block.style?.maxLines;
          if (maxLines && lines > maxLines) {
            findings.push({
              check: 'layout.maxLines',
              level: 'warn',
              where: `${artRef.id} → ${where}`,
              message: `${lines}줄로 추정되는데 maxLines는 ${maxLines}입니다.`,
            });
          }
        }

        // 블록 단위 색상 대비 (토큰 키 또는 hex)
        const fg = resolveColor(block.style?.color, color);
        const bg = resolveColor(block.style?.bg, color) || color.bg;
        if (fg && bg && size) {
          const ratio = contrastRatio(fg, bg);
          const min = size >= LARGE_TEXT_PX ? AA_LARGE : AA_NORMAL;
          if (ratio !== null && ratio < min) {
            findings.push({
              check: 'color.contrast.block',
              level: 'error',
              where: `${artRef.id} → ${where}`,
              message: `대비 ${ratio.toFixed(2)}:1 — ${size}px 텍스트 기준 ${min}:1 미달`,
            });
          }
        }

        // 이미지 대체 텍스트: 블록에 있거나, 참조하는 자산에 등록돼 있어야 한다
        if (['image', 'logo'].includes(block.kind) && !block.alt) {
          const asset = block.assetId ? assetById.get(block.assetId) : null;
          if (!asset?.alt) {
            findings.push({
              check: 'a11y.alt.block',
              level: 'warn',
              where: `${artRef.id} → ${where}`,
              message: block.assetId
                ? `alt이 없고 참조하는 자산(${block.assetId})에도 alt이 없습니다.`
                : '이미지 블록에 alt도 assetId도 없습니다.',
            });
          }
        }
      }
    }
  }

  return findings;
}

function resolveColor(value, palette) {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  return palette[value] || null;
}

/**
 * 넘침 계산용 텍스트 조각. heading의 \n은 실제 줄바꿈으로,
 * bullets의 items는 각각 최소 한 줄로 센다. kpi는 숫자만(라벨은 호출부에서 더함).
 */
function textSegments(block) {
  if (block.kind === 'bullets') return (block.items || []).flatMap((i) => String(i).split('\n'));
  if (!block.text) return [];
  return String(block.text).split('\n');
}
