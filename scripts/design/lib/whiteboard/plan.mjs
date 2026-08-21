/**
 * whiteboard/plan.mjs — SRT를 영상 IR의 장면 계획으로 바꾼다.
 *
 * 원본 저장소는 목표·최소·최대 시간만 보고 자막 묶음을 잘랐다. 그러면 문장 한가운데서
 * 장면이 바뀐다. 여기서는 **시간으로 후보 구간을 좁힌 뒤 의미 경계로 자리를 고른다.**
 *
 *   1차: 누적 길이가 minMs를 넘으면 maxMs까지가 경계 후보 구간
 *   2차: 후보 중 점수가 높은 자리 선택
 *        + 문장이 끝난 직후    (가장 강한 신호)
 *        + 다음 자막이 전환어로 시작
 *        + 자막 사이 공백이 큼 (숨 쉬는 자리)
 *        + 목표 길이에 가까움
 *
 * 장면 안의 요소 배치와 보호 영역은 결정론적으로 계산한다. 사용자는 design whiteboard
 * annotate에서 이 초안을 고친다 — 빈 화면에서 시작하는 것보다 고치는 편이 늘 빠르다.
 */

import { parseSrt, detectLanguage, endsSentence, startsNewTopic } from '../srt.mjs';

export const DEFAULTS = {
  targetMs: 28000,
  minMs: 18000,
  maxMs: 38000,
  gapBonusMs: 400,
};

/* ── 장면 경계 ─────────────────────────────────────────────────── */

/**
 * 자막 큐를 장면 단위로 묶는다.
 * 반환: [{ cues, startMs, endMs, reason }]
 */
export function planSceneBoundaries(cues, opts = {}) {
  const { targetMs, minMs, maxMs, gapBonusMs } = { ...DEFAULTS, ...opts };
  const lang = opts.lang || detectLanguage(cues);
  if (cues.length === 0) return [];

  const groups = [];
  let start = 0;

  while (start < cues.length) {
    const sceneStartMs = cues[start].startMs;

    // 남은 분량이 최소 길이에 못 미치면 통째로 마지막 장면
    const remainMs = cues[cues.length - 1].endMs - sceneStartMs;
    if (remainMs <= maxMs) {
      groups.push(makeGroup(cues.slice(start), '남은 분량 전체'));
      break;
    }

    let best = null;
    for (let i = start; i < cues.length - 1; i += 1) {
      const elapsed = cues[i].endMs - sceneStartMs;
      if (elapsed < minMs) continue;
      if (elapsed > maxMs) break;

      const next = cues[i + 1];
      const gap = next.startMs - cues[i].endMs;
      let score = 0;
      const reasons = [];

      if (endsSentence(cues[i].text, lang)) { score += 50; reasons.push('문장 종료'); }
      if (startsNewTopic(next.text, lang)) { score += 35; reasons.push('전환어 시작'); }
      if (gap >= gapBonusMs) { score += Math.min(20, gap / 100); reasons.push(`${gap}ms 공백`); }
      score += Math.max(0, 25 - Math.abs(elapsed - targetMs) / 400);

      if (!best || score > best.score) best = { at: i, score, reasons, elapsed };
    }

    // 후보가 없으면 maxMs 직전에서 자른다 (긴 문장 하나가 창을 다 먹은 경우)
    if (!best) {
      let cut = start;
      while (cut < cues.length - 1 && cues[cut].endMs - sceneStartMs < maxMs) cut += 1;
      best = { at: Math.max(start, cut - 1), reasons: ['시간 상한'], score: 0 };
    }

    groups.push(makeGroup(cues.slice(start, best.at + 1), best.reasons.join(' · ') || '시간 기준'));
    start = best.at + 1;
  }

  return groups;
}

function makeGroup(groupCues, reason) {
  return {
    cues: groupCues,
    startMs: groupCues[0].startMs,
    endMs: groupCues[groupCues.length - 1].endMs,
    reason,
  };
}

/* ── 장면 안의 배치 ────────────────────────────────────────────── */

/**
 * n개의 요소를 안전영역 안에 결정론적으로 배치한다.
 * 화이트보드는 화면을 채우는 게 아니라 "말하는 순서대로 자리를 잡아가는" 매체라
 * 첫 요소가 크고 위쪽에 온다.
 */
export function layoutRegions(n, area) {
  const { x, y, w, h } = area;
  const gap = Math.round(Math.min(w, h) * 0.04);
  const cell = (col, row, cols, rows) => ({
    x: Math.round(x + (w + gap) * (col / cols)),
    y: Math.round(y + (h + gap) * (row / rows)),
    w: Math.round(w / cols - gap * ((cols - 1) / cols)),
    h: Math.round(h / rows - gap * ((rows - 1) / rows)),
  });

  if (n <= 1) return [{ x, y, w, h }];
  if (n === 2) return [cell(0, 0, 1, 2), cell(0, 1, 1, 2)];
  if (n === 3) {
    return [
      { x, y, w, h: Math.round(h * 0.34) },
      { x, y: Math.round(y + h * 0.34 + gap), w: Math.round(w / 2 - gap / 2), h: Math.round(h * 0.66 - gap) },
      {
        x: Math.round(x + w / 2 + gap / 2),
        y: Math.round(y + h * 0.34 + gap),
        w: Math.round(w / 2 - gap / 2),
        h: Math.round(h * 0.66 - gap),
      },
    ];
  }
  if (n === 4) return [cell(0, 0, 2, 2), cell(1, 0, 2, 2), cell(0, 1, 2, 2), cell(1, 1, 2, 2)];

  const cols = n <= 6 ? 3 : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => cell(i % cols, Math.floor(i / cols), cols, rows));
}

/** 겹치는 사각형만 골라 보호 영역으로 남긴다. 전부 넣으면 마스크가 무의미해진다. */
function overlapping(region, others) {
  return others.filter((o) => {
    const ix = Math.min(region.x + region.w, o.x + o.w) - Math.max(region.x, o.x);
    const iy = Math.min(region.y + region.h, o.y + o.h) - Math.max(region.y, o.y);
    return ix > 0 && iy > 0;
  });
}

const ROLE_BY_POSITION = (i, total) => {
  if (i === 0) return 'hook';
  if (i === total - 1) return total > 2 ? 'cta' : 'outro';
  if (i === 1) return 'context';
  if (i === total - 2) return 'proof';
  return 'solution';
};

/* ── 영상 IR 생성 ─────────────────────────────────────────────── */

/**
 * SRT 텍스트에서 whiteboard 플러그인을 쓰는 영상 IR을 만든다.
 * 반환: { ir, plan: { lang, scenes: [{ id, reason, cueCount }] }, warnings }
 */
export function planWhiteboardIr(srtText, options = {}) {
  const { cues, warnings } = parseSrt(srtText);
  const lang = options.lang || detectLanguage(cues);
  const groups = planSceneBoundaries(cues, { ...options, lang });

  const canvas = {
    width: options.width || 1920,
    height: options.height || 1080,
    fps: options.fps || 30,
    safeArea: options.safeArea || { top: 80, right: 120, bottom: 160, left: 120 },
  };
  const area = {
    x: canvas.safeArea.left,
    y: canvas.safeArea.top,
    w: canvas.width - canvas.safeArea.left - canvas.safeArea.right,
    h: canvas.height - canvas.safeArea.top - canvas.safeArea.bottom,
  };

  const mode = options.mode === 'grid' ? 'grid' : 'skeleton';
  const scenes = groups.map((group, gi) => {
    const sceneDuration = group.endMs - group.startMs;
    const regions = layoutRegions(group.cues.length, area);

    const layers = group.cues.map((cue, li) => {
      const region = regions[li];
      const later = regions.slice(li + 1);
      const enterMs = Math.max(0, cue.startMs - group.startMs);
      const exitMs = sceneDuration;
      const fontSize = fontSizeFor(cue.text, region);

      const layer = {
        id: `e${li + 1}`,
        region,
        enterMs,
        exitMs,
        block: {
          id: `e${li + 1}-text`,
          kind: li === 0 ? 'heading' : 'body',
          text: cue.text,
          alt: cue.text,
          style: {
            fontRole: li === 0 ? 'display' : 'body',
            fontSize,
            color: li === 0 ? 'accent' : 'fg',
            lineHeight: 1.4,
            align: 'left',
          },
        },
        render: {
          plugin: 'whiteboard',
          mode,
          ...(options.theme ? { theme: options.theme } : {}),
          art: {
            text: {
              content: cue.text,
              fontRole: li === 0 ? 'display' : 'body',
              fontSize,
              lineHeight: 1.4,
              align: 'left',
            },
          },
          phases: [{ id: 'ink', kind: 'ink', startMs: 0, durationMs: Math.max(600, Math.min(2600, cue.endMs - cue.startMs)) }],
        },
      };

      const protectedRegions = overlapping(region, later);
      if (protectedRegions.length) layer.protectedRegions = protectedRegions;
      return layer;
    });

    return {
      id: `s${String(gi + 1).padStart(2, '0')}`,
      sequence: gi,
      startMs: group.startMs,
      durationMs: sceneDuration,
      narrativeRole: ROLE_BY_POSITION(gi, groups.length),
      subtitle: group.cues.map((c) => c.text).join(' '),
      shot: { camera: 'static', transitionIn: gi === 0 ? 'cut' : 'dissolve' },
      layers,
    };
  });

  // 장면 사이 공백을 없애 타임라인을 연속으로 만든다 (video.gap 검사를 통과시키기 위해서가
  // 아니라, 화이트보드는 화면이 비는 순간이 없는 매체이기 때문)
  for (let i = 0; i < scenes.length; i += 1) {
    const prevEnd = i === 0 ? 0 : scenes[i - 1].startMs + scenes[i - 1].durationMs;
    const shift = scenes[i].startMs - prevEnd;
    if (shift !== 0) {
      scenes[i].startMs = prevEnd;
      scenes[i].durationMs += shift;
      for (const layer of scenes[i].layers) {
        layer.enterMs = Math.max(0, layer.enterMs + shift);
        layer.exitMs = scenes[i].durationMs;
      }
    }
  }

  const ir = {
    schemaVersion: '1.0',
    id: options.id || 'whiteboard',
    type: 'video',
    title: options.title || '화이트보드 영상',
    // 종이·선 색을 지정하면 이 산출물에서만 브랜드 토큰을 덮어쓴다.
    // 지정하지 않으면 브랜드 토큰을 그대로 상속한다 — 고정 미색 종이를 강요하지 않는다.
    ...(options.theme?.paper || options.theme?.ink
      ? {
          tokenOverrides: {
            color: {
              ...(options.theme.paper ? { bg: options.theme.paper } : {}),
              ...(options.theme.ink ? { fg: options.theme.ink } : {}),
              ...(options.theme.accent ? { accent: options.theme.accent } : {}),
            },
          },
        }
      : {}),
    canvas,
    scenes,
    audio: {
      targetLufs: -16,
      silentVariant: true,
      ...(options.voiceoverPath ? { voiceover: { path: options.voiceoverPath, gainDb: 0 } } : {}),
      ...(options.bgmPath ? { bgm: { path: options.bgmPath, gainDb: -20, duckDb: -6 } } : {}),
    },
    ...(options.srtPath ? { captions: { srt: options.srtPath, burnIn: false, language: lang } } : {}),
  };

  return {
    ir,
    plan: {
      lang,
      totalMs: scenes.reduce((m, s) => Math.max(m, s.startMs + s.durationMs), 0),
      scenes: scenes.map((s, i) => ({
        id: s.id,
        reason: groups[i].reason,
        cueCount: groups[i].cues.length,
        durationMs: s.durationMs,
      })),
    },
    warnings,
  };
}

/** 영역에 들어갈 만한 글자 크기를 고른다. 넘침 검사에 바로 걸리지 않도록 보수적으로. */
function fontSizeFor(text, region) {
  const chars = [...String(text)].reduce((n, ch) => {
    const code = ch.codePointAt(0);
    const wide = (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3);
    return n + (wide ? 1 : 0.52);
  }, 0);
  if (chars === 0) return 40;
  // 폭·높이 양쪽을 만족하는 가장 큰 크기 (줄바꿈을 감안해 여유 15%)
  for (const size of [96, 84, 72, 64, 56, 48, 42, 36, 32, 28]) {
    const lines = Math.max(1, Math.ceil((chars * size) / region.w));
    if (lines * size * 1.4 <= region.h * 0.85) return size;
  }
  return 28;
}
