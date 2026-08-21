# Apple Gallery Showcase · 갤러리 전시벽 애니메이션 스타일

> 영감 출처: Claude Design 공식 사이트 hero 영상 + 애플 제품 페이지의 「작품벽」식 진열
> 실전 출처: design-studio 발표 hero v5
> 적용 장면: **제품 발표 hero 애니메이션, skill 역량 시연, 포트폴리오 전시** — 「고품질 산출물 여러 점」을 동시에 진열하면서 관객의 주의를 유도해야 하는 모든 장면

---

## 발동 판단: 언제 이 스타일을 쓰나

**어울린다**:
- 한 화면에 전시할 실제 산출물이 10장 이상 있다(PPT, App, 웹페이지, 인포그래픽)
- 관객이 전문 수용자다(개발자, 디자이너, 프로덕트 매니저). 「질감」에 민감하다
- 전달하려는 기질이 「절제, 전시회식, 고급, 공간감」이다
- 초점과 전체가 동시에 있어야 한다(디테일을 보면서도 전체를 놓치지 않는다)

**어울리지 않는다**:
- 단일 제품 집중(frontend-design의 제품 hero 템플릿을 쓴다)
- 감정 지향/서사성이 강한 애니메이션(타임라인 서사 템플릿을 쓴다)
- 작은 화면 / 세로 화면(기울어진 시점은 작은 화면에서 뭉개진다)

---

## 핵심 시각 Token

```css
:root {
  /* 밝은 갤러리 색판 */
  --bg:         #F5F5F7;   /* 주 캔버스 바닥 — 애플 공식 사이트 회색 */
  --bg-warm:    #FAF9F5;   /* 따뜻한 아이보리 변주 */
  --ink:        #1D1D1F;   /* 주 글자색 */
  --ink-80:     #3A3A3D;
  --ink-60:     #545458;
  --muted:      #86868B;   /* 2차 텍스트 */
  --dim:        #C7C7CC;
  --hairline:   #E5E5EA;   /* 카드 1px 테두리 */
  --accent:     #D97757;   /* 테라코타 오렌지 — Claude brand */
  --accent-deep:#B85D3D;

  --serif-cn: "Noto Serif SC", "Songti SC", Georgia, serif;
  --serif-en: "Source Serif 4", "Tiempos Headline", Georgia, serif;
  --sans:     "Inter", -apple-system, "PingFang SC", system-ui;
  --mono:     "JetBrains Mono", "SF Mono", ui-monospace;
}
```

**핵심 원칙**:
1. **순수 검정 바닥은 절대 쓰지 않는다.** 검정 바닥은 작품을 영화처럼 보이게 만들고, 「채택할 수 있는 작업 성과물」로는 보이지 않게 한다
2. **테라코타 오렌지가 유일한 색상 accent**이고 나머지는 전부 회색 계조 + 흰색이다
3. **글꼴 3중 스택**(serif 영문 + serif 중문 + sans + mono)으로 「인터넷 제품」이 아니라 「출판물」의 기질을 만든다

---

## 핵심 레이아웃 패턴

### 1. 부유 카드 (이 스타일 전체의 기본 단위)

```css
.gallery-card {
  background: #FFFFFF;
  border-radius: 14px;
  padding: 6px;                          /* 내부 여백이 「액자 매트」다 */
  border: 1px solid var(--hairline);
  box-shadow:
    0 20px 60px -20px rgba(29, 29, 31, 0.12),   /* 주 그림자. 부드럽고 길게 */
    0 6px 18px -6px rgba(29, 29, 31, 0.06);     /* 두 번째 근광. 떠 있는 느낌을 만든다 */
  aspect-ratio: 16 / 9;                  /* slide 비율 통일 */
  overflow: hidden;
}
.gallery-card img {
  width: 100%; height: 100%;
  object-fit: cover;
  border-radius: 9px;                    /* 카드 라운드보다 약간 작게. 시각적 중첩 */
}
```

