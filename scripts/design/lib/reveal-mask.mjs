/**
 * reveal-mask.mjs — 선노출 방지 마스크
 *
 * 문제: 한 요소를 그리는 동안 붓·손·쓸어내기가 이웃 영역을 침범하면, 아직 나오지 않아야 할
 * 요소가 미리 드러난다. 화이트보드에서 특히 잘 보이지만 원인은 화이트보드에 있지 않다 —
 * "지금 이 요소가 칠해도 되는 범위"를 아무도 정의하지 않은 것이 원인이다.
 *
 * 그래서 이 모듈은 화이트보드에 종속되지 않는다. 어떤 장면 레이어든
 *   허용 영역 = (자기 영역 ∪ 여유) − 보호 영역들 − 캔버스 밖
 * 을 계산해 clip-path로 만든다. 마스크 스윕, 리빌 애니메이션, 커서 이동에도 그대로 쓴다.
 *
 * 구현 메모: SVG clipPath는 짝수-홀수 규칙으로 "바깥 사각형 + 구멍들"을 표현할 수 있다.
 * CSS clip-path: polygon()으로는 구멍을 못 만들기 때문에 SVG 경로를 쓴다.
 */

import { round2 } from './render/shared.mjs';

/** 사각형 교집합. 없으면 null. */
export function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

/** 사각형을 캔버스 안으로 자른다. 화면 밖 영역 자동 차단. */
export function clampToCanvas(rect, canvas) {
  return intersect(rect, { x: 0, y: 0, w: canvas.width, h: canvas.height });
}

/** 여백을 준 사각형 (붓이 선 밖으로 조금 나가는 것을 허용) */
export function inflate(rect, pad) {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
}

function rectPath({ x, y, w, h }) {
  return `M${round2(x)},${round2(y)} H${round2(x + w)} V${round2(y + h)} H${round2(x)} Z`;
}


/**
 * 한 레이어의 허용 영역을 SVG path 데이터로 만든다.
 *
 * @param {{x,y,w,h}} region        레이어 자기 영역
 * @param {Array}     protectedRegions 침범하면 안 되는 영역들
 * @param {{width,height}} canvas
 * @param {number}    pad           자기 영역 바깥으로 허용할 여백(px)
 * @returns {{ d: string, holes: number, clipped: boolean }}
 */
export function buildAllowedPath(region, protectedRegions, canvas, pad = 0) {
  const outer = clampToCanvas(inflate(region, pad), canvas);
  if (!outer) return { d: '', holes: 0, clipped: true };

  // 자기 영역과 실제로 겹치는 보호 영역만 구멍으로 남긴다
  const holes = (protectedRegions || [])
    .map((p) => clampToCanvas(p, canvas))
    .filter(Boolean)
    .map((p) => intersect(outer, p))
    .filter(Boolean);

  const d = [rectPath(outer), ...holes.map(rectPath)].join(' ');
  const clipped =
    outer.x !== region.x - pad ||
    outer.y !== region.y - pad ||
    outer.w !== region.w + pad * 2 ||
    outer.h !== region.h + pad * 2;

  return { d, holes: holes.length, clipped };
}

/**
 * 레이어 목록에서 각 레이어의 보호 영역을 자동으로 채운다.
 * "뒤에 나올 요소는 전부 보호 대상"이 기본 규칙이고, 이미 선언된 것이 있으면 합집합.
 */
export function deriveProtectedRegions(layers) {
  return layers.map((layer, i) => {
    if (!layer.region) return layer.protectedRegions || [];
    const later = layers.slice(i + 1).map((l) => l.region).filter(Boolean);
    const declared = layer.protectedRegions || [];
    const merged = [...declared];
    for (const rect of later) {
      if (!intersect(layer.region, rect)) continue;
      const dup = merged.some((m) => m.x === rect.x && m.y === rect.y && m.w === rect.w && m.h === rect.h);
      if (!dup) merged.push(rect);
    }
    return merged;
  });
}

/**
 * 방향별 쓸어내기 사각형. progress 0→1 동안 드러나는 범위.
 * grid 모드와 일반 리빌 트랜지션이 공유한다.
 */
export function sweepRect(region, direction, progress) {
  const p = Math.max(0, Math.min(1, progress));
  switch (direction) {
    case 'right-left':
      return { x: region.x + region.w * (1 - p), y: region.y, w: region.w * p, h: region.h };
    case 'top-bottom':
      return { x: region.x, y: region.y, w: region.w, h: region.h * p };
    case 'bottom-top':
      return { x: region.x, y: region.y + region.h * (1 - p), w: region.w, h: region.h * p };
    case 'left-right':
    default:
      return { x: region.x, y: region.y, w: region.w * p, h: region.h };
  }
}

/**
 * 마스크가 실제로 선노출을 막는지 검사한다 (검수·테스트용).
 * 반환: [{ level, message }]
 */
export function auditMask(layers, canvas) {
  const problems = [];
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (!layer.region) continue;

    const outside = !clampToCanvas(layer.region, canvas);
    if (outside) {
      problems.push({ level: 'error', layer: layer.id, message: '영역이 캔버스 밖에 완전히 벗어나 있습니다.' });
      continue;
    }

    const later = layers.slice(i + 1).filter((l) => l.region);
    const declared = layer.protectedRegions || [];
    for (const other of later) {
      if (!intersect(layer.region, other.region)) continue;
      const covered = declared.some((p) => {
        const cross = intersect(p, other.region);
        if (!cross) return false;
        // 겹치는 부분을 충분히 덮는가 (95% 이상)
        const need = intersect(layer.region, other.region);
        return cross.w * cross.h >= need.w * need.h * 0.95;
      });
      if (!covered) {
        problems.push({
          level: 'error',
          layer: layer.id,
          message: `${other.id}와 겹치는데 보호 영역으로 선언되지 않았습니다. ${other.id}가 미리 드러납니다.`,
        });
      }
    }
  }
  return problems;
}
