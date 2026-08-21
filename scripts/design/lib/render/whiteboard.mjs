/**
 * render/whiteboard.mjs — whiteboardScene 레이어를 SVG로 렌더링한다.
 *
 * 왜 SVG인가: P0에서 만든 영상 HTML은 `window.seek(초)` 하나로 화면 상태가 결정된다.
 * 필기 애니메이션도 같은 계약 안에 넣으면 render-video-seek.js·골든 프레임 테스트·
 * 캐시가 전부 그대로 재사용된다. 별도 렌더 프로세스를 만들면 그 전부를 다시 만들어야 한다.
 *
 * 두 가지 필기 경로
 *  - skeleton: stroke-dasharray/dashoffset으로 선이 경로를 따라 자라난다. 선화에 밀착한다.
 *  - grid:     영역을 한 방향으로 쓸어내며 드러낸다. 래스터·복잡한 그림에도 안정적이다.
 *
 * ink → color: 선을 먼저 다 긋고 색을 나중에 채운다. 실제 화이트보드 제작의 리듬.
 * 보호 영역: reveal-mask가 만든 clipPath로 "이 요소가 칠해도 되는 범위"를 강제한다.
 */

import { buildAllowedPath, deriveProtectedRegions } from '../reveal-mask.mjs';
import { esc, round3, charWidth, estWidth } from './shared.mjs';

export const THEME_DEFAULTS = {
  grain: 0,
  strokeWidth: 6,
  pxPerSecond: 900,
  settleMs: 120,
};

/** 토큰 키 또는 #hex → CSS 색 */
function color(value, fallback) {
  if (!value) return fallback;
  return value.startsWith('#') ? value : `var(--c-${value})`;
}

export function resolveTheme(spec = {}) {
  return {
    ...THEME_DEFAULTS,
    ...spec,
    paper: color(spec.paper, 'var(--c-bg)'),
    ink: color(spec.ink, 'var(--c-fg)'),
    accent: color(spec.accent, 'var(--c-accent)'),
  };
}

/**
 * 한 whiteboard 레이어를 렌더링한다.
 * 반환: { defs, html, runtime }  — defs는 <svg><defs>에, html은 레이어 안에, runtime은 seek 계약용 기술자
 */
export function renderWhiteboardLayer({ scene, layer, canvas, assetSrc, uid }) {
  const spec = layer.render || {};
  const theme = resolveTheme(spec.theme);
  const region = layer.region || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const mode = spec.mode === 'grid' ? 'grid' : 'skeleton';

  // 붓이 선 밖으로 조금 나가는 것은 허용하되, 보호 영역은 절대 침범하지 않는다
  const pad = Math.round((spec.theme?.strokeWidth ?? theme.strokeWidth) * 1.5);
  const mask = buildAllowedPath(region, layer.protectedRegions, canvas, pad);
  const clipId = `wbclip-${uid}`;

  const phases = normalizePhases(spec.phases, layer, theme);
  const strokes = [];
  let body = '';

  if (spec.art?.paths?.length) {
    body = renderPaths(spec.art, phases, theme, region, uid, strokes);
  } else if (spec.art?.assetId) {
    body = renderAsset(spec.art, assetSrc, region, uid, mode);
  } else if (spec.art?.text) {
    body = renderText(spec.art.text, theme, region, uid, strokes, mode);
  } else {
    body = `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="none"/>`;
  }

  const hand = spec.hand || {};
  const handSrc = hand.assetId ? assetSrc(hand.assetId) : null;
  const handW = hand.width || 160;
  // 정사각 상자에 xMinYMin meet으로 넣는다. 어떤 비율의 손 이미지를 넣어도 좌상단이
  // 고정되므로 펜촉 anchor를 폭 기준 비율 한 쌍으로 다룰 수 있다 (교체 가능성의 조건).
  const handHtml =
    hand.show !== false && handSrc
      ? `<image class="wb-hand" id="${uid}-hand" href="${esc(handSrc)}" width="${handW}" height="${handW}"
         style="opacity:0" preserveAspectRatio="xMinYMin meet"/>`
      : '';

  const defs = `  <clipPath id="${clipId}" clip-rule="evenodd"><path d="${mask.d}" clip-rule="evenodd"/></clipPath>`;

  const html = `<svg class="wb" viewBox="0 0 ${canvas.width} ${canvas.height}" width="${canvas.width}" height="${canvas.height}"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
${defs}
  </defs>
  <g clip-path="url(#${clipId})">
${body}
  </g>
  ${handHtml}
</svg>`;

  const runtime = {
    id: uid,
    mode,
    sweep: spec.sweep || 'left-right',
    region,
    enterMs: layer.enterMs ?? 0,
    exitMs: layer.exitMs ?? scene.durationMs,
    pxPerSecond: spec.speed?.pxPerSecond ?? theme.pxPerSecond,
    settleMs: spec.speed?.settleMs ?? theme.settleMs,
    phases,
    strokes,
    hand:
      hand.show !== false && handSrc
        ? {
            w: handW,
            ax: hand.anchor?.x ?? 0.07,
            ay: hand.anchor?.y ?? 0.06,
            hideDuringColor: hand.hideDuringColor !== false,
          }
        : null,
  };

  return { defs: '', html, runtime, maskHoles: mask.holes };
}

