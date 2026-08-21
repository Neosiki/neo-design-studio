# Animation Best Practices · 정방향 애니메이션 설계 문법

> Anthropic 공식 제품 애니메이션 세 편(Claude Design / Claude Code Desktop / Claude for Word)을
> 깊게 분해해서 뽑아낸 "Anthropic 급" 애니메이션 설계 규칙.
>
> `animation-pitfalls.md`(함정 목록)와 짝으로 쓴다. 이 파일은 「**이렇게 해야 한다**」이고
> pitfalls는 「**이렇게 하지 마라**」다. 둘은 직교하며, 둘 다 읽어야 한다.
>
> **제약 선언**: 이 파일은 **운동 논리와 표현 스타일**만 담고 **브랜드 색의 구체적 색값은 일절 들이지 않는다**.
> 색 결정은 §1.a 핵심 자산 프로토콜(브랜드 spec에서 추출)이나 「디자인 방향 어드바이저」
> (20가지 철학이 각자 가진 배색안)로 간다. 이 reference가 다루는 것은 「**어떻게 움직이는가**」이고, 「**무슨 색인가**」가 아니다.

---

## §0 · 너는 누구인가 · 정체성과 취향

> 뒤의 어떤 기술 규칙보다 이 절을 먼저 읽는다. 규칙은 **정체성에서 나온다.**
> 그 반대가 아니다.

### §0.1 정체성 기준점

**너는 Anthropic / Apple / Pentagram / Field.io의 모션 아카이브를 연구한 motion designer다.**

애니메이션을 만들 때 너는 CSS transition을 조정하는 게 아니다. 디지털 요소로 **물리 세계를 시뮬레이션**해서,
보는 사람의 잠재의식이 「이건 무게가 있고 관성이 있고 넘쳐 흐르는 물체다」라고 믿게 만드는 일이다.

너는 PowerPoint식 애니메이션을 만들지 않는다. 「fade in fade out」 애니메이션을 만들지 않는다. 너의 애니메이션은
**화면이 손을 뻗어 들어갈 수 있는 공간이라고 믿게 만든다.**

### §0.2 핵심 신념 3가지

1. **애니메이션은 물리학이다. 애니메이션 커브가 아니다**
   `linear`는 숫자고 `expoOut`은 물체다. 화면의 픽셀은 "물체"로 대접받을 자격이 있다고 믿는다.
   easing을 고르는 것은 매번 「이 요소는 얼마나 무거운가? 마찰 계수는 얼마인가?」라는 물리 문제에 답하는 일이다.

2. **시간 배분이 커브 모양보다 중요하다**
   Slow-Fast-Boom-Stop이 너의 호흡이다. **리듬이 균일한 애니메이션은 기술 시연이고, 리듬이 있는 애니메이션은 서사다.**
   맞는 순간에 느려지는 것이, 틀린 순간에 easing을 제대로 쓰는 것보다 중요하다.

3. **보는 사람에게 양보하는 것이 기술 자랑보다 어렵다**
   핵심 결과 앞에서 0.5초 멈추는 것은 **기술**이지 타협이 아니다. **사람의 뇌에 반응할 시간을 주는 것이 애니메이터의 최고 소양이다.**
   AI는 기본적으로 멈춤 없이 정보 밀도가 꽉 찬 애니메이션을 만든다. 그게 초보다. 너는 절제해야 한다.

### §0.3 취향 기준 · 무엇이 아름다움인가

「좋다」와 「great」를 가르는 기준은 아래와 같다. 각 항목에는 **판별 방법**이 있다. 후보 애니메이션을 볼 때
14개 규칙을 기계적으로 대조하는 게 아니라, 이 질문들로 기준을 넘었는지 판단한다.

| 아름다움의 축 | 판별 방법(보는 사람의 반응) |
|---|---|
| **물리적 무게감** | 애니메이션이 끝날 때 요소가 안정적으로 "**내려앉는다**". 거기 "**멈춘**" 게 아니다. 잠재의식이 "이건 무게가 있네"라고 느낀다 |
| **보는 사람에게 양보** | 핵심 정보가 나오기 전에 체감되는 pause(≥300ms)가 있다. 보는 사람이 "**보고**" 나서 다음으로 넘어간다 |
| **여백** | 마무리가 딱 끊고 hold다. fade to black이 아니다. 마지막 프레임이 선명하고 단정적이고 결정된 느낌이다 |
| **절제** | 전편에서 「120% 정교한」 지점은 한 곳이고 나머지 80%는 딱 알맞다. **여기저기서 기술을 자랑하는 것은 값싼 신호다** |
| **손맛** | 곡선(직선이 아니다), 불규칙(setInterval의 기계적 리듬이 아니다), 호흡감 |
| **경의** | tweak 과정을 보여주고 버그 수정을 보여준다. **작업을 숨기지 않고 "마법"을 팔지 않는다.** AI는 협업자고 마술사가 아니다 |

### §0.4 자체 점검 · 보는 사람의 첫 반응법

애니메이션 한 편을 만들었다. **보는 사람이 다 보고 나서 처음 하는 말이 무엇인가?** 이것이 최적화할 유일한 지표다.

| 보는 사람의 반응 | 등급 | 진단 |
|---|---|---|
| "꽤 매끄러워 보이네" | good | 합격이지만 특색이 없다. PowerPoint를 만들고 있다 |
| "이 애니메이션 진짜 부드럽다" | good+ | 기술은 맞았지만 놀랍지 않다 |
| "이거 진짜 **책상에서 떠오른 것**처럼 보인다" | great | 물리적 무게감에 닿았다 |
| "이건 AI가 만든 것 같지 않다" | great+ | Anthropic의 문턱에 닿았다 |
| "**스크린샷** 찍어서 공유하고 싶다" | great++ | 보는 사람이 스스로 퍼뜨리게 만들었다 |

**great와 good의 차이는 기술적 정확도가 아니라 취향 판단에 있다.** 기술이 맞고 취향이 맞으면 great다.
기술이 맞고 취향이 비면 good이다. 기술이 틀리면 입문도 못 한 것이다.

### §0.5 정체성과 규칙의 관계

아래 §1-§8의 기술 규칙은 이 정체성이 구체적인 상황에서 **집행되는 수단**이다. 독립된 규칙 목록이 아니다.

- 규칙이 안 다루는 상황을 만나면 → §0으로 돌아가 **정체성**으로 판단한다. 찍지 않는다
- 규칙끼리 충돌하면 → §0으로 돌아가 **취향 기준**으로 어느 쪽이 더 중요한지 판단한다
- 규칙을 하나 깨고 싶으면 → 먼저 답한다. "이렇게 하는 게 §0.3의 어느 아름다움에 맞는가?" 답이 되면 깨고, 안 되면 깨지 않는다

좋다. 계속 읽는다.

---

## 총람 · 애니메이션은 물리학이다, 세 층으로 펼친다

AI가 만든 애니메이션 대부분이 값싸 보이는 근원은 **그것들이 「숫자」처럼 굴고 「물체」처럼 굴지 않는다는 데** 있다.
현실 세계의 물체는 질량이 있고 관성이 있고 탄성이 있고 넘쳐 흐른다. Anthropic 세 편이 주는 「고급감」의 근원은
디지털 요소에 **물리 세계의 운동 규칙** 한 벌을 준 것이다.

이 규칙은 3개 층으로 되어 있다:

1. **서사 리듬 층**: Slow-Fast-Boom-Stop의 시간 배분
2. **운동 커브 층**: Expo Out / Overshoot / Spring, linear 거부
3. **표현 언어 층**: 과정 보여주기, 마우스 곡선, Logo 변형 수렴

---

## 1. 서사 리듬 · Slow-Fast-Boom-Stop 5단 구조

Anthropic 세 편은 예외 없이 이 구조를 따른다:

| 단 | 비중 | 리듬 | 역할 |
|---|---|---|---|
| **S1 발단** | ~15% | 느림 | 사람에게 반응할 시간을 주고 현실감을 세운다 |
| **S2 생성** | ~15% | 중간 | 시각적으로 놀라운 지점이 나온다 |
| **S3 과정** | ~40% | 빠름 | 통제 가능성/밀도/디테일을 보여준다 |
| **S4 폭발** | ~20% | Boom | 카메라 후퇴/3D pop-out/여러 패널이 몰려나옴 |
| **S5 착지** | ~10% | 정지 | 브랜드 Logo + 딱 끊기 |

**구체적 길이 매핑**(15초 애니메이션 예):
S1 발단 2s · S2 생성 2s · S3 과정 6s · S4 폭발 3s · S5 착지 2s

**하지 말 것**:
- ❌ 균일한 리듬(초당 정보 밀도가 같음) — 보는 사람이 피로해진다
- ❌ 계속 고밀도 — 정점이 없으면 기억할 지점도 없다
- ❌ 점점 약해지는 마무리(투명으로 fade out) — **딱 끊어야** 한다

**자체 점검**: 종이에 thumbnail 5개를 그린다. 각각이 한 단의 절정 화면이다. 5장이 크게 다르지 않으면
리듬이 안 만들어진 것이다.

---

## 2. Easing 철학 · linear를 거부하고 물리를 받아들인다

Anthropic 세 편의 모든 동작은 「감쇠감」이 있는 베지어 커브를 쓴다. 기본 cubic easeOut
(`1-(1-t)³`)은 **날이 덜 서 있다.** 출발이 충분히 빠르지 않고 멈춤이 충분히 안정적이지 않다.

### 핵심 Easing 3개(animations.jsx에 내장되어 있다)

```js
// 1. Expo Out · 빠르게 출발해서 천천히 제동 (가장 많이 쓰는 기본 주 easing)
// 대응 CSS: cubic-bezier(0.16, 1, 0.3, 1)
Easing.expoOut(t) // = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)

// 2. Overshoot · 탄성이 있는 toggle/버튼 튀어나옴
// 대응 CSS: cubic-bezier(0.34, 1.56, 0.64, 1)
Easing.overshoot(t)

// 3. Spring 물리 · 기하 도형이 제자리로, 자연스러운 착지
Easing.spring(t)
```

### 용도 매핑

| 상황 | 어느 Easing을 쓰나 |
|---|---|
| 카드 rise-in / 패널 등장 / Terminal fade / focus overlay | **`expoOut`**(주 easing, 가장 많이 쓴다) |
| Toggle 전환 / 버튼 튀어나옴 / 인터랙션 강조 | `overshoot` |
| Preview 기하 도형 제자리 / 물리적 착지 / UI 요소 튕김 | `spring` |
| 지속적인 운동(마우스 궤적 보간 등) | `easeInOut`(대칭성을 유지한다) |

### 직관과 반대되는 통찰

제품 홍보 영상 대부분의 애니메이션은 **너무 빠르고 너무 딱딱하다.** `linear`는 디지털 요소를 기계처럼 만들고, `easeOut`은 기본 점수이고,
`expoOut`이야말로 「고급감」의 기술적 근원이다. 디지털 요소에 **물리 세계의 무게감**을 준다.

---

## 3. 운동 언어 · 공통 원칙 8가지

### 3.1 배경색은 순수한 검정과 순수한 흰색을 쓰지 않는다

Anthropic 세 편 중 어느 것도 `#FFFFFF`나 `#000000`을 주 배경색으로 쓰지 않았다. **색온도가 있는 중성색**
(따뜻하든 차갑든)은 "종이 / 캔버스 / 책상"의 물질감을 갖고 기계 느낌을 깎는다.

**구체적 색값 결정**은 §1.a 핵심 자산 프로토콜(브랜드 spec에서 추출)이나 「디자인 방향 어드바이저」
(20가지 철학이 각자 가진 배경색안)로 간다. 이 reference는 구체적 색값을 주지 않는다. 그것은 **브랜드 결정**이고 운동 규칙이 아니다.

### 3.2 Easing은 절대 linear가 아니다

§2를 본다.

### 3.3 Slow-Fast-Boom-Stop 서사

§1을 본다.

### 3.4 「마법 같은 결과」가 아니라 「과정」을 보여준다

- Claude Design은 tweak 파라미터와 슬라이더를 끄는 모습을 보여준다(원클릭으로 완벽한 결과가 나오는 게 아니다)
- Claude Code는 코드 오류와 AI의 수정을 보여준다(한 번에 성공하는 게 아니다)
- Claude for Word는 Redline의 빨간 삭제·초록 추가 수정 과정을 보여준다(최종 원고를 바로 주는 게 아니다)

**공통된 속뜻**: 제품은 **협업자, 페어 프로그래머, 숙련 편집자**다. 원클릭 마술사가 아니다.
전문 사용자가 「통제 가능성」과 「진실성」에서 느끼는 통점을 정확히 때린다.

**AI slop 반대**: AI는 기본적으로 「마법처럼 원클릭 성공」 애니메이션을 만든다(원클릭 생성 → 완벽한 결과).
그게 범용 공약수다. **거꾸로 한다.** 과정을 보여주고 tweak을 보여주고 버그와 수정을 보여주는 것이
브랜드 식별도의 원천이다.

### 3.5 마우스 궤적은 손으로 그린다(곡선 + Perlin Noise)

실제 사람의 마우스 운동은 직선이 아니다. 「출발 가속 → 곡선 → 감속 보정 → 클릭」이다.
AI가 직선으로 보간한 마우스 궤적은 **잠재의식적으로 거부감을 준다.**

```js
// 2차 베지어 곡선 보간 (시작점 → 제어점 → 끝점)
function bezierQuadratic(p0, p1, p2, t) {
  const x = (1-t)*(1-t)*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0];
  const y = (1-t)*(1-t)*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1];
  return [x, y];
}

// 경로: 시작점 → 중간점에서 벗어난 지점 → 끝점 (곡선을 만든다)
const path = [[100, 100], [targetX - 200, targetY + 80], [targetX, targetY]];

// 여기에 아주 작은 Perlin Noise(±2px)를 얹어 「손 떨림」을 만든다
const jitterX = (simpleNoise(t * 10) - 0.5) * 4;
const jitterY = (simpleNoise(t * 10 + 100) - 0.5) * 4;
```

### 3.6 Logo 「변형 수렴」(Morph)

Anthropic 세 편의 Logo 등장은 **어느 것도 단순 fade-in이 아니다.** 직전 시각 요소가 **변형되어** 나온다.

**공통 패턴**: 마지막 1-2초에 Morph / Rotate / Converge를 해서 서사 전체가 브랜드 지점으로 「붕괴」하게 만든다.

**저비용 구현**(진짜 morph를 쓰지 않는다):
직전 시각 요소를 색 덩어리로 「붕괴」시키고(scale → 0.1, 중심으로 translate),
그 색 덩어리를 다시 「팽창」시켜 wordmark로 펼친다. 전환은 150ms 빠른 컷 + motion blur
(`filter: blur(6px)` → `0`)로 한다.

```js
<Sprite start={13} end={14}>
  {/* 붕괴: 직전 요소를 scale 0.1로, opacity는 유지, filter blur 증가 */}
  const scale = interpolate(t, [0, 0.5], [1, 0.1], Easing.expoOut);
  const blur = interpolate(t, [0, 0.5], [0, 6]);
</Sprite>
<Sprite start={13.5} end={15}>
  {/* 팽창: Logo가 색 덩어리 중심에서 scale 0.1 → 1, blur 6 → 0 */}
  const scale = interpolate(t, [0, 0.6], [0.1, 1], Easing.overshoot);
  const blur = interpolate(t, [0, 0.6], [6, 0]);
</Sprite>
```

### 3.7 세리프 + 산세리프 두 글꼴

- **브랜드 / 내레이션**: 세리프(「학술감 / 출판물감 / 품격」이 있다)
- **UI / 코드 / 데이터**: 산세리프 + 고정폭

**글꼴 하나로 끝내는 것은 다 틀렸다.** 세리프가 「품격」을 주고 산세리프가 「기능」을 준다.

구체적 글꼴 선택은 브랜드 spec(brand-spec.md의 Display / Body / Mono 세 스택)이나 디자인 방향
어드바이저의 20가지 철학으로 간다. 이 reference는 구체적 글꼴을 주지 않는다. 그것은 **브랜드 결정**이다.

### 3.8 초점 전환 = 배경 약화 + 전경 선명화 + Flash 유도

초점 전환은 opacity를 내리는 것**만이 아니다.** 완전한 레시피는 이렇다:

```js
// 초점이 아닌 요소의 필터 조합
tile.style.filter = `
  brightness(${1 - 0.5 * focusIntensity})
  saturate(${1 - 0.3 * focusIntensity})
  blur(${focusIntensity * 4}px)        // ← 핵심: blur를 넣어야 진짜로 "뒤로 물러난다"
`;
tile.style.opacity = 0.4 + 0.6 * (1 - focusIntensity);

// 초점 이동이 끝난 뒤 초점 위치에서 150ms Flash highlight로 시선을 다시 끌어온다
focusOverlay.animate([
  { background: 'rgba(255,255,255,0.3)' },
  { background: 'rgba(255,255,255,0)' }
], { duration: 150, easing: 'ease-out' });
```

**blur가 반드시 필요한 이유**: opacity + brightness만으로는 초점 밖 요소가 여전히 「선명」해서
시각적으로 「뒤 배경으로 물러나는」 효과가 없다. blur(4-8px)가 초점 밖을 진짜로 한 겹 뒤 심도로 보낸다.

---

## 4. 구체적인 운동 기법(바로 베껴 쓸 수 있는 코드 조각)

### 4.1 FLIP / Shared Element Transition

버튼이 「팽창」해서 입력창이 된다. 버튼이 사라지고 새 패널이 나타나는 게 **아니다.** 핵심은 **같은 DOM 요소**가
두 상태 사이를 transition하는 것이다. 두 요소가 cross-fade하는 게 아니다.

```jsx
// Framer Motion layoutId 사용
<motion.div layoutId="design-button">Design</motion.div>
// ↓ 클릭 후 같은 layoutId
<motion.div layoutId="design-button">
  <input placeholder="Describe your design..." />
</motion.div>
```

네이티브 구현은 https://aerotwist.com/blog/flip-your-animations/ 를 참고한다

### 4.2 「호흡식」 펼침(width→height)

패널 펼침은 **width와 height를 동시에 당기는 게 아니다**. 이렇게 한다:
- 앞 40% 시간: width만 당긴다(height는 작게 유지)
- 뒤 60% 시간: width는 유지하고 height를 밀어 올린다

현실 세계의 「먼저 펼치고 그다음 물을 붓는」 감각을 시뮬레이션한다.

```js
const widthT = interpolate(t, [0, 0.4], [0, 1], Easing.expoOut);
const heightT = interpolate(t, [0.3, 1], [0, 1], Easing.expoOut);
style.width = `${widthT * targetW}px`;
style.height = `${heightT * targetH}px`;
```

### 4.3 Staggered Fade-up(30ms stagger)

표 행, 카드 열, 리스트 항목이 등장할 때 **요소마다 30ms를 지연**하고 `translateY`를 10px에서 0으로 돌린다.

```js
rows.forEach((row, i) => {
  const localT = Math.max(0, t - i * 0.03);  // 30ms stagger
  row.style.opacity = interpolate(localT, [0, 0.3], [0, 1], Easing.expoOut);
  row.style.transform = `translateY(${
    interpolate(localT, [0, 0.3], [10, 0], Easing.expoOut)
  }px)`;
});
```

### 4.4 비선형 호흡 · 핵심 결과 앞에서 0.5s 멈춘다

기계는 빠르고 이어지게 실행하지만, **핵심 결과가 나오기 전에 0.5초 멈춰서** 보는 사람의 뇌에 반응할 시간을 준다.

```jsx
// 대표적인 상황: AI 생성 완료 → 0.5s 멈춤 → 결과가 떠오른다
<Sprite start={8} end={8.5}>
  {/* 0.5s 멈춤 — 아무것도 움직이지 않고, 보는 사람이 로딩 상태를 응시하게 한다 */}
  <LoadingState />
</Sprite>
<Sprite start={8.5} end={10}>
  <ResultAppear />
</Sprite>
```

**나쁜 예**: AI 생성이 끝나자마자 이음새 없이 결과로 넘어간다. 보는 사람에게 반응할 시간이 없고 정보가 흘러 나간다.

### 4.5 Chunk Reveal · token 스트리밍 시뮬레이션

AI가 글자를 생성하는 장면에서 **`setInterval`로 한 글자씩 튀어나오게 하지 않는다**(옛 영화 자막처럼 보인다). **chunk reveal**을 쓴다.
한 번에 2-5글자가 나오고 간격은 불규칙하게 해서 실제 token 스트리밍 출력을 시뮬레이션한다.

```js
// 글자 단위가 아니라 chunk 단위로 나눈다
const chunks = text.split(/(\s+|,\s*|\.\s*|;\s*)/);  // 단어 + 문장부호로 자른다
let i = 0;
function reveal() {
  if (i >= chunks.length) return;
  element.textContent += chunks[i++];
  const delay = 40 + Math.random() * 80;  // 불규칙하게 40-120ms
  setTimeout(reveal, delay);
}
reveal();
```

### 4.6 Anticipation → Action → Follow-through

Disney 12원칙 중 3개다. Anthropic은 이걸 아주 명시적으로 쓴다:

- **Anticipation**(예비): 동작이 시작되기 전에 작은 반대 방향 동작이 있다(버튼이 살짝 줄었다가 튀어나온다)
- **Action**(동작): 주 동작 자체
- **Follow-through**(따라오기): 동작이 끝난 뒤 여운이 있다(카드가 자리에 앉은 뒤 살짝 bounce)

```js
// 카드 등장의 완전한 세 단계
const anticip = interpolate(t, [0, 0.2], [1, 0.95], Easing.easeIn);     // 예비
const action  = interpolate(t, [0.2, 0.7], [0.95, 1.05], Easing.expoOut); // 주 동작
const settle  = interpolate(t, [0.7, 1], [1.05, 1], Easing.spring);       // 되튐
// 최종 scale = 세 단계의 곱, 또는 구간별 적용
```

**나쁜 예**: Action만 있고 Anticipation + Follow-through가 없는 애니메이션은 「PowerPoint 애니메이션」처럼 보인다.

### 4.7 3D Perspective + translateZ 층 나누기

「기울어진 3D + 떠 있는 카드」의 기질을 원하면 컨테이너에 perspective를 주고 요소마다 다른 translateZ를 준다:

```css
.stage-wrap {
  perspective: 2400px;
  perspective-origin: 50% 30%;  /* 시선을 약간 내려다보게 */
}
.card-grid {
  transform-style: preserve-3d;
  transform: rotateX(8deg) rotateY(-4deg);  /* 황금비 */
}
.card:nth-child(3n) { transform: translateZ(30px); }
.card:nth-child(5n) { transform: translateZ(-20px); }
.card:nth-child(7n) { transform: translateZ(60px); }
```

**rotateX 8° / rotateY -4°가 황금비인 이유**:
- 10°를 넘으면 → 요소 왜곡이 너무 강해서 「넘어지는」 것처럼 보인다
- 5°보다 작으면 → 「투시」가 아니라 「기울임」처럼 보인다
- 8° × -4°의 비대칭 비율이 「카메라가 책상 왼쪽 위에서 내려다보는」 natural angle을 시뮬레이션한다

### 4.8 대각선 Pan · XY를 동시에 움직인다

카메라 운동은 순수한 상하나 순수한 좌우가 아니라, **XY를 동시에 움직여** 대각선 이동을 시뮬레이션한다:

```js
const panX = Math.sin(flowT * 0.22) * 40;
const panY = Math.sin(flowT * 0.35) * 30;
stage.style.transform = `
  translate(-50%, -50%)
  rotateX(8deg) rotateY(-4deg)
  translate3d(${panX}px, ${panY}px, 0)
`;
```

**핵심**: X와 Y의 주기를 다르게 한다(0.22 vs 0.35). Lissajous 순환이 규칙적으로 보이는 것을 피한다.

---

## 5. 상황별 레시피(서사 템플릿 세 가지)

참고 자료의 세 영상은 세 가지 제품 성격에 대응한다. **제품에 가장 잘 맞는 하나를 고른다.** 섞지 않는다.

### 레시피 A · Apple Keynote 극적 연출형 (Claude Design 계열)

**어울리는 곳**: 대규모 버전 발표, hero 애니메이션, 시각적 놀라움 우선
**리듬**: Slow-Fast-Boom-Stop의 강한 곡선
**Easing**: 전 구간 `expoOut` + 소량의 `overshoot`
**SFX 밀도**: 높음(~0.4/s), SFX 음높이를 BGM 음계에 맞춘다
**BGM**: IDM / 미니멀 테크 일렉트로닉, 차분함 + 정밀함
**수렴**: 카메라 급후퇴 → drop → Logo 변형 → 공허한 단음 → 딱 끊기

### 레시피 B · 원 테이크 도구형 (Claude Code 계열)

**어울리는 곳**: 개발자 도구, 생산성 App, 몰입 상황
**리듬**: 계속 안정적인 flow, 뚜렷한 정점이 없다
**Easing**: `spring` 물리 + `expoOut`
**SFX 밀도**: **0**(순수하게 BGM이 편집 리듬을 이끈다)
**BGM**: Lo-fi Hip-hop / Boom-bap, 85-90 BPM
**핵심 기법**: 핵심 UI 동작을 BGM의 kick/snare 트랜지언트에 맞춘다 — 「**음악의 리듬이 곧 인터랙션 효과음**」

### 레시피 C · 오피스 생산성 서사형 (Claude for Word 계열)

**어울리는 곳**: 기업용 소프트웨어, 문서/표/캘린더류, 전문성 우선
**리듬**: 여러 scene 하드 컷 + Dolly In/Out
**Easing**: `overshoot`(toggle) + `expoOut`(패널)
**SFX 밀도**: 중간(~0.3/s), UI click 중심
**BGM**: Jazzy Instrumental, 단조, BPM 90-95
**핵심 하이라이트**: 어느 한 장면에는 반드시 「전편의 하이라이트」가 있다 — 3D pop-out / 평면을 벗어나 떠오르기

---

## 6. 나쁜 예 · 이렇게 하면 AI slop이다

| 나쁜 pattern | 왜 틀렸나 | 올바른 방법 |
|---|---|---|
| `transition: all 0.3s ease` | `ease`는 linear의 사촌이고 모든 요소가 같은 속도가 된다 | `expoOut` + 요소별 stagger |
| 모든 등장이 `opacity 0→1` | 운동 방향감이 없다 | `translateY 10→0`+ Anticipation을 함께 |
| Logo 페이드인 | 서사가 수렴하는 느낌이 없다 | Morph / Converge / 붕괴-펼침 |
| 마우스가 직선으로 이동 | 잠재의식적으로 기계 느낌 | 베지어 곡선 + Perlin Noise |
| 타이핑이 한 글자씩 튀어나옴(setInterval) | 옛 영화 자막 같다 | Chunk Reveal, 무작위 간격 |
| 핵심 결과 앞에 멈춤이 없다 | 보는 사람에게 반응할 시간이 없다 | 결과 앞에서 0.5s 멈춤 |
| 초점 전환에서 opacity만 바꾼다 | 초점 밖 요소가 여전히 선명하다 | opacity + brightness + **blur** |
| 순수한 검정 배경 / 순수한 흰색 배경 | 사이버 느낌 / 반사광 피로 | 색온도가 있는 중성색(브랜드 spec으로 간다) |
| 모든 애니메이션이 똑같이 빠르다 | 리듬이 없다 | Slow-Fast-Boom-Stop |
| Fade out으로 마무리 | 결정된 느낌이 없다 | 딱 끊기(마지막 프레임을 hold) |

---

## 6.5 · 감독 대본의 시각 밀도 조항(B00 실전 교훈, 2026-07-17)

**서사와 카메라 워크만 쓴 감독 대본은 와이어프레임을 받게 된다.** B00 계단(StepFun) b-roll 실측: v1 감독 대본은 여섯 장면의 서사, 타임라인, 카메라 운동을 아주 꼼꼼히 썼고, 구현 agent가 낸 애니메이션의 동작은 전부 합격이고 check도 전부 초록이었다. 그런데 시각은 「무채색 어두운 블록 세 개 + 큰 글자」 수준의 개념`expoOut`이고 `easeOut`이나 `linear`가 아닌가?
- [ ] Toggle / 버튼 튀어나옴에 `overshoot`를 썼나?
- [ ] 카드 / 리스트 등장에 30ms stagger가 있나?
- [ ] 핵심 결과 앞에 0.5s 멈춤이 있나?
- [ ] 타이핑이 Chunk Reveal이고 setInterval 한 글자씩이 아닌가?
- [ ] 초점 전환에 blur를 넣었나(opacity만이 아니라)?
- [ ] Logo가 변형 수렴(Morph)이고 페이드인이 아닌가?
- [ ] 배경색이 순수한 검정 / 순수한 흰색이 아닌가(색온도가 있나)?
- [ ] 글자에 세리프 + 산세리프 층위가 있나?
- [ ] 마무리가 딱 끊기이고 점점 약해지는 게 아닌가?
- [ ] (마우스가 있다면) 마우스 궤적이 곡선이고 직선이 아닌가?
- [ ] SFX 밀도가 제품 성격에 맞나(레시피 A/B/C를 본다)?
- [ ] BGM과 SFX에 6-8dB 음량 차가 있나?(`audio-design-rules.md`를 본다)

---

## 8. 다른 reference와의 관계

| reference | 위치 | 관계 |
|---|---|---|
| `animation-pitfalls.md` | 기술 함정 회피(16개 항목) | 「**이렇게 하지 마라**」 · 이 파일의 반대면 |
| `animations.md` | Stage/Sprite 엔진 사용법 | 애니메이션을 **어떻게 쓰는지**의 기초 |
| `audio-design-rules.md` | 이중 트랙 오디오 규칙 | 애니메이션에 **오디오를 붙이는** 규칙 |
| `sfx-library.md` | SFX 37개 목록 | 효과음 **소재 라이브러리** |
| `apple-gallery-showcase.md` | Apple 갤러리 전시 스타일 | 특정한 운동 스타일 하나를 다룬 전문 문서 |
| **이 파일** | 정방향 운동 설계 문법 | 「**이렇게 해야 한다**」 |

**호출 순서**:
1. 먼저 SKILL.md 작업 흐름 Step 3의 form 도출 5문을 본다(서사 역할과 시각 온도를 정한다)
2. 방향을 정한 뒤 이 파일을 읽어 **운동 언어**를 확정한다(레시피 A/B/C)
3. 코드를 쓸 때 `animations.md`와 `animation-pitfalls.md`를 참고한다
4. 영상을 내보낼 때 `audio-design-rules.md` + `sfx-library.md`로 간다

---

## 부록 · 이 파일의 소재 출처

- Anthropic 공식 애니메이션 분해: Neo 프로젝트 디렉터리의`\u53C2\u8003\u52A8\u753B/BEST-PRACTICES.md`
- Anthropic 오디오 분해: 같은 디렉터리의 `AUDIO-BEST-PRACTICES.md`
- 참고 영상 3편: `ref-{1,2,3}.mp4` + 대응하는 `gemini-ref-*.md` / `audio-ref-*.md`
- **엄격한 필터**: 이 reference는 구체적인 브랜드 색값, 글꼴 이름, 제품명을 일절 담지 않는다.
  색/글꼴 결정은 §1.a 핵심 자산 프로토콜이나 20가지 디자인 철학으로 간다.