**나쁜 예**: 가장자리에 딱 붙인 타일(padding 없음, border 없음, shadow 없음) — 그건 인포그래픽의 밀도 표현이고 전시가 아니다.

### 2. 3D로 기울인 작품벽

```css
.gallery-viewport {
  position: absolute; inset: 0;
  overflow: hidden;
  perspective: 2400px;                   /* 깊은 원근. 기울기가 과장되지 않는다 */
  perspective-origin: 50% 45%;
}
.gallery-canvas {
  width: 4320px;                         /* 캔버스 = viewport의 2.25배 */
  height: 2520px;                        /* pan 공간을 남긴다 */
  transform-origin: center center;
  transform: perspective(2400px)
             rotateX(14deg)              /* 뒤로 기울인다 */
             rotateY(-10deg)             /* 왼쪽으로 돌린다 */
             rotateZ(-2deg);             /* 미세한 기울기로 너무 반듯한 느낌을 뺀다 */
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 40px;
  padding: 60px;
}
```

**파라미터 sweet spot**:
- rotateX: 10-15deg(더 늘리면 와인 파티 VIP 배경판처럼 된다)
- rotateY: ±8-12deg(좌우 대칭감)
- rotateZ: ±2-3deg(「기계가 놓은 게 아니다」라는 사람의 온기)
- perspective: 2000-2800px(2000 미만이면 어안이 되고, 3000 초과면 정투영에 가까워진다)

### 3. 2×2 네 모서리 집결 (선택 장면)

```css
.grid22 {
  display: grid;
  grid-template-columns: repeat(2, 800px);
  gap: 56px 64px;
  align-items: start;
}
```

카드마다 대응하는 모서리(tl/tr/bl/br)에서 중앙으로 슬라이드 인 + fade in 한다. 대응하는 `cornerEntry` 벡터:

```js
const cornerEntry = {
  tl: { dx: -700, dy: -500 },
  tr: { dx:  700, dy: -500 },
  bl: { dx: -700, dy:  500 },
  br: { dx:  700, dy:  500 },
};
```

---

## 다섯 가지 핵심 애니메이션 패턴

### 패턴 A · 네 모서리 집결 (0.8-1.2s)

요소 4개가 뷰포트 네 모서리에서 슬라이드 인하면서 0.85→1.0으로 확대된다. ease-out에 대응. 「여러 방향의 선택지를 보여주는」 오프닝에 어울린다.

```js
const inP = easeOut(clampLerp(t, start, end));
card.style.transform = `translate3d(${(1-inP)*ce.dx}px, ${(1-inP)*ce.dy}px, 0) scale(${0.85 + 0.15*inP})`;
card.style.opacity = inP;
```

### 패턴 B · 선택된 것 확대 + 나머지 슬라이드 아웃 (0.8s)

선택된 카드는 1.0→1.28로 확대되고, 나머지 카드는 fade out + blur + 네 모서리로 표류해 돌아간다.

```js
// 선택된 것
card.style.transform = `translate3d(${cellDx*outP}px, ${cellDy*outP}px, 0) scale(${1 + 0.28*easeOut(zoomP)})`;
// 선택되지 않은 것
card.style.opacity = 1 - outP;
card.style.filter = `blur(${outP * 1.5}px)`;
```

**핵심**: 선택되지 않은 것은 순수 fade가 아니라 blur여야 한다. blur가 피사계 심도를 모사해서 선택된 것을 시각적으로 「앞으로 밀어낸다」.

### 패턴 C · Ripple 파문 전개 (1.7s)

중심에서 밖으로, 거리에 따라 delay를 주며 카드마다 차례로 페이드 인 + 1.25x에서 0.94x로 축소(「카메라가 물러난다」).

```js
const col = i % COLS, row = Math.floor(i / COLS);
const dc = col - (COLS-1)/2, dr = row - (ROWS-1)/2;
const dist = Math.sqrt(dc*dc + dr*dr);
const delay = (dist / maxDist) * 0.8;
const localT = Math.max(0, (t - rippleStart - delay) / 0.7);
card.style.opacity = easeOut(Math.min(1, localT));

// 동시에 전체 scale 1.25→0.94
const galleryScale = 1.25 - 0.31 * easeOut(rippleProgress);
```

### 패턴 D · Sinusoidal Pan (지속적 표류)

사인파 + 선형 표류를 조합해서 marquee 특유의 「시작점과 끝점이 있는」 루프감을 없앤다.

```js
const panX = Math.sin(panT * 0.12) * 220 - panT * 8;    // 가로로 왼쪽 표류
const panY = Math.cos(panT * 0.09) * 120 - panT * 5;    // 세로로 위쪽 표류
const clampedX = Math.max(-900, Math.min(900, panX));   // 가장자리가 드러나지 않게
```

**파라미터**:
- 사인 주기 `0.09-0.15 rad/s`(느리게, 한 번 흔들리는 데 약 30-50초)
- 선형 표류 `5-8 px/s`(관객이 눈을 깜빡이는 것보다 느리게)
- 진폭 `120-220 px`(느낄 수 있을 만큼 크고, 어지럽지 않을 만큼 작게)

### 패턴 E · Focus Overlay (초점 전환)

**핵심 설계**: focus overlay는 **평면 요소**(기울이지 않는다)이고 기울어진 캔버스 위에 떠 있다. 선택된 slide가 타일 위치(약 400×225)에서 화면 중앙(960×540)으로 확대되고, 배경 캔버스는 기울기를 바꾸지 않되 **45%까지 어두워진다.**

```js
// Focus overlay (flat, centered)
focusOverlay.style.width = (startW + (endW - startW) * focusIntensity) + 'px';
focusOverlay.style.height = (startH + (endH - startH) * focusIntensity) + 'px';
focusOverlay.style.opacity = focusIntensity;

// 배경 카드는 어두워지지만 여전히 보인다(핵심! 100% 마스크를 씌우지 말 것)
card.style.opacity = entryOp * (1 - 0.55 * focusIntensity);   // 1 → 0.45
card.style.filter = `brightness(${1 - 0.3 * focusIntensity})`;
```

**선명도 철칙**:
- Focus overlay의 `<img>`는 반드시 `src`가 원본 이미지에 직결돼야 한다. **gallery의 압축 썸네일을 재사용하지 말 것**
- 모든 원본 이미지를 `new Image()[]` 배열로 미리 preload한다
- overlay 자신의 `width/height`를 프레임마다 계산하면 브라우저가 프레임마다 원본을 resample한다

---

## 타임라인 아키텍처 (재사용 가능한 골격)

```js
const T = {
  DURATION: 25.0,
  s1_in: [0.0, 0.8],    s1_type: [1.0, 3.2],  s1_out: [3.5, 4.0],
  s2_in: [3.9, 5.1],    s2_hold: [5.1, 7.0],  s2_out: [7.0, 7.8],
  s3_hold: [7.8, 8.3],  s3_ripple: [8.3, 10.0],
  panStart: 8.6,
  focuses: [
    { start: 11.0, end: 12.7, idx: 2  },
    { start: 13.3, end: 15.0, idx: 3  },
    { start: 15.6, end: 17.3, idx: 10 },
    { start: 17.9, end: 19.6, idx: 16 },
  ],
  s4_walloff: [21.1, 21.8], s4_in: [21.8, 22.7], s4_hold: [23.7, 25.0],
};

// 핵심 easing(v9 과거 구현은 cubic을 썼다. 새 프로젝트의 주 easing 기본값은 expoOut. best-practices §2 / hero-case-study 패턴1의 수정 참조)
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
function lerp(time, start, end, fromV, toV, easing) {
  if (time <= start) return fromV;
  if (time >= end) return toV;
  let p = (time - start) / (end - start);
  if (easing) p = easing(p);
  return fromV + (toV - fromV) * p;
}

// 단일 render(t) 함수가 타임스탬프를 읽고 모든 요소를 쓴다
function render(t) { /* ... */ }
requestAnimationFrame(function tick(now) {
  const t = ((now - startMs) / 1000) % T.DURATION;
  render(t);
  requestAnimationFrame(tick);
});
```

