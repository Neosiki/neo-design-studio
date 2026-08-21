# GSAP Recipes · 디자인 언어에서 GSAP Timeline으로의 번역 레이어

> 이 문서는 단 한 가지만을 수행합니다: design-studio에 이미 정립된 애니메이션 디자인 언어를
> (`animation-best-practices.md`의 5단계 서사, easing 체계, 모션 언어 8개 원칙, 장면 레시피,
> 그리고`cinematic-patterns.md`의 22초 5-scene 템플릿)을 직접 붙여넣기 가능한
> HyperFrames 렌더링 백엔드에서 실행되는 GSAP timeline 구현 레시피.
>
> **디자인 판단은 본 skill 자체의 references를 기준으로 하며, GSAP은 구현 도구일 뿐입니다.**
> 언제 호버(hover)해야 하는지, 어떤 서사 아크(narrative arc)를 사용해야 하는지, 무엇이 아름다운지는 다음을 참고하십시오:`animation-best-practices.md`§0;
> 이 문서는 "이 규칙을 GSAP로 어떻게 작성하는가"에 대해서만 답변합니다.
> HyperFrames의 합성 계약(composition root 속성,`.clip`마킹, 렌더링 명령, check 감사)
> 참조`references/hyperframes-backend.md`, 이 문서는 인용만 하며 재진술하지 않습니다.

---