/* ── 단계 ─────────────────────────────────────────────────────── */

function normalizePhases(phases, layer, theme) {
  const total = Math.max(1, (layer.exitMs ?? 0) - (layer.enterMs ?? 0));
  if (!phases || phases.length === 0) {
    return [{ id: 'ink', kind: 'ink', startMs: 0, durationMs: total, strokeWidth: theme.strokeWidth }];
  }
  return phases.map((p, i) => ({
    id: p.id,
    kind: p.kind || (p.id === 'color' ? 'color' : 'ink'),
    startMs: p.startMs ?? Math.round((total / phases.length) * i),
    durationMs: p.durationMs ?? Math.round(total / phases.length),
    strokeWidth: p.strokeWidth ?? theme.strokeWidth,
    stroke: p.stroke ? color(p.stroke) : null,
    opacity: p.opacity,
  }));
}

/* ── 그리기 대상별 ─────────────────────────────────────────────── */

function renderPaths(art, phases, theme, region, uid, strokes) {
  const vb = (art.viewBox || `0 0 ${region.w} ${region.h}`).split(/\s+/).map(Number);
  const scale = Math.min(region.w / vb[2], region.h / vb[3]);
  const tx = region.x + (region.w - vb[2] * scale) / 2 - vb[0] * scale;
  const ty = region.y + (region.h - vb[3] * scale) / 2 - vb[1] * scale;

  const parts = art.paths.map((p, i) => {
    const phase = phases.find((ph) => ph.id === (p.phase || 'ink')) || phases[0];
    const sid = `${uid}-p${i}`;
    strokes.push({
      el: sid,
      phase: phase.id,
      kind: phase.kind,
      len: p.lengthHint ?? null,
      fill: p.fill ? color(p.fill) : null,
    });
    const stroke = p.stroke ? color(p.stroke) : phase.stroke || (phase.kind === 'color' ? theme.accent : theme.ink);
    const width = p.strokeWidth ?? phase.strokeWidth ?? theme.strokeWidth;
    return `    <path id="${sid}" class="wb-stroke" d="${esc(p.d)}" fill="none" stroke="${stroke}"
          stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"
          ${p.fill ? `data-fill="${color(p.fill)}"` : ''}/>`;
  });

  return `    <g transform="translate(${round3(tx)} ${round3(ty)}) scale(${round3(scale)})" stroke-width="${theme.strokeWidth}">
${parts.join('\n')}
    </g>`;
}

function renderAsset(art, assetSrc, region, uid, mode) {
  const src = assetSrc(art.assetId);
  if (!src) {
    return `    <rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}"
          fill="none" stroke="var(--c-muted)" stroke-dasharray="12 10" opacity="0.5"/>`;
  }
  // 래스터는 경로가 없으므로 grid(쓸어내기) 경로만 의미가 있다
  const clip = mode === 'grid' ? ` clip-path="url(#${uid}-sweep)"` : '';
  return `    <g${clip}><image id="${uid}-img" class="wb-art" href="${esc(src)}"
          x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}"
          preserveAspectRatio="xMidYMid meet"/></g>
    <clipPath id="${uid}-sweep"><rect id="${uid}-sweeprect" x="${region.x}" y="${region.y}" width="0" height="${region.h}"/></clipPath>`;
}

function renderText(text, theme, region, uid, strokes, mode) {
  const size = text.fontSize || 48;
  const lineHeight = (text.lineHeight || 1.4) * size;
  const lines = wrapText(text.content, size, region.w);
  const anchor = text.align === 'center' ? 'middle' : text.align === 'right' ? 'end' : 'start';
  const ax = text.align === 'center' ? region.x + region.w / 2 : text.align === 'right' ? region.x + region.w : region.x;
  const top = region.y + size;

  // 손글씨는 줄 단위로 왼쪽에서 오른쪽으로 드러난다. 각 줄이 하나의 "획"이다.
  // 드러나는 폭은 영역 폭이 아니라 **그 줄의 실제 글자 폭**을 쓴다. 그래야 짧은 줄에서
  // 손이 빈 공간을 헤매지 않는다.
  const parts = lines.map((line, i) => {
    const sid = `${uid}-l${i}`;
    const lineW = Math.max(1, estWidth(line, size));
    const x0 = text.align === 'center' ? ax - lineW / 2 : text.align === 'right' ? ax - lineW : ax;
    const baseline = top + lineHeight * i;
    strokes.push({ el: sid, phase: 'ink', kind: 'ink', len: lineW, text: true, x0: round3(x0), y: round3(baseline - size * 0.32) });
    return `    <g clip-path="url(#${sid}-clip)">
      <text id="${sid}" x="${round3(ax)}" y="${round3(baseline)}" text-anchor="${anchor}"
            font-family="var(--f-${text.fontRole || 'body'})" font-size="${size}" fill="${theme.ink}"
            dominant-baseline="alphabetic">${esc(line)}</text>
    </g>
    <clipPath id="${sid}-clip"><rect id="${sid}-rect" x="${round3(x0)}" y="${round3(baseline - size)}"
          width="0" height="${round3(lineHeight)}"/></clipPath>`;
  });

  return parts.join('\n');
}

/* ── 보조 ─────────────────────────────────────────────────────── */

const round = (n) => Math.round(n * 1000) / 1000;

/** 폭에 맞춰 줄을 나눈다. 렌더 결과가 결정론적이어야 하므로 브라우저 측정에 의존하지 않는다. */
export function wrapText(content, size, maxWidth) {
  const out = [];
  for (const paragraph of String(content).split('\n')) {
    let line = '';
    let width = 0;
    const tokens = paragraph.match(/[^\s]+\s*|\s+/g) || [];
    for (const token of tokens) {
      const w = estWidth(token, size);
      if (width + w > maxWidth && line) {
        out.push(line.trimEnd());
        line = token.replace(/^\s+/, '');
        width = estWidth(line, size);
      } else {
        line += token;
        width += w;
      }
      // 공백 없는 긴 문자열(CJK)은 토큰 안에서도 잘라야 한다
      while (estWidth(line, size) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && estWidth(line.slice(0, cut), size) > maxWidth) cut -= 1;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out.filter((l, i, arr) => l !== '' || arr.length === 1);
}

/**
 * 브라우저에서 도는 seek 런타임. 시간만 넣으면 화면 상태가 결정된다.
 * 문자열로 내보내는 이유: 생성 HTML이 자기 완결적이어야 하고, 번들러를 끌어들이지 않기 위해서.
 */
export const WHITEBOARD_RUNTIME = `
  // 화이트보드 필기 런타임 — window.seek(초)가 이 함수를 부른다
  function wbInitAll(specs) {
    specs.forEach(function (sp) {
      var total = 0;
      sp.strokes.forEach(function (st) {
        if (st.len == null) {
          var el = document.getElementById(st.el);
          st.len = el && el.getTotalLength ? el.getTotalLength() : 0;
        }
        total += st.len;
      });
      sp.totalLen = total || 1;
      // 단계별로 획을 길이 비율에 따라 순서대로 배치한다
      sp.phases.forEach(function (ph) {
        var mine = sp.strokes.filter(function (s) { return s.phase === ph.id; });
        var len = mine.reduce(function (n, s) { return n + s.len; }, 0) || 1;
        var settle = sp.settleMs * Math.max(0, mine.length - 1);
        var draw = Math.max(1, ph.durationMs - settle);
        var t = ph.startMs;
        mine.forEach(function (s) {
          s.startMs = t;
          s.durMs = Math.max(1, draw * (s.len / len));
          t += s.durMs + sp.settleMs;
        });
      });
      sp.strokes.forEach(function (st) {
        var el = document.getElementById(st.el);
        if (!el) return;
        if (st.text) return;                       // 텍스트는 clip 사각형으로 드러낸다
        el.style.strokeDasharray = st.len + ' ' + st.len;
        el.style.strokeDashoffset = st.len;
        if (st.fill) el.style.fill = 'transparent';
      });
    });
    return specs;
  }

  function wbSeek(sp, localMs) {
    var visible = localMs >= sp.enterMs && localMs < sp.exitMs;
    var t = localMs - sp.enterMs;
    var handAt = null;
    var inColor = false;

    sp.strokes.forEach(function (st) {
      var el = document.getElementById(st.el);
      if (!el) return;
      var p = !visible ? 0 : (t - st.startMs) / st.durMs;
      p = p < 0 ? 0 : p > 1 ? 1 : p;

      if (st.text) {
        var rect = document.getElementById(st.el + '-rect');
        if (rect) rect.setAttribute('width', (st.len * p).toFixed(2));
        if (p > 0 && p < 1) handAt = { x: st.x0 + st.len * p, y: st.y };
      } else {
        el.style.strokeDashoffset = (st.len * (1 - p)).toFixed(2);
        if (st.fill) el.style.fill = p >= 1 ? st.fill : 'transparent';
        if (p > 0 && p < 1 && el.getPointAtLength) {
          var pt = el.getPointAtLength(st.len * p);
          var m = el.getCTM();
          handAt = m ? { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f } : pt;
          if (st.kind === 'color') inColor = true;
        }
      }
    });

    if (sp.mode === 'grid') {
      var ph = sp.phases[0];
      var gp = !visible ? 0 : (t - ph.startMs) / ph.durationMs;
      gp = gp < 0 ? 0 : gp > 1 ? 1 : gp;
      var r = document.getElementById(sp.id + '-sweeprect');
      if (r) {
        var horiz = sp.sweep === 'left-right' || sp.sweep === 'right-left';
        if (horiz) {
          r.setAttribute('width', (sp.region.w * gp).toFixed(2));
          r.setAttribute('height', sp.region.h);
          r.setAttribute('x', (sp.sweep === 'right-left' ? sp.region.x + sp.region.w * (1 - gp) : sp.region.x).toFixed(2));
        } else {
          r.setAttribute('width', sp.region.w);
          r.setAttribute('height', (sp.region.h * gp).toFixed(2));
          r.setAttribute('y', (sp.sweep === 'bottom-top' ? sp.region.y + sp.region.h * (1 - gp) : sp.region.y).toFixed(2));
        }
      }
      if (gp > 0 && gp < 1) handAt = { x: sp.region.x + sp.region.w * gp, y: sp.region.y + sp.region.h / 2 };
    }

    var hand = document.getElementById(sp.id + '-hand');
    if (hand && sp.hand) {
      var show = visible && handAt && !(sp.hand.hideDuringColor && inColor);
      hand.style.opacity = show ? '1' : '0';
      if (show) {
        hand.setAttribute('x', (handAt.x - sp.hand.w * sp.hand.ax).toFixed(2));
        hand.setAttribute('y', (handAt.y - sp.hand.w * sp.hand.ay).toFixed(2));
      }
    }
  }

`;
