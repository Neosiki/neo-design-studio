/**
 * Cursor — 제품 UI 데모 커서 컴포넌트 패키지
 *
 * browser_window.jsx / macos_window.jsx 와 함께 사용, 레시피와 매개변수 출처는 참조
 * references/ui-demo-animation.md 팔식④ (궤적 알고리즘: animation-best-practices §3.5;
 * ripple 매개변수: shotcraft·type-and-filter + 디커플링 레시피; seek 안전 규칙: gsap-recipes §6)
 *
 * 프레임 결정성: 전체 파일에서 Math.random / Date.now 금지, 랜덤감은 모두 mulberry32 시드 도출.
 * 동일 프레임에서는 seek 횟수와 관계없이 화면이 완전히 동일함.
 *
 * ── 사용법 A · Stage 시계(animations.jsx)─────────────────────────
 *
 *   const { Stage, Sprite } = window.Animations;
 *   const { CursorSprite, ClickRipple, HoverHighlight } = window;
 *
 *   <Stage duration={8}>
 *     <Sprite start={1} end={2.2}>   {/* 커서 호선이 버튼으로 이동하고, 마지막 구간에서 손떨림이 수렴함 *\/}
 *       <CursorSprite points={[[220, 480], [860, 300]]} seed={7} clickAt={0.96} />
 *     </Sprite>
 *     <Sprite start={2.1} end={3.0}> {/* 클릭 리플: 이중 링 디커플링 *\/}
 *       <ClickRipple x={860} y={300} color="#D97757" duration={0.9} />
 *     </Sprite>
 *   </Stage>
 *
 *   hover 연동 하이라이트(시간 기반 판정, 이벤트 기반이 아님):
 *     const sampler = window.CursorKit.buildCursorSampler(points, { seed: 7 });
 *     const hovered = window.CursorKit.hoverIndexAt(sampler, easedU, [
 *       { id: 'save', rect: { x: 820, y: 270, w: 96, h: 44 } },
 *     ]);
 *     <HoverHighlight rect={{...}} intensity={hovered === 'save' ? 1 : 0} />
 *
 *   드래그: 커서는 dragRange={[0.2, 0.8]} 전달(구간 내에서 잡기 손 모양 + 축소),
 *   드래그되는 요소는 동일한 sampler 로 샘플링하여 그립 포인트 오프셋을 빼서 구동, 커서와 요소는 항상 동기화됨.
 *
 * ── 사용법 B · GSAP timeline(HyperFrames 렌더링)───────────────────
 *
 *   const K = window.CursorKit;
 *   const sampler = K.buildCursorSampler([[220, 480], [860, 300]], { seed: 7 });
 *   K.attachCursorTween(tl, '#cursor', sampler, { duration: 1.1, position: 's1+=0.5' });
 *   K.attachClickTween(tl, '#cursor', { position: '>' });
 *   K.attachRippleTween(tl, '#rip1', '#rip2', { position: '<' });
 *   // 잊지 말 것: gsap-recipes §6.3 의 첫 프레임 안전조치: timeline 등록 후 수동으로 초기 set 를 한 번 보충
 *
 * 커서 형태: arrow(macOS 화살표, 기본)/ hand(클릭 가능한 손 모양)/ grab(드래그 중)/ text(I-beam)
 */

/* ══════════════ 유틸 레이어(순수 함수, 두 가지 드라이버 공용)══════════════ */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CursorEasing = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inQuad: (t) => t * t,
};

// Catmull-Rom 단일 구간 보간(p1→p2, p0/p3 는 인접 제어점)
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/**
 * buildCursorSampler(points, opts) → sample(u) → {x, y}
 *
 * - points 가 2개만 있을 때 자동으로 중점에서 벗어난 제어점을 삽입하여 호선을 만듦
 *   (실제 마우스는 직선으로 이동하지 않음, best-practices §3.5), 오프셋 방향은 seed 가 결정
 * - ≥3 개 점은 Catmull-Rom 스무딩 사용(huarec 커서 스무딩과 동일한 보간)
 * - 손떨림: 서로 약수관계가 아닌 두 주파수의 사인파 중첩, 진폭 ±wobble px,
 *   u→1 에 따라 0으로 수렴(목표에 가까워지면 손이 안정됨)
 */
function buildCursorSampler(points, opts) {
  const o = Object.assign({ seed: 7, wobble: 2, arc: 0.18 }, opts);
  const rand = mulberry32(o.seed);
  const ph1 = rand() * 6.283, ph2 = rand() * 6.283;
  const side = rand() < 0.5 ? -1 : 1;

  let pts = points.map((p) => [p[0], p[1]]);
  if (pts.length === 2) {
    const [a, b] = pts;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const mid = [a[0] + dx * 0.5 - dy * o.arc * side, a[1] + dy * 0.5 + dx * o.arc * side];
    pts = [a, mid, b];
  }
  // 앞뒤에 가상점을 보충하여 Catmull-Rom 이 전체 구간을 덮도록 함
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  const segs = pts.length - 1;

  return function sample(u) {
    const uu = Math.max(0, Math.min(1, u));
    const f = uu * segs;
    const i = Math.min(segs - 1, Math.floor(f));
    const lt = f - i;
    const [x0, y0] = catmullRom(ext[i], ext[i + 1], ext[i + 2], ext[i + 3], lt);
    const damp = o.wobble * (1 - uu);            // 목표에 가까워지면 수렴
    return {
      x: x0 + Math.sin(uu * 47.13 + ph1) * damp, // 47.13 / 33.7 은 약수관계가 아님
      y: y0 + Math.sin(uu * 33.7 + ph2) * damp,
    };
  };
}

// hover 적중: 시간 기반의 결정적 히트 테스트(이벤트 리스너가 아님)
function hoverIndexAt(sampler, u, targets, pad) {
  const p = sampler(u);
  const m = pad || 0;
  for (const t of targets) {
    const r = t.rect;
    if (p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m) return t.id;
  }
  return null;
}

/**
 * rippleRingState(tSec, opts) → { scale, opacity }
 * 이중 링 ripple 의 단일 링 상태. 확산과 소산을 분리(shotcraft 실측 레시피):
 *   확산 out-cubic EXPAND 프레임(충), 소산 선형 FADE 프레임(등속), FADE > EXPAND.
 * 기본 22f/26f@30fps; 콤팩트한 장면(type-and-filter)에서는 각각 10f 까지 축소 가능.
 */
function rippleRingState(tSec, opts) {
  const o = Object.assign({ delayF: 0, expandF: 22, fadeF: 26, r0: 14, r1: 54, fps: 30 }, opts);
  const t = tSec - o.delayF / o.fps;
  if (t < 0) return { scale: o.r0 / o.r1, opacity: 0 };
  const pe = Math.min(1, t / (o.expandF / o.fps));
  const pf = Math.min(1, t / (o.fadeF / o.fps));
  return {
    scale: (o.r0 + (o.r1 - o.r0) * CursorEasing.outCubic(pe)) / o.r1,
    opacity: 1 - pf,
  };
}

/* ══════════════ 커서 형태(SVG, 검은색 채움과 흰 테두리, paintOrder 로 정확한 윤곽 보장)══════════════ */

const CURSOR_PATHS = {
  // macOS 화살표: 왼쪽 가장자리 수직, 경사면이 오른쪽 끝까지, 클릭 꼬리 포함. 핫스팟은 (0,0)
  arrow: {
    viewBox: '0 0 17 22',
    d: 'M1.5 1.5 L1.5 18.6 L6.4 13.9 L9.1 20.3 L11.9 19.1 L9.2 12.8 L14.5 12.8 Z',
    hotspot: [1.5, 1.5],
  },
  // 클릭 가능한 손 모양(단순화된 집게 손가락). 핫스팟은 손끝
  hand: {
    viewBox: '0 0 22 24',
    d: 'M9.2 1.9 c1 0 1.5 .7 1.5 1.6 v6.1 l1 .1 v-4.4 c0-1.9 2.8-1.9 2.8 0 v4.7 l.9 .1 v-3.2 c0-1.8 2.6-1.8 2.6 0 v3.6 l.9 .2 v-1.6 c0-1.6 2.3-1.6 2.3 0 v5.6 c0 4.3-2.9 7.3-7.3 7.3 h-2.1 c-2.9 0-4.5-1.3-5.9-3.7 L3.1 13.4 c-.7-1.2 .8-2.4 1.9-1.5 l2.7 2.3 V3.5 c0-.9 .6-1.6 1.5-1.6 Z',
    hotspot: [9.9, 1.9],
  },
  // 드래그 중(주먹 쥠): hand 의 손가락 수축 변형
  grab: {
    viewBox: '0 0 22 22',
    d: 'M5.4 7.2 c0-1.7 2.5-1.7 2.5 0 v2.1 l.9 0 v-3.3 c0-1.8 2.7-1.8 2.7 0 v3.3 l.9 0 v-2.9 c0-1.8 2.6-1.8 2.6 0 v3 l.9 .1 v-1.7 c0-1.6 2.3-1.6 2.3 0 v5.1 c0 4.2-2.8 7-7.1 7 h-1.9 c-2.8 0-4.4-1.2-5.7-3.6 L2.5 13.1 c-.6-1.2 .8-2.3 1.8-1.4 l1.1 .9 Z',
    hotspot: [10, 8],
  },
  // 텍스트 I-beam. 핫스팟은 중앙
  text: {
    viewBox: '0 0 10 22',
    d: 'M1 1.5 h3 v0 c.4 0 .7 .2 1 .5 c.3-.3 .6-.5 1-.5 h3 v2 h-2.6 c-.2 0-.4 .2-.4 .4 v14.2 c0 .2 .2 .4 .4 .4 H9 v2 H6 c-.4 0-.7-.2-1-.5 c-.3 .3-.6 .5-1 .5 H1 v-2 h2.6 c.2 0 .4-.2 .4-.4 V3.9 c0-.2-.2-.4-.4-.4 H1 Z',
    hotspot: [5, 11],
  },
};

function CursorIcon({ variant = 'arrow', size = 22 }) {
  const s = CURSOR_PATHS[variant] || CURSOR_PATHS.arrow;
  return (
    <svg width={size} height={size * 1.25} viewBox={s.viewBox}
      style={{ display: 'block', overflow: 'visible' }}>
      <path d={s.d} fill="#111" stroke="#fff" strokeWidth="1.4"
        strokeLinejoin="round" style={{ paintOrder: 'stroke' }} />
    </svg>
  );
}

/* ══════════════ Stage 시계 컴포넌트(animations.jsx 와 함께)══════════════ */

/**
 * CursorSprite — <Sprite> 안에 배치되어 경로를 따라 이동하는 커서
 *
 * props:
 *   points     [[x,y],...] 경로 점(스테이지 좌표). 2개 점이면 자동으로 호선
 *   seed       랜덤 시드(시드를 바꾸면 호선과 손떨림이 변경됨)
 *   wobble     손떨림 진폭 px(기본 2, best-practices §3.5 의 ±2px)
 *   ease       진행 완화(easing), 기본 inOutQuad(출발 가속 + 도착 감속의 대칭적인 손 느낌)
 *   clickAt    0-1, 이 진행에서 클릭 눌림 실행(scale 0.85 dip + 바운스, Anticipation)
 *   dragRange  [u0,u1], 구간 내에서 grab 손 모양 + scale 0.94
 *   variant    기본 형태, 기본값 'arrow'
 *   size       커서 너비 px, 기본 22
 */
function CursorSprite({
  points, seed = 7, wobble = 2, ease = CursorEasing.inOutQuad,
  clickAt = null, dragRange = null, variant = 'arrow', size = 22, style,
}) {
  const { useSprite } = window.Animations;
  const { t } = useSprite();
  const sampler = React.useMemo(
    () => buildCursorSampler(points, { seed, wobble }),
    [JSON.stringify(points), seed, wobble]
  );
  const u = ease(t);
  const p = sampler(u);

  let scale = 1;
  let shape = variant;
  if (dragRange && u >= dragRange[0] && u <= dragRange[1]) {
    shape = 'grab';
    scale = 0.94;
  }
  if (clickAt !== null) {
    const d = (u - clickAt) / 0.05;              // 클릭 윈도우 ±5% 진행
    if (d >= 0 && d < 1) scale *= 0.85 + 0.15 * CursorEasing.outCubic(d);      // 바운스
    else if (d >= -0.6 && d < 0) scale *= 1 - 0.15 * CursorEasing.inQuad(1 + d / 0.6); // 눌림
  }

  const hs = (CURSOR_PATHS[shape] || CURSOR_PATHS.arrow).hotspot;
  const k = size / 17;                            // 시각적 크기 정규화
  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, zIndex: 999, pointerEvents: 'none',
      transform: `translate(${p.x - hs[0] * k}px, ${p.y - hs[1] * k}px) scale(${scale})`,
      transformOrigin: `${hs[0] * k}px ${hs[1] * k}px`,
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
      ...style,
    }}>
      <CursorIcon variant={shape} size={size} />
    </div>
  );
}

/**
 * ClickRipple — 이중 동심 리플(독립 <Sprite> 에 배치되어 클릭 프레임부터 시작)
 * 이중 링 시작 프레임 차 3f; 반지름 14→54 / 14→78; 확산 out-cubic 22f, 소산 선형 26f 로 분리.
 * duration = 해당 Sprite 의 길이(초), 로컬 진행도를 초로 환산하는 데 사용
 */
function ClickRipple({ x, y, color = '#D97757', r1 = 54, r2 = 78, duration = 0.9, fps = 30 }) {
  const { useSprite } = window.Animations;
  const { t } = useSprite();
  const tSec = t * duration;
  const rings = [
    { rMax: r1, st: rippleRingState(tSec, { delayF: 0, r1, fps }) },
    { rMax: r2, st: rippleRingState(tSec, { delayF: 3, r1: r2, fps }) },
  ];
  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 998, pointerEvents: 'none' }}>
      {rings.map((r, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: -r.rMax, top: -r.rMax, width: r.rMax * 2, height: r.rMax * 2,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          boxShadow: `0 0 40px ${color}55`,
          transform: `scale(${r.st.scale})`,      // 고정 크기 + scale, 너비/높이는 tween 하지 않음
          opacity: r.st.opacity,
        }} />
      ))}
    </div>
  );
}

/**
 * HoverHighlight — 커서 hover 대상의 연동 하이라이트
 * intensity 0→1 은 호출자가 시간에서 유도(hoverIndexAt 와 함께), 이 컴포넌트는 렌더링만 담당:
 * hairline 테두리 등장 + 약간의 밝기 증가, 커서가 떠나면 즉시 해제.
 */
function HoverHighlight({ rect, intensity = 0, color = '#D97757', radius = 8 }) {
  if (intensity <= 0) return null;
  return (
    <div style={{
      position: 'absolute', left: rect.x - 3, top: rect.y - 3,
      width: rect.w + 6, height: rect.h + 6,
      borderRadius: radius, pointerEvents: 'none',
      border: `1.5px solid ${color}`,
      boxShadow: `0 0 0 3px ${color}22`,
      opacity: intensity,
      backdropFilter: `brightness(${1 + 0.06 * intensity})`,
    }} />
  );
}

/* ══════════════ GSAP 드라이버 레이어(HyperFrames 렌더링 파이프라인)══════════════ */

/**
 * attachCursorTween — proxy tween 이 sampler 경로를 따라 커서 DOM 요소를 이동시킴
 * (gsap-recipes §3.5 의 컴포넌트화 래핑; 모든 것은 proxy.u 에서 유도되어 seek-safe)
 */
function attachCursorTween(tl, target, sampler, opts) {
  const o = Object.assign({ duration: 1.1, ease: 'power1.inOut', position: '>' }, opts);
  const proxy = { u: 0 };
  tl.to(proxy, {
    u: 1, duration: o.duration, ease: o.ease,
    onUpdate: () => {
      const p = sampler(proxy.u);
      gsap.set(target, { x: p.x, y: p.y });
    },
  }, o.position);
  return proxy;
}

/** attachClickTween — 클릭 Anticipation: 눌림 0.85 후 back.out 으로 바운스 */
function attachClickTween(tl, target, opts) {
  const o = Object.assign({ position: '>' }, opts);
  tl.to(target, { scale: 0.85, duration: 0.08, ease: 'power1.in' }, o.position);
  tl.to(target, { scale: 1, duration: 0.25, ease: 'back.out' }, '>');
}

/**
 * attachRippleTween — 이중 링 리플. ring1/ring2 는 두 개의 고정 크기 원형 링 요소
 * (지름 = 2×최종 반지름, 초기 scale = r0/r1), scale 과 opacity 만 tween 함.
 */
function attachRippleTween(tl, ring1, ring2, opts) {
  const o = Object.assign({ r0: 14, r1: 54, r2: 78, fps: 30, position: '>' }, opts);
  const F = (n) => n / o.fps;
  [[ring1, o.r1, 0], [ring2, o.r2, 3]].forEach(([el, rMax, delayF]) => {
    const at = delayF === 0 ? o.position : '<+=' + F(delayF);
    tl.fromTo(el, { scale: o.r0 / rMax, autoAlpha: 1 },
      { scale: 1, duration: F(22), ease: 'power3.out' }, at);          // 확산: 강한 동작
    tl.to(el, { autoAlpha: 0, duration: F(26), ease: 'none' }, '<');   // 소산: 균일, 분리
  });
}

/* ══════════════ 내보내기 ══════════════ */

if (typeof window !== 'undefined') {
  window.CursorIcon = CursorIcon;
  window.CursorSprite = CursorSprite;
  window.ClickRipple = ClickRipple;
  window.HoverHighlight = HoverHighlight;
  window.CursorKit = {
    mulberry32,
    CursorEasing,
    buildCursorSampler,
    hoverIndexAt,
    rippleRingState,
    attachCursorTween,
    attachClickTween,
    attachRippleTween,
    CURSOR_PATHS,
  };
}