**아키텍처의 핵심**: **모든 상태를 타임스탬프 t에서 도출한다.** 상태 기계도 없고 setTimeout도 없다. 그래서:
- 임의 시점으로 `window.__setTime(12.3)`을 하면 즉시 이동한다(playwright로 프레임 단위 캡처하기 편하다)
- 루프가 본래부터 이음매가 없다(t mod DURATION)
- Debug할 때 아무 프레임이나 얼릴 수 있다

---

## 질감 디테일 (놓치기 쉽지만 치명적이다)

### 1. SVG noise texture

밝은 바닥은 「너무 평평한 것」을 가장 두려워한다. 극히 약한 fractalNoise를 한 겹 얹는다.

```html
<style>
.stage::before {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.078  0 0 0 0 0.078  0 0 0 0 0.074  0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity: 0.5;
  pointer-events: none;
  z-index: 30;
}
</style>
```

보기에는 차이가 없어 보이지만, 빼 보면 있었다는 걸 알게 된다.

### 2. 모서리 브랜드 표기

```html
<div class="corner-brand">
  <div class="mark"></div>
  <div>DESIGN · DESIGN</div>
</div>
```

```css
.corner-brand {
  position: absolute; top: 48px; left: 72px;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted);
}
```

작품벽 scene에서만 표시하고 페이드 인·아웃한다. 미술관의 작품 라벨 같은 것이다.

### 3. 브랜드 수습 wordmark

```css
.brand-wordmark {
  font-family: var(--sans);
  font-size: 148px;
  font-weight: 700;
  letter-spacing: -0.045em;   /* 음수 자간이 핵심. 글자를 조여 로고처럼 만든다 */
}
.brand-wordmark .accent {
  color: var(--accent);
  font-weight: 500;           /* accent 글자는 오히려 조금 얇게. 시각적 대비 */
}
```

`letter-spacing: -0.045em`은 애플 제품 페이지 큰 글자의 표준 방식이다.

---

## 자주 나오는 실패 모드

| 증상 | 원인 | 해법 |
|---|---|---|
| PPT 템플릿처럼 보인다 | 카드에 shadow / hairline이 없다 | 두 겹 box-shadow + 1px border를 넣는다 |
| 기울기가 싸구려로 느껴진다 | rotateY만 쓰고 rotateZ를 안 넣었다 | ±2-3deg rotateZ로 반듯함을 깬다 |
| Pan이 「끊기는」 느낌이다 | setTimeout이나 CSS keyframes 루프를 썼다 | rAF + sin/cos 연속 함수를 쓴다 |
| Focus할 때 글자가 안 보인다 | gallery 타일의 저해상 이미지를 재사용했다 | 독립 overlay + 원본 src 직결 |
| 배경이 너무 비었다 | 단색 `#F5F5F7` | SVG fractalNoise를 opacity 0.5로 얹는다 |
| 글꼴이 너무 "인터넷"이다 | Inter만 있다 | Serif(중문·영문 각 하나) + mono, 3중 스택으로 |

---

## 인용

- 완결 구현 샘플: hero-animation-v5.html(저자 로컬 샘플, 저장소에 함께 배포되지 않음)
- 원래 영감: claude.ai/design hero 영상
- 참고 미감: Apple 제품 페이지, Dribbble shot 모음 페이지

「고품질 산출물 여러 점을 진열해야 하는」 애니메이션 요구가 오면 이 파일에서 골격을 그대로 복사하고 내용을 바꾸고 timing만 조정하면 된다.