## 0 · 기초 템플릿 (모든 컴포지션은 여기서 시작됩니다)```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>
  window.__timelines = window.__timelines || {};

  const tl = gsap.timeline({
    paused: true,                                   // 필수. HyperFrames가 seek을 담당합니다
    defaults: { ease: \"expo.out\", duration: 0.6 },  // 이 스킬의 주된 easing (§1 참조)
  });

  // ... 모든 tween은 이 타임라인에 걸려 있습니다 ...

  window.__timelines[\"main\"] = tl;  // key는 합성 루트의 data-composition-id와 같아야 합니다
</script>
```
하드 제약 조건(하나라도 위반할 경우 렌더링 결과를 보장할 수 없음):

- timeline 필수`paused: true`, **절대로 호출하지 마십시오 `tl.play()`** 렌더링 핵심 애니메이션 제작
- timeline은 반드시 동기 코드 내에서 생성해야 하며, async / 타이머 / 이벤트 콜백에 넣지 않습니다.
- 렌더링 시간은 컴포지션 루트의`data-duration`, timeline 길이가 아닙니다. 빈 tween으로 길이를 채우지 마세요.
- 금지`repeat: -1`루프 동작은 가시적 지속 시간으로 유한한 repeat 횟수를 계산합니다.
- 주의:`defaults: { ease: "expo.out" }`hyperframes-animation 문서와`power3.out`house default와 다릅니다. 그것은 그곳의 취향이며, 본 skill의 기존 규칙은 「expoOut이 기본 메인 easing」이라는 점입니다. 번역 레이어는 자체 디자인 언어를 따릅니다.

---

## 1 · Easing 매핑 테이블 · 자체 개발 Easing → GSAP`assets/animations.jsx` 내 자체 개발 Easing 함수를 GSAP 표기법으로 하나씩 매칭합니다.
앞의 세 개는 수학적으로 **완전히 동일한 곡선**이며, 근사치가 아닙니다.

| 자체 개발 Easing | 수학적 정의 | GSAP 표기법 | 관계 | 용도 (기존 규칙) |
|---|---|---|---|---|
|`expoOut` | `1 - 2^(-10t)` | `"expo.out"`| 완전 일치 | **기본 메인 easing**. 카드 rise-in, 패널 등장, Terminal fade, focus overlay |`overshoot` | easeOutBack，c1=1.70158 | `"back.out"`(기본값 1.70158) 또는`"back.out(1.7)"`| 완전 일치 | Toggle 전환, 버튼 팝업, 상호작용 강조 |
|`spring` | easeOutElastic, 주기 2π/3 | 
`"elastic.out(1, 0.3)"`(즉, 기본값`"elastic.out"`） | 완전 일치 | 기하체 복귀, 물리적 안착, UI 바운스 |
|`easeIn` | `t²` | `"power1.in"`| 완전 일치 | 등장, Anticipation 예비 동작 |`easeOut` | `1-(1-t)²` | `"power1.out"`| 완전 일치 | 보조 요소의 가벼운 모션(설명 문구 fade 등) |
| `easeInOut` | quad inOut | `"power1.inOut"`| 완전 일치 | 지속적 움직임(마우스 궤적 보간 등 대칭 운동) |
|`linear` | `t` | `"none"`| 완전 일치 | 프록시 구동 / 카메라 등속 운동 전용. **엘리먼트 모션에는 사용 금지** |`anticipation`| 분절 곡선, 먼저 -0.3까지 내려갔다가 다시 올라옴 | 내장된 등가 기능 없음, ease 함수 사용(하단 참조) |  | 예비 동작이 포함된 등장 |

### 1.1 anticipation · ease 함수

GSAP는 임의의`(p) => number`ease로서, 자체 개발된 정의를 있는 그대로 가져오면 됩니다:```js
// animations.jsx의 Easing.anticipation과 점별로 일치
const anticipation = (t) => {
  if (t < 0.2) return -0.3 * (t / 0.2) * (t / 0.2);   // 초반 20%：반대 방향으로 하강
  const a = (t - 0.2) / 0.8;
  return -0.012 + 1.012 * a * a * (3 - 2 * a);         // 후반 80%：smoothstep로 회복
};

tl.fromTo("#card", { y: 40 }, { y: 0, duration: 0.7, ease: anticipation }, "s2");
```
주의: 이 곡선은 0을 넘어설 수 있으므로(음수 영역), **transform(y / scale / rotation)에만 사용해야 하며** opacity나 색상에는 사용하지 마세요(유효 범위를 벗어날 수 있음).

### 1.2 spring의 또 다른 옵션 · 베이크드 스프링(seek-safe 리얼 피직스)`"elastic.out(1, 0.3)"`자체 개발한 spring의 정확한 등가물이며, 그대로 사용해도 문제없습니다.
당신이 **조절 가능한 댐핑(damping)**이 적용된 리얼한 스프링 질감(예: '오버슈트가 거의 없이 안착하지만 꼬리가 긴 느낌')을 원할 때, hyperframes-animation에서 제공하는`springEase` 폐형식 해(`adapters/gsap-easing-and-stagger.md`40줄의 전체 구현이 포함되어 있으며, 폐쇄형 해는 시간에 대한 순수 함수입니다(seek-safe):```js
// dampingFraction 1.0 = 오버슈트 없는 안정적인 정지; 0.6-0.7 ≈ 자체 제작 spring의 바운스감
const settle = springEase({ response: 0.4, dampingFraction: 0.65 });
tl.fromTo("#hero", { scale: 0 }, { scale: 1,
  duration: settle.duration, ease: settle.ease }, \"s4\");   // duration은 반드시 함께 사용해야 합니다. 이는 물리의 일부입니다
```
**금지**: 어떠한 실시간 스프링 라이브러리(react-spring 등 적분기) 도입도 금지합니다. 상태가 프레임별로 누적되어 확정적인 탐색(seek)이 불가능합니다.

---

## 2 · 5단계 서사 골격 · Slow-Fast-Boom-Stop(15/15/40/20/10%)

이유: 균일한 템포의 애니메이션은 기술 시연에 불과하지만, 리듬감 있는 애니메이션이야말로 서사입니다(best-practices §1).

label이 포함된 timeline 골격 템플릿, 수정`D` 임의의 총 길이에 맞춰 조정할 수 있습니다:```js
const D = 15;   // 총 지속 시간（초），합성 루트의 data-duration과 일치
const at = (p) => D * p;

const tl = gsap.timeline({
  paused: true,
  defaults: { ease: "expo.out", duration: 0.6 },
});

// ── 다섯 단계 label，비율 15 / 15 / 40 / 20 / 10 ──────────────────
tl.addLabel("s1_trigger",  at(0));     // 느림 · 트리거：사람이 반응할 시간을 주어 현실감을 형성한다
tl.addLabel("s2_generate", at(0.15));  // 중간 · 생성：시각적으로 인상적인 포인트가 등장한다
tl.addLabel("s3_process",  at(0.30));  // 빠름 · 과정：제어 가능성/밀도/세부를 보여준다
tl.addLabel("s4_boom",     at(0.70));  // Boom · 폭발：줌아웃/3D pop-out/다중 패널 등장
tl.addLabel("s5_hold",     at(0.90));  // 정적 · 하강 폭：로고 형태 변형 + 돌연한 정지

// ── S1 촉발（템포 느림：단일 동작 + 많은 여백）─────────────────────
tl.fromTo("#terminal", { y: 48, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.8 }, "s1_trigger+=0.1");

// ── S2 생성（하나의 명확한 임팩트 포인트, 동작을 쌓지 않음）─────────────────────
tl.fromTo("#result-panel", { scale: 0.92, autoAlpha: 0 },
  { scale: 1, autoAlpha: 1, duration: 0.7 }, "s2_generate");

// ── S3 과정(밀도 최고: stagger, typewriter, focus 전환이 모두 여기에 있음)──
tl.fromTo(".row", { y: 10, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.4, stagger: 0.03 }, "s3_process");

// ── S4 폭발(카메라 수준 동작: 줌 아웃 / rotationX / 여러 요소 등장)───────
tl.to("#stage", { scale: 0.82, rotationX: 8, duration: 1.2,
  ease: "expo.inOut" }, "s4_boom");

// ── S5 감쇠(로고 변형 수렴, 참조 §3.6; 그 뒤엔 아무것도 일어나지 않음)────────
// 마지막 약 0.5s는 의도적 정지 hold: 어떤 tween도 추가하지 않으며, 결코 fade to black하지 않음

window.__timelines["main"] = tl;
```
주요 사항:

- **S5 이후 여백**:`data-duration`- 마지막까지 덮지만, timeline에 tween이 없으며, 화면이 최종 프레임에 유지됩니다. 이것이 「갑작스러운 중단」의 구현 방식입니다(fade out 마무리 금지).
- 22초 5-scene 템플릿(cinematic-patterns Pattern B) 구조 동일: 비율을 Invoke 3-4s / Process 5-6s / Insight 4-5s / Output 3-4s / Hero 4-5s로 변경, label도 동일한 방식 적용.
- scene 간의 전체 화면 전환은 autoAlpha 중첩 + 위치 이동(이동)을 사용하며, display 전환은 사용하지 않음(`display`/ 기본`visibility`은(는) 렌더러 금지 구역이며, show/hide는 일체`autoAlpha`)

---

## 3 · 모션 언어 8개 원칙 · 개별 번역

### 3.1 배경색에 순수 블랙/화이트를 사용하지 않음

타임라인 외 규칙: 배경색은 정적 CSS이며, 색온도가 있는 중성색을 사용합니다. 구체적인 색상 값은 브랜드 spec을 따릅니다.
유일한 GSAP 관련 사항: scene 간에 배경색을 변경해야 할 때 tween을 사용합니다.`backgroundColor`(허용 목록 내에 있음), 두 scene의 배경색은 동일한 색상 계열이어야 하며(cinematic-patterns §2의 색상 일치 제약 조건):```js
tl.to("#stage", { backgroundColor: "#F4EFE6", duration: 0.8, ease: "sine.inOut" }, "s4_boom");
```
### 3.2 Easing은 절대 linear가 아닙니다

이유:`linear`디지털 요소를 기계처럼,`expoOut`물리적인 무게감 부여(best-practices §2).

구현: timeline`defaults`작성`ease: "expo.out"`(§0 템플릿 참조),
개별 tween은 §1 매핑 테이블에 따라 덮어씁니다.`ease: "none"`다음 두 곳에서만 허용됩니다:
proxy 기반 tween(§7) 및 의도적인 기계적 운동(카메라 등속 pan).

### 3.3 Slow-Fast-Boom-Stop

§2 스켈레톤(Skeleton) 참조, 중복 생략.

### 3.4 ‘마법 같은 결과’가 아닌 ‘과정’을 보여주기

이유: 제품은 마술사가 아닌 협업자입니다. tweak / 오류 수정 / redline을 노출하여 ‘원클릭 마법’ 식의 AI slop(best-practices §3.4)을 지양합니다.

가장 자주 사용되는 두 가지 ‘과정감’ 레시피:

**Chunk Reveal(토큰 스트리밍 출력 시뮬레이션)**. 원래 레시피는`setTimeout + Math.random`,
둘 다 seek 렌더링 시 유효하지 않습니다. 「사전 계산된 타임테이블 + proxy 구동」으로 구현하면 양방향 seek가 안전합니다:```js
// 왜 tl.call()를 사용하지 않는가: 콜백은 되돌릴 수 없으며, preview에서 뒤로 드래그하면 상태가 남습니다
const rand = mulberry32(42);                              // 시드 기반 난수, §7.4 참조
const text = "당신을 위해 세 가지 후보안을 생성했습니다. 첫 번째가 가장 급진적입니다.";
const chunks = text.split(/(?=[，。、；])|(?<=[，。、；])/); // 중국어를 문장 부호로 분할 chunk
const times = []; let acc = 0;
chunks.forEach(() => { acc += 0.04 + rand() * 0.08; times.push(acc); }); // 불규칙적 40-120ms

const tw = { t: 0 };
tl.to(tw, {
  t: acc, duration: acc, ease: "none",
  onUpdate: () => {   // 매 프레임 t로부터 전체 가시 텍스트를 재계산：순수 함수, 되감기도 올바르게 작동함
    let n = 0;
    while (n < times.length && times[n] <= tw.t) n++;
    document.querySelector("#stream").textContent = chunks.slice(0, n).join("");
  },
}, "s2_generate+=0.3");
```
**숫자 카운터(실제 데이터 증가 노출)**:```js
// snap은 정수를 보장한다; innerText는 HyperFrames에서 인식하는 counter 문법이다
tl.fromTo("#metric", { innerText: 0 },
  { innerText: 237, snap: { innerText: 1 }, duration: 1.2, ease: "expo.out" }, "s3_process");
```
천분위 / 접미사 포맷팅 시 proxy + onUpdate 사용으로 변경 (`tw.v`도출`toLocaleString`), 방식은 위와 같습니다.

### 3.5 마우스 궤적 · 곡선 + 손떨림

이유: 직선 보간된 마우스는 무의식적인 기계감이 느껴지지만, 실제 사람은 「가속, 곡선, 감속 수정」 과정을 거칩니다
(best-practices §3.5).

베지에 곡선은 일반적인 속성 tween으로 표현할 수 없으므로 proxy를 사용하여 구동합니다. 손떨림은 Perlin
(기존 구현은 런타임 노이즈에 의존함)을 사용하지 않고, 통약 불가능한 두 주파수의 사인파를 중첩하여 결정론적으로 동등하게 구현합니다:```js
const mouse = { p: 0 };
const P0 = [100, 100];                       // 시작점
const P2 = [tx, ty];                          // 종점（클릭 대상）
const P1 = [tx - 200, ty + 80];               // 제어점：중간점에서 벗어나，곡선을 만듭니다

tl.to(mouse, {
  p: 1, duration: 1.1, ease: \"power1.inOut\",  // 대칭 easing：출발 시 가속 + 도달 시 감속
  onUpdate: () => {
    const t = mouse.p;
    let x = (1-t)*(1-t)*P0[0] + 2*(1-t)*t*P1[0] + t*t*P2[0];
    let y = (1-t)*(1-t)*P0[1] + 2*(1-t)*t*P1[1] + t*t*P2[1];
    x += Math.sin(t * 47.13) * 2 * (1 - t);   // ±2px 손떨림，목표에 가까워질수록 수렴
    y += Math.sin(t * 33.7 + 1.3) * 2 * (1 - t);
    gsap.set(\"#cursor\", { x, y });            // 모든 것이 p에서 유도됨，seek-safe
  },
}, "s1_trigger+=0.5");

// 클릭 피드백: Anticipation 축소 후 반동
tl.to("#cursor", { scale: 0.85, duration: 0.08, ease: "power1.in" }, ">");
tl.to("#cursor", { scale: 1, duration: 0.25, ease: "back.out" }, ">");
```
### 3.6 Logo 모핑 (Morph)

이유: 로고 페이드 인은 서사적 완결성이 부족하므로, 이전 시각적 요소가 '수축'된 후 다시 로고로 '팽창'하도록 하여 서사가 브랜드 포인트에서 수렴되게 해야 합니다 (best-practices §3.6).

blur는 CSS 변수를 사용하며 (`filter`paint-only, seek-safe이며, 공식 depth-of-field-blur rule에서 인정하는 방식입니다):```css
#lastVisual, #logo { --blur: 0px; filter: blur(var(--blur)); will-change: filter; }
```

```js
tl.addLabel("morph", "s5_hold-=0.3");

// 붕괴: 이전 시각 요소가 색 블록으로 축소되고, motion blur가 생긴다
tl.to("#lastVisual", { scale: 0.1, "--blur": "6px",
  duration: 0.5, ease: "expo.out" }, "morph");

// 팽창: Logo가 색 블록 중심에서 튀어나오고, blur가 선명해진다
tl.fromTo("#logo",
  { scale: 0.1, "--blur": "6px", autoAlpha: 0 },
  { scale: 1, "--blur": "0px", autoAlpha: 1, duration: 0.6, ease: "back.out" },
  \"morph+=0.35\");                              // 150ms 정도의 겹침 = 빠른 컷

tl.to("#lastVisual", { autoAlpha: 0, duration: 0.15 }, "morph+=0.5");
// 이후: hold, tween 없음, 갑자기 멈춤
```
### 3.7 세리프 + 산세리프 듀얼 폰트

비 timeline 규칙: 정적 CSS, 폰트 선택은 브랜드 spec을 따름.
HyperFrames 컴파일러가 자동으로 Google Fonts를 긁어와 결정론적 @font-face를 주입함
(Phase 0 실측 결과, 자체 개발 파이프라인의 폰트 타이밍 이슈는 새 백엔드에서 존재하지 않음), CSS에서 정상적으로 Google Fonts를 참조하면 됨.

### 3.8 포커스 전환 = 배경 약화 + 전경 샤프닝 + Flash 가이드

이유: opacity만 낮출 경우 비포커스 요소가 여전히 날카롭게 보이므로, blur를 추가해야만 실제로 배경으로 물러남
(best-practices §3.8).

filter 3종 세트 모두 CSS 변수를 사용하며, GSAP은 변수 자체를 트윈(tween)함:```css
.tile {
  --f: 0;   /* focusIntensity 0→1 */
  filter: brightness(calc(1 - 0.5 * var(--f)))
          saturate(calc(1 - 0.3 * var(--f)))
          blur(calc(var(--f) * 4px));          /* ← 핵심: blur는 포커스가 아닌 요소를 실제로 뒤로 물러나게 함 */
  will-change: filter;
}
```

```js
tl.addLabel("focus", "s3_process+=1.5");

// 포커스가 아닌 요소: 세 가지 필터 + dim을 한 번의 tween으로 완료
tl.to(".tile:not(.focus-target)", {
  "--f": 1, opacity: 0.4, duration: 0.5, ease: "expo.out",
}, "focus");

// Flash highlight 시선의 재유입을 유도함.
// 주의：원래 레시피는 element.animate()（WAAPI），그건 벽시계 기반이라 seek 시 불확실하므로 반드시 tween으로 바꿔야 한다
tl.fromTo("#focusFlash",
  { backgroundColor: "rgba(255,255,255,0.3)" },
  { backgroundColor: "rgba(255,255,255,0)", duration: 0.15, ease: "power1.out" },
  "focus+=0.5");

// 포커스 해제：settle sharp。다음 scene에 넘기기 전에 반드시 blur를 0으로 되돌려야 한다，
// 반쯤 블러된 상태로 멈춰 있으면 관객이「렌더링에 버그가 생겼다」로 읽는다
tl.to(".tile", { "--f": 0, opacity: 1, duration: 0.5, ease: "power2.inOut" }, "focus+=2.5");
```
성능 제약(공식 DoF rule 기준): 대면적 요소의 blur 반경 ≤24px; blur를 최대치로 설정하는 대신 「dim + 적절한 blur」를 우선 권장;`will-change: filter`실제로 blur가 움직이는 요소에만 추가하세요.

---

## 4 · 구체적인 모션 기법 · §4 코드 스니펫의 GSAP 버전

### 4.1 FLIP / Shared Element (버튼이 입력창으로 팽창)

이유: 동일한 요소가 두 상태 사이를 전환하며, 두 요소 간의 cross-fade가 아님 (best-practices §4.1).

원래 레시피는 Framer Motion layoutId를 사용하며, GSAP 측에서는 Flip 플러그인을 도입하지 않고 (HyperFrames 환경에서 검증되지 않음),
직접 수동 계산: 합성된 뷰포트가 고정되어 있고 (data-width/height), 두 상태의 기하학적 수치는 모두 디자인 가이드의 상수이므로,
fromTo로 하드코딩하면 됩니다. 이동과 스케일은 모두 transform을 사용하며, 요소는 최종 레이아웃 위치를 유지합니다:```css
/* 요소는 '최종 상태'로 레이아웃되며, 초기 상태는 transform으로 표현된다 */
#search-box { width: 560px; height: 56px; }   /* 정적 최종 상태, 크기를 tween하지 않음 */
```

```js
// 초기 기하: 버튼 120x44가 (400, 300)에 있고, 최종 입력창 560x56이 (200, 300)에 있음
tl.fromTo("#search-box",
  { x: 200, y: 0, scaleX: 120/560, scaleY: 44/56, transformOrigin: "left top" },
  { x: 0,   y: 0, scaleX: 1, scaleY: 1, duration: 0.6, ease: "expo.out" },
  "s2_generate");
// 내부 텍스트는 역보정을 하거나 진입을 늦춰 scaleX에 의해 늘어나는 것을 피한다（§4.2의 처리와 동일）
tl.fromTo("#search-box .placeholder", { autoAlpha: 0 },
  { autoAlpha: 1, duration: 0.3 }, "s2_generate+=0.4");
```
### 4.2 호흡식 확장 (선 확장, 후 전개)

이유: 패널의 width와 height를 동시에 조절하기보다, 먼저 가로로 확장한 뒤 세로로 펼쳐야 물리 세계의 움직임처럼 자연스럽습니다 (best-practices §4.2).

기존 방식은 width/height를 직접 tweening 하지만, 이는 HyperFrames에서 reflow 금지 구역입니다 (정수 픽셀 snap으로 인해 느린 구간에서 육안으로 확인 가능한 떨림 발생, §7.2). 이를 scaleX/scaleY로 변환하며, 타이밍 오프셋은 그대로 유지합니다:```js
// L = 펼쳐지는 전체 지속시간; 앞 40%는 가로로 당기고, 30% 지점에서 세로로 벌리기 시작하며, 두 구간이 겹침
const L = 0.9;
tl.fromTo("#panel",
  { scaleX: 0, scaleY: 0.12, transformOrigin: "left top" },
  { scaleX: 1, duration: 0.4 * L, ease: "expo.out" }, "open");
tl.to("#panel", { scaleY: 1, duration: 0.7 * L, ease: "expo.out" }, "open+=" + 0.3 * L);

// 내용은 껍데기 펼쳐짐이 완료된 후에만 나타남: 이는 '먼저 펼친 다음 채워넣기'라는 이미지에 부합하며,
// 또한 scale 과정에서 내용이 늘어나며 변형되는 모습이 보이지 않게 함
tl.fromTo("#panel .content", { autoAlpha: 0, y: 8 },
  { autoAlpha: 1, y: 0, duration: 0.35 }, "open+=" + 0.75 * L);
```
주의: scale 버전은 픽셀 단위로 정확하지 않습니다(비율에 따라 둥근 모서리와 테두리가 변형됨). 확장 셸이 단색이거나 큰 라운드 패널일 때는 눈에 띄지 않으나, 패널 테두리의 디테일이 중요하다면 '셸 고정 + 콘텐츠 clip-path 리빌(reveal)' 방식을 사용하고 실제 프레임 캡처를 확인하세요.

### 4.3 Staggered Fade-up（30ms stagger）

이유: 리스트가 하나씩 등장하는 것이 통째로 나타나는 것보다 더 '물체감'이 느껴지며, 30ms는 정해진 간격입니다(best-practices §4.3).```js
tl.fromTo(".row",
  { y: 10, autoAlpha: 0 },
  { y: 0, autoAlpha: 1, duration: 0.4, ease: "expo.out", stagger: 0.03 },
  "s3_process");

// 변형: 중앙에서 양쪽으로 솟아오름 (S4 폭발의 다중 패널 등장에 자주 사용됨)
tl.fromTo(".panel",
  { y: 24, autoAlpha: 0, scale: 0.96 },
  { y: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: "expo.out",
    stagger: { each: 0.03, from: "center" } },
  "s4_boom");
```
사용`fromTo`필요 없음`from`：sub-composition은 반복적으로 re-seek되며,`from`등록 시점에
시작 상태 스냅샷, 드래그백 시 어긋날 수 있음;`fromTo`양 끝을 명시적으로 선언하여 항상 일관성을 유지합니다.

### 4.4 주요 결과 직전 0.5초 정지

이유: 기계는 빠르고 연속적으로 실행되지만 사람의 뇌는 반응 시간이 필요합니다. 주요 결과 직전에 0.5초 동안 멈추는 것은 관객을 배려하는 것입니다
(best-practices §4.4, §0.2 핵심 신념 제3조).

GSAP에서 '정지'는 position 파라미터 상의 빈 공간입니다. label을 사용하여 이 멈춤을 명시적인 디자인 결정으로 작성하세요:```js
// 생성 완료 시점
tl.addLabel("generated", "s2_generate+=1.2");
// loading 상태가 0.5s 동안 멈춤: 이 0.5초 동안 어떤 tween도 없으며, 관객은 로딩 상태를 응시함
tl.addLabel("reveal", "generated+=0.5");

tl.fromTo("#result", { scale: 0.94, autoAlpha: 0 },
  { scale: 1, autoAlpha: 1, duration: 0.7, ease: "expo.out" }, "reveal");
```
### 4.5 Anticipation → Action → Follow-through

이유: Action만 있는 애니메이션은 PowerPoint 애니메이션에 불과하며, Disney의 3단계 방식은 동작에 생동감을 부여합니다
(best-practices §4.6).

3단계 순서 tween, easing은 §1에 따라 매핑됩니다 (예비 power1.in, 실행 expo.out, 반동 elastic):```js
tl.addLabel("pop", "s2_generate+=0.2");
tl.to("#card", { scale: 0.95, duration: 0.12, ease: "power1.in"  }, "pop");        // 준비
tl.to("#card", { scale: 1.05, duration: 0.30, ease: "expo.out"   }, ">");          // 능동
tl.to("#card", { scale: 1.00, duration: 0.35, ease: "elastic.out(1, 0.3)" }, ">"); // 바운스
```
단일 tween 버전:`ease: anticipation`(§1.1) '준비 + 실행'을 한 번에 완료하고, 리바운드를 위해 한 구간을 더 추가합니다.

### 4.6 3D Perspective + translateZ 레이어링

Why: rotateX 8° / rotateY -4°는 데스크탑 왼쪽 상단에서 내려다보는 렌즈의 natural angle을 시뮬레이션합니다
(best-practices §4.7).

원근감(Perspective)과 레이어링은 정적 CSS입니다(기존 레시피를 그대로 따르며, perspective / translateZ는 수정할 필요가 없습니다).
움직이는 부분(진입 시 세워지기, S4 멀어지기)은 GSAP의 3D transform 별칭(alias)을 사용합니다:```css
.stage-wrap { perspective: 2400px; perspective-origin: 50% 30%; }
.card-grid  { transform-style: preserve-3d; }
.card:nth-child(3n) { transform: translateZ(30px); }
.card:nth-child(5n) { transform: translateZ(-20px); }
.card:nth-child(7n) { transform: translateZ(60px); }
```

```js
// 등장：정면에서 천천히 황금 각도로 선다
tl.fromTo("#card-grid", { rotationX: 0, rotationY: 0 },
  { rotationX: 8, rotationY: -4, duration: 1.4, ease: "expo.out" }, "s2_generate");
```
### 4.7 대각선 팬(Diagonal Pan) · XY 동시 이동, 주파수 상이

이유: X와 Y에 서로 다른 주파수를 사용하여 리사주(Lissajous) 궤적의 정형화를 방지하고, 핸드헬드 카메라의 대각선 드리프트를 시뮬레이션하기 위함입니다 (best-practices §4.8).

기존 레시피는`Math.sin(flowT * ...)`프레임 단위로 계산하며, GSAP 버전은 서로 다른 duration의 yoyo tween 두 개를 중첩합니다(GSAP은 x / y를 독립적으로 추적하므로 두 tween이 충돌하지 않습니다). repeat은 반드시 유한해야 합니다:```js
// 주기가 다름（4.6s vs 2.9s）= 주파수가 다름，경로가 닫히지 않음
// repeat 수는 보이는 지속시간으로 계산：Math.ceil(D / dur)로 전체를 덮도록 보장
tl.to("#stage", { x: 40, duration: 4.6, ease: "sine.inOut",
  yoyo: true, repeat: Math.ceil(D / 4.6) }, 0);
tl.to("#stage", { y: 30, duration: 2.9, ease: "sine.inOut",
  yoyo: true, repeat: Math.ceil(D / 2.9) }, 0);
```
### 4.8 절도 있는 마무리

이유: fade out은 결단력이 느껴지지 않으며, 마지막 프레임은 명확하고 단호해야 합니다(best-practices §0.3 여백).

구현상으로는 「코드를 작성하지 않는 것」입니다. S5의 Logo가 자리를 잡은 뒤, timeline에는 더 이상 어떠한 tween도 없어야 하며,`data-duration`마지막 tween의 종료 시점보다 0.5-1s 더 길게 설정하여 화면을 최종 상태로 유지(hold)합니다.
만약 BGM이 있는 경우, volume tween을 사용하여 끝부분에서 사운드를 마무리합니다(volume은 허용 목록 내에 포함):```js
tl.to("#bgm", { volume: 0, duration: 0.4 }, "s5_hold+=0.8");  // 오디오를 즉시 중단하고, 화면은 움직이지 않음
```
---

## 5 · 씬 레시피 A/B/C · 타임라인 구조 요점

디자인 판단(유형 선택, SFX 밀도, BGM 스타일)은 best-practices §5를 참조하세요. 여기서는 타임라인 측면의 차이점만 다룹니다.

### 레시피 A · Apple Keynote 드라마틱 스타일

- 골격: §2 5단계 구조 그대로, S4의 Boom을 충분히 구현
- defaults：`ease: "expo.out"`, 인터랙션 지점의 커버리지를 강조`"back.out"`- S4 시그니처 모션: 카메라 급격한 줌 아웃 + drop.`tl.to("#stage", { scale: 0.78, y: -40, duration: 1.1, ease: "expo.inOut" }, "s4_boom")`- S5: Logo Morph(§3.6) + 에테리얼한 단음 + hold

### 레시피 B · 원테이크 툴 형식

- 구조: 5단계 피크 구조를 **사용하지 않고**, 하나의 지속적인 flow. label은 BGM 마디에 맞춰 표시:`tl.addLabel("bar1", 0); tl.addLabel("bar2", 60/88*4);`(88 BPM, 1마디 ≈ 2.73s)
- 주요 UI 동작의 position 파라미터를 kick/snare 시점에 직접 배치, 음악의 리듬이 곧 인터랙션 효과음
- easing:`springEase`（§1.2）+ `"expo.out"`, 폭발감보다는 안착감이 더 느껴짐
- S4 스타일의 Boom이 없으며, 마무리 역시 깔끔하게 멈춤

### 레시피 C · 업무 효율 내러티브 스타일

- 골격: 다중 scene 하드 컷. 각 scene마다 하나의 label, scene 간 autoAlpha 빠른 전환(0.15s)
  긴 오버랩 대신 Dolly In/Out과 조합:`tl.fromTo("#scene2", { scale: 1.06 }, { scale: 1, duration: 1.2, ease: "expo.out" }, "sc2")`- toggle 유형의 인터랙션은 일괄적으로`"back.out"`, 패널은 모두`"expo.out"`- 영상 전체에 반드시 하나의 하이라이트가 있어야 함: 3D pop-out(§4.6의 rotationX + translateZ 요소 플로팅), 단 한 번만 수행할 것. 도처에 기술을 뽐내는 것은 저렴한 신호임(§0.3 절제).

---

## 6 · seek 안전 규칙(Phase 0 실측, 모든 사례 경험)

HyperFrames 렌더링은 프레임별 seek + 스크린샷 방식임. 「시간의 순수 함수」가 아닌 모든 상태는 렌더링 시 불확실한 결과를 초래하며, **preview에서는 대개 정상으로 보이지만** 최종 렌더링 결과물에서만 문제가 드러남.

### 6.1 CSS transition + class 전환 금지 · 반드시 tween으로 표현

CSS transition은 타임라인이 아닌 브라우저 월 클락(wall clock)을 따름. 프레임별 seek 시 매 프레임이 「상태 돌연변이」가 되어, transition이 트리거되지 않거나 시작점이 어긋남. Phase 0에서 c3로 마이그레이션할 때 실제로 겪었던 문제임.```css
/* ✗ 구식 작성법：JS에서 classList.add('lit')로 transition에 의존해 전환 */
.capsule { transition: transform 0.3s ease; }
.capsule.lit { transform: scale(1.06); }
```

```js
// ✓ 새 문법: 상태 변화 자체가 timeline 위의 한 구간(tween)
tl.to("#capsule", { scale: 1.06, duration: 0.3, ease: "expo.out" }, "lit_at");
tl.to("#capsule", { scale: 1.0,  duration: 0.3, ease: "expo.out" }, "lit_at+=1.2");
```
동일 유형 금지 구역:`element.animate()`(WAAPI, 마찬가지로 실시간(Wall Clock) 기준, §3.8의 Flash는 이미 번역됨), CSS`@keyframes`animation은 주요 애니메이션 렌더링에 사용됩니다.
배포 전 최종 확인:`grep -n "transition:\|animation:\|\.animate(" index.html`### 6.2 reflow를 유발하는 animate 속성 금지 · transform으로 대체

layout 속성은 브라우저 layout 단계에서 정수 기기 픽셀로 스냅(snap)됩니다. 빠른 tween은 티가 나지 않지만,
느린 ease-out의 끝부분에서 프레임당 이동 거리가 1px 미만이면, '몇 프레임 멈췄다가 1px 점프하는' 현상이 발생하여 육안으로 확인 가능한 떨림이 나타납니다.
Phase 0의 lint가 즉시 포착한 letterSpacing의 프레임별 떨림이 바로 이러한 경고 없는 시각적 버그의 사례입니다.

| ✗ tween 금지 | ✓ 충실한 대체 |
|---|---|
|`width` / `height` | `scaleX` / `scaleY` + `transformOrigin`(콘텐츠 처리는 §4.2 참조) |`top` / `left` / `right` / `bottom`| 요소가 CSS 최종 상태 위치에 멈춤, tween|`x` / `y` 오프셋 |
|`fontSize` | `scale`(시각적 동등성, sub-pixel 스무딩) |`letterSpacing` / `wordSpacing` | 글자별로 split 한 후 각 문자를 tween 하는 `x`(uniform scale은 동일한 효과가 아니며, 자간이 아닌 글자 모양을 조절합니다) |`margin*` / `padding*` | 레이아웃 고정, 동적 
`x` / `y`|

수정 원칙: **동일한 비주얼을 재현하되, 지터(jitter)만 제거할 것**. lint 통과가 기준이 아니며, 원본 애니메이션과 프레임 단위로 대조하는 것이 기준입니다.

### 6.3 t=0일 때 onUpdate 미발생 · 프록시 tween은 반드시 수동으로 첫 프레임을 보정해야 함

timeline을 0으로 seek할 때 프록시 tween의`onUpdate`트리거되지 않을 수 있으며, 첫 프레임이 빈 화면 / 초기 DOM일 수 있습니다.
모든 proxy 구동 시나리오(§3.4 chunk reveal, §3.5 마우스, §7 기존 데모 어댑터)에서,
timeline 등록 후 수동으로 한 번 호출합니다:```js
window.__timelines["main"] = tl;
render(0);   // 첫 프레임 보험: t=0의 화면을 명시적으로 그려냄
```
### 6.4 Math.random / Date.now 금지 · 시드 함수를 사용한 랜덤

동일한 프레임은 매번 seek 할 때마다 반드시 동일한 화면이 나와야 합니다. 런타임 랜덤 = 렌더링할 때마다 달라짐 = 프레임별 렌더링 불가.
'랜덤한 느낌'(파티클, 흔들림, 불규칙한 간격)이 필요할 때는 mulberry32를 사용하며, **타임라인을 생성하기 전**에 모든 랜덤 값을 한 번에 생성합니다(Phase 0의 3D 파티클 데모 실제 구현 방식):```js
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260717);   // 시드를 고정함 — 시드를 바꾸면 랜덤 버전이 바뀝니다

// 사용법: 미리 생성, onUpdate 안에서 즉석으로 뽑지 않음
const offsets = Array.from({ length: 40 }, () => (rand() - 0.5) * 24);
```
마찬가지로 비활성화:`Date.now()`、`performance.now()`、모든 이벤트 기반 상태(렌더링 모드에는 입력 이벤트가 없음).

---

## 7 · 기존 데모 어댑터 레시피 · render(t)를 GSAP에 연결하기

21개 자체 개발 엔진 기존 데모의 애니메이션 핵심은 모두`render(t)`순수 함수. 마이그레이션 시 애니메이션 로직을 다시 작성하지 않고, 프록시 tween을 사용하여 render(t)를 GSAP timeline에 연결합니다(Phase 0 실측: 단일 데모 20-30분, 애니메이션 코드 수정 없음, c3 시네마틱 데모 1134행 검증 완료).

### 7.1 프록시 tween 템플릿(12행, c3 실측 원본)```js
// =============== HyperFrames adapter ===============
// 프록시 tween이 원래 render(t)를 구동함. 각 프레임은 타임라인 시간의 순수 함수:
// rAF 없음, 시계 없음, 입력 상태 없음.
window.__timelines = window.__timelines || {};
const proxy = { t: 0 };
const tl = gsap.timeline({ paused: true });
tl.to(proxy, {
  t: T.DURATION,            // 예전 데모의 총 길이 상수
  duration: T.DURATION,
  ease: "none",             // 시간은 반드시 균일한 속도로 매핑되어야 하며，easing은 render(t) 내부에서 처리된다
  onUpdate: () => render(proxy.t),
}, 0);
window.__timelines["main"] = tl;

// 첫 프레임 보험 (timeline이 t=0에 멈춰 있을 때 onUpdate가 호출되지 않음, §6.3)
render(0);
```
### 7.2 마이그레이션 4단계

1. **root / clip 래핑**: 최외곽 컨테이너에 합성 루트 속성 추가
   (`data-composition-id="main"` + `data-duration` + 크기),
   무대 요소 추가`.clip` 및`data-start` / `data-duration` / `data-track-index`.
   전체 계약은 다음을 참조하십시오:`hyperframes-backend.md`2. **자체 구동 제거**: rAF 루프 제거,`setInterval`, 자동 play 로직,`performance.now()`시작점.`render(t)``t` 파라미터만 사용하며, 더 이상 직접 시간을 조회하지 않음
3. **프록시 설정**: §7.1 템플릿 붙여넣기,`T.DURATION`상단 정렬`data-duration`, 끝에`render(0)`4. **스윕 transition**:`grep -n "transition:\|animation:\|\.animate(\|Math.random\|Date.now\|performance.now"`항목별로 하나씩 해결하십시오. class 전환 효과는 §6.1에 따라 t의 순수 함수로 변경하십시오 (이전 데모에서 가장 흔히 남은 형태는 「classList.add + transition」 조합입니다).

마이그레이션 완료 후 한 번 실행하십시오.`npx hyperframes check`（다크 cinematic 용  `--no-contrast`, 나머지 4개 항목은 반드시 0 error여야 함), 그 후 3~4개의 핵심 모먼트 프레임 스크린샷을 찍어 이전 버전과 비교합니다.

### 7.3 어댑터를 사용하지 않는 경우

어댑터는 **기존 자산 마이그레이션(기존 자산 이전)** 솔루션입니다. 새로 작성하는 애니메이션은 본 문서 §0-§5의 네이티브 timeline 작성 방식을 직접 사용하세요:
label 가독성, stagger 선언형 방식, GSAP inspector를 통한 tween별 개별 확인이 가능하지만,
proxy라는 거대한 블랙박스 내부의 애니메이션은 감사(audit) 도구에 불투명합니다.

---

## 8 · 인도 전 자가 점검 (GSAP 측, best-practices §7 리스트 보완)

- [ ] timeline`paused: true`, 등록 key는`data-composition-id`?
- [ ] defaults는`expo.out`, 노출 없음`linear` / `ease`요소 모션에 나타납니까?
- [ ] 5단계 라벨이 모두 포함되어 있으며, S5 이후에 hold 여백이 있습니까(fade out 없음)?
- [ ]`grep "transition:\|\.animate(\|Math.random\|Date.now"` 결과가 0인가요?
- [ ] width / height / top / left / letterSpacing / fontSize 트윈이 없나요?
- [ ] 모든`repeat`유한수인가요?
- [ ] proxy 시나리오 끝에 추가됨`render(0)`？
- [ ] blur / filter 전부 CSS 변수로 처리, blur가 적용된 요소:`will-change: filter`?
- [ ] sub-composition 내 입장에 모두 사용`fromTo`필요 없음`from`？
- [ ] `npx hyperframes check`(다크 모드 시트를 통해`--no-contrast`, 나머지 0 error)?

---

## 9 · Camera Rig 레시피 · 카메라 움직임 구현 레이어

이유: 카메라 움직임과 요소 애니메이션이 동일한 transform을 점유하려고 하는 것이 카메라 워크 혼란의 기술적 근원입니다(camera-language.md §3). 모든 카메라 레벨 tween을 전용 rig 컨테이너로 통합하고, 카메라 상태를 하나의 proxy 객체로 관리하며, 매 프레임마다 이를 통해 모든 카메라 DOM 상태를 도출하여 seek-safe를 보장합니다.

### 9.1 rig 컨테이너 구조 (정적 스켈레톤)```html
<div id="viewport">                <!-- 고정 뷰포트 -->
  <div id="camera">                <!-- 카메라 레이어: 카메라 transform만 -->
    <div id="world">...</div>      <!-- 월드 레이어: 요소 애니메이션은 여기서만 발생 -->
  </div>
  <div id="hud">...</div>          <!-- 자막/뱃지: #camera의 형제로 기본적으로 고정됨 -->
</div>
```

```css
#viewport { position: relative; width: 1920px; height: 1080px; overflow: hidden; }
#camera   { position: absolute; inset: 0; perspective-origin: 960px 540px; }
#world    { position: absolute; transform-origin: 0 0; will-change: transform; }
/* pan 엣지 노출 대비：#world 크기 ≥ 뷰포트 + 최대 pan 진폭 + 8% 마진（camera-language §3.3） */
```
### 9.2 카메라 proxy + PageCam 키프레임 변환

카메라는 일반 객체이며, GSAP이 해당 필드를 트위닝(tween)합니다,`onUpdate`상태를 DOM에 기록합니다.
모든 것은 cam에서 유도되며, 되감기 드래그 시에도 정확하게 작동합니다(§3.4 chunk reveal의 proxy 방식과 동일):```js
const cam = { cx: 960, cy: 540, zoom: 1, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 };
const camEl = document.querySelector("#camera");
const world = document.querySelector("#world");

// ── 평면 모드（순수 zoom + pan，회전 없음）──────────────────────────
function applyCam() {
  world.style.transform =
    `translate(${960 - cam.cx * cam.zoom}px, ${540 - cam.cy * cam.zoom}px) scale(${cam.zoom})`;
  applyCounter();
}

// ── 3D 모드（rotX/rotY/rotZ 있음）· 확대는 CSS zoom 속성을 사용하고，scale은 사용하지 않음 ──
// 레이아웃 수준 확대는 Chromium이 확대된 크기로 래스터화하게 하여，3D에서 글자가 흐려지는 문제를 근본적으로 해결함
// （camera-language §3.4，저장소에서 가장 값진 지식）。zoom이 좌표계를 변경하므로，translate는 zoom으로 나눠야 함。
function applyCam3d() {
  camEl.style.perspective = `${cam.persp * cam.zoom}px`;
  world.style.zoom = cam.zoom;
  world.style.transformOrigin = `${cam.cx}px ${cam.cy}px`;
  world.style.transform =
    `translate(${960 / cam.zoom - cam.cx}px, ${540 / cam.zoom - cam.cy}px)` +
    ` rotateY(${cam.rotY}deg) rotateX(${cam.rotX}deg) rotateZ(${cam.rotZ}deg)`;
  applyCounter();
}
```
참고: CSS`zoom`프레임마다 re-layout을 트리거하는 것은 §6.2 reflow 금지 조항의 **유일한 합법적 예외**이며, 오직 다음의 경우에만 허용됩니다.`#world`카메라 레이어. HyperFrames / Playwright 오프라인 프레임별 렌더링 시 단일 프레임 소요 시간은 결과물에 영향을 주지 않습니다.
실시간 preview 프레임 드랍은 정상적인 현상이며, 렌더링 결과물을 기준으로 합니다.

### 9.3 로그 시간 헬퍼 (고정된 duration은 아마추어 느낌의 원인입니다)```js
// camera-language §4.2：1→2x는 정확히 0.55s이며, 어떤 크기의 zoom도 시각적 속도가 동일함
function zoomDur(z1, z2) {
  return gsap.utils.clamp(0.30, 0.94,
    0.55 * Math.abs(Math.log(z2 / z1)) / Math.LN2);
}
```
### 9.4 샷 시퀀스 작성법 (푸시 인 → hold → 패닝 → 엔딩 풀아웃)

샷 tween은 모두 cam을 구동하며, 이징(easing)은 camera-language §4.1을 따릅니다:
액티브 푸시-풀`power3.inOut`, 팔로잉 `cubic-bezier(0.33,0,0.15,1)`(사용자 정의 ease는 아래를 참고하세요).```js
const followEase = gsap.parseEase("0.33,0,0.15,1");   // shotcraft 카메라 기본값

// 장면 고정 미세 보정：시작 시 즉시 1.06x，3s 동안 서서히 전체 샷으로 복귀（영상 길이 >14s 및 첫 샷 >7s일 때만 적용）
tl.fromTo(cam, { zoom: 1.06 },
  { zoom: 1, duration: 3.0, ease: "power2.out", onUpdate: applyCam }, 0);

// 당겨서 클로즈업：목표 지점 (1240, 430)，1 → 1.8x，지속 시간은 공식에 따름
tl.to(cam, { cx: 1240, cy: 430, zoom: 1.8,
  duration: zoomDur(1, 1.8), ease: "power3.inOut", onUpdate: applyCam },
  "s2_generate");
// 샷이 제자리에 도달한 후 hold ≥1.2s 동안 유지 후 진행（tween을 쓰지 않으면 hold임）

// 중거리 초점 이동：1x로 돌아가지 않고，직접 평행 이동（샷 간 문법：0.22-0.45를 평행 이동으로 변경）
tl.to(cam, { cx: 880, cy: 620,
  duration: 0.7, ease: followEase, onUpdate: applyCam }, "s3_process+=1.5");

// 엔딩：0.55s 풀아웃 + ≥0.8s 와이드샷 정지，data-duration이 정지의 끝까지 적용됨
tl.to(cam, { cx: 960, cy: 540, zoom: 1,
  duration: 0.55, ease: "power3.inOut", onUpdate: applyCam }, "s5_hold");

window.__timelines["main"] = tl;
applyCam();   // 첫 프레임 안전장치：timeline 이 t=0 에 정지해 있을 때 onUpdate 가 호출되지 않음（§6.3）
```
샷 예산은 코드에 작성하지 않고 샷 배치 시 적용합니다: 인접한 샷의 tween 시작점 간격 ≥2.6s, 15초 윈도우 내 ≤4~5개, <1.25x 줌은 배치하지 않음(camera-language §0/§4.4).

### 9.5 counter-transform · 자막/어노테이션을 따라 폰트 크기 일정하게 유지

자막과 chrome은 우선적으로`#hud`(카메라를 따라가지 않음, 비용 제로). World 내에 배치되어 요소를 따라가되 폰트 크기는 일정하게 유지되어야 하는 주석으로, 카메라 줌을 역으로 상쇄합니다:```js
const counters = gsap.utils.toArray(".cam-counter");   // 고정 글자 크기가 필요한 라벨
function applyCounter() {
  const inv = 1 / cam.zoom;
  counters.forEach((el) => { el.style.transform = `scale(${inv})`; });
}
```

`.cam-counter`자체의 등장 애니메이션은 **자식 요소**에 작성하여 counter scale과 transform을 경합하지 않도록 합니다.

### 9.6 다층 패럴랙스(parallax) · 모두 cam에서 유도

각 레이어에 독립적인 tween을 부여하지 않고, 속도 계수에 동일한 카메라 변위를 곱합니다(레이어 간 계수 비율 ≥ 2배, ≤ 4개 레이어, camera-language §8.1). 이는 자연스럽게 동기화되며(natural sync) seek-safe합니다:```js
const LAYERS = [
  { el: document.querySelector("#bg"),  k: 0.35 },
  { el: document.querySelector("#mid"), k: 0.7  },
  { el: document.querySelector("#fg"),  k: 1.4  },
];
function applyParallax() {
  const dx = 960 - cam.cx, dy = 540 - cam.cy;    // 카메라 이동
  LAYERS.forEach(({ el, k }) => {
    el.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  });
}
// applyParallax() 를 applyCam() 의 끝에 추가하면 된다
```
### 9.7 Camera Rig 자가 점검 (§8 체크리스트에 추가)

- [ ] 카메라 tween은 cam proxy만 조작하며,`#world`내부 요소가 카메라 tween의 영향을 받지 않았나요?
- [ ] 타임라인 등록 후 보충함`applyCam()`첫 프레임?
- [ ] 3D 텍스트 클로즈업에 CSS 사용`zoom`, 없음`scale()`확대 시 흐릿함?
- [ ]`zoom`속성은 ~에만 나타납니다`#world`위(reflow 예외 비확산)?
- [ ] 푸시/풀 시간은 전부 다음에서 가져옴`zoomDur()`, 하드코딩된 상수가 없습니까?
- [ ] 커튼콜 연출 후 ≥0.8s 동안 tween이 없는 파노라마 hold가 있습니까?