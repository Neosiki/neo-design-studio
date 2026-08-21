# Gallery Ripple + Multi-Focus · 장면 연출 철학

> design-studio hero 애니메이션 v9(25초, 8개 장면)에서 추출한 **재사용 가능한 시각적 연출 구조**입니다.
> 애니메이션 제작 파이프라인이 아니라, **어떤 상황에서 이러한 연출이 "옳은지"**에 대한 것입니다.
실전 참고: [demos/hero-animation-v9.mp4](../demos/hero-animation-v9.mp4) · [https://www.huasheng.ai/Design-hero/](https://www.huasheng.ai/Design-hero/)

## 요약

> **20개 이상의 동질적인 비주얼 에셋이 있고 "규모감과 깊이감"을 표현해야 하는 상황이라면, 단순한 레이아웃 나열 대신 Gallery Ripple + Multi-Focus 연출을 우선적으로 고려하세요.**

범용 SaaS 기능 애니메이션, 제품 발표회, skill 홍보, 포트폴리오 시리즈 전시 등 에셋의 수량이 충분하고 스타일이 일관적이라면 이 구조는 거의 항상 효과적입니다.

---

## 이 기법이 전달하고자 하는 핵심

"에셋 자랑"이 아닙니다. **두 가지 리듬의 변화**를 통해 서사를 전달하는 것입니다:

**첫 번째 박자 · Ripple 전개 (~1.5s)**: 중심에서 외곽으로 48장의 카드가 확산되며 관객은 그 "양"에 압도됩니다 — "와, 결과물이 이렇게나 많구나."

**두 번째 박자 · Multi-Focus (~8s, 4회 반복)**: 카메라가 천천히 패닝(pan)하는 동안 배경을 4번에 걸쳐 어둡게(dim) 하고 채도를 낮추며(desaturate), 특정 카드 한 장을 화면 중앙으로 확대합니다. 관객은 "양의 충격"에서 "질의 응시"로 전환되며, 매회 1.7초의 안정적인 리듬을 경험합니다.

**핵심 서사 구조**: **규모(Ripple) → 응시(Focus × 4) → 페이드 아웃(Walloff)**. 이 세 박자의 조합은 「Breadth × Depth」를 표현합니다. 단순히 많이 만들 수 있는 것이 아니라, 하나하나가 멈춰서 볼 가치가 있다는 것을 보여줍니다.

반대 사례와 비교해 보세요:

| 방식 | 관객의 체감 |
|------|---------|
| 48장의 카드 정적 배열 (Ripple 없음) | 보기 좋지만 서사가 없어 그리드 스크린샷처럼 보임 |
| 한 장씩 빠르게 전환 (Gallery context 없음) | 슬라이드쇼 같아서 "규모감"이 사라짐 |
| Ripple만 있고 Focus가 없음 | 압도적이지만 구체적인 한 장도 기억에 남지 않음 |
| **Ripple + Focus × 4 (본 레시피)** | **먼저 양에 압도되고, 다음으로 질에 집중하며, 마지막으로 차분하게 페이드 아웃 — 완벽한 감정의 곡선** |

---

## 전제 조건 (모두 충족 필수)

이 연출은 **만능이 아닙니다**. 다음 4가지 조건이 반드시 충족되어야 합니다:

1. **에셋 규모 ≥ 20장, 가급적 30장 이상**
   20장 미만이면 Ripple이 "비어" 보입니다. 48개 격자 하나하나가 움직여야 밀도감이 생깁니다. v9에서는 48개 격자에 32장의 이미지를 사용했습니다(반복 채우기).

2. **비주얼 스타일의 일관성**
   모두 16:9 슬라이드 미리보기이거나, 모두 앱 스크린샷이거나, 모두 커버 디자인이어야 합니다. 가로세로비, 톤, 레이아웃이 "한 세트"처럼 보여야 합니다. 무분별한 혼합은 Gallery를 클립보드처럼 보이게 만듭니다.

3. **단독 확대 시에도 유효한 정보량**
   Focus는 특정 카드를 가로 960px 크기로 확대합니다. 원본 이미지가 확대 시 흐릿해지거나 정보가 빈약하다면 Focus 단계는 무의미해집니다. 역으로 검증해 보세요: 48장 중 "가장 대표적인" 4장을 골라낼 수 있습니까? 골라낼 수 없다면 에셋의 품질이 고르지 않다는 뜻입니다.

4. **가로형(landscape) 또는 정방형(square) 화면 구성 (세로형 제외)**
   갤러리의 3D 기울기(`rotateX(14deg) rotateY(-10deg)`) 가로로 확장되는 느낌이 필요하며, 세로 화면에서는 기울기 효과가 좁고 어색해 보일 수 있습니다.

**조건 미충족 시의 대체 경로**:

| 부족한 요소 | 대체 방식 |
|-------|-----------|
| 소재 < 20장 | 「3-5장 병렬 정적 전시 + 순차적 focus」로 변경 |
| 스타일 불일치 | 「표지 + 3개 섹션 대형 이미지」 형태의 keynote-style로 변경 |
| 정보 부족 | 「data-driven dashboard」 또는 「핵심 문구 + 큰 글씨」로 변경 |
| 세로 화면 환경 | 「vertical scroll + sticky cards」로 변경 |

---

## 기술 레시피 (v9 실전 파라미터)

### 4-Layer 구조```
viewport (1920×1080, perspective: 2400px)
  └─ canvas (4320×2520, 초대형 overflow) → 3D tilt + pan
      └─ 8×6 grid = 48 cards (gap 40px, padding 60px)
          └─ img (16:9, border-radius 9px)
      └─ focus-overlay (absolute center, z-index 40)
          └─ img (matches selected slide)
```
**핵심**: canvas를 viewport보다 2.25배 크게 설정해야 pan 동작 시 "더 넓은 세상을 엿보는 듯한" 느낌을 줄 수 있습니다.

### Ripple 확장 (거리 지연 알고리즘)```js
// 각 카드의 등장 시간 = 중심까지의 거리 × 0.8s 지연
const col = i % 8, row = Math.floor(i / 8);
const dc = col - 3.5, dr = row - 2.5;       // 중심으로의 오프셋
const dist = Math.hypot(dc, dr);
const maxDist = Math.hypot(3.5, 2.5);
const delay = (dist / maxDist) * 0.8;       // 0 → 0.8s
const localT = Math.max(0, (t - rippleStart - delay) / 0.7);
const opacity = expoOut(Math.min(1, localT));
```
**핵심 파라미터**:
- 총 지속 시간 1.7s（`T.s3_ripple: [8.3, 10.0]`)
- 최대 지연 0.8s(중앙이 가장 빠름, 모서리가 가장 느림)
- 카드별 등장 시간 0.7s
- Easing:`expoOut`(폭발적인 느낌, 부드러운 느낌이 아님)

**동시에 진행되는 작업**: canvas scale 1.25 → 0.94(zoom out to reveal) — 연출에 맞춰 나타나는 동기화된 멀어지는 느낌.

### Multi-Focus(4회 리듬)```js
T.focuses = [
  { start: 11.0, end: 12.7, idx: 2  },  // 1.7s
  { start: 13.3, end: 15.0, idx: 3  },  // 1.7s
  { start: 15.6, end: 17.3, idx: 10 },  // 1.7s
  { start: 17.9, end: 19.6, idx: 16 },  // 1.7s
];
```
**리듬 규칙**: 각 focus 1.7s, 간격 0.6s 휴지. 총 8s(11.0–19.6s).

**각 focus 내부**:
- In ramp: 0.4s(`expoOut`）
- Hold: 중간 0.9s（`focusIntensity = 1`）
- Out ramp: 0.4s（`easeOut`)

**배경 변화(이것이 핵심입니다)**:```js
if (focusIntensity > 0) {
  const dimOp = entryOp * (1 - 0.6 * focusIntensity);  // dim to 40%
  const brt = 1 - 0.32 * focusIntensity;                // brightness 68%
  const sat = 1 - 0.35 * focusIntensity;                // saturate 65%
  card.style.filter = `brightness(${brt}) saturate(${sat})`;
}
```
**opacity뿐만 아니라 desaturate + darken을 동시에 적용**합니다. 이를 통해 전경 overlay의 색상이 단순히 '밝아지는' 것이 아니라 '돋보이게(pop)' 됩니다.

**Focus overlay 크기 애니메이션**:
- 400×225(진입) → 960×540(유지 상태)
- 외곽에 3개의 shadow 레이어 + 3px accent 색상의 outline ring을 적용하여 '프레임에 갇힌 듯한 느낌'을 줍니다.

### Pan (지속감으로 정적인 상태의 지루함 해소)```js
const panT = Math.max(0, t - 8.6);
const panX = Math.sin(panT * 0.12) * 220 - panT * 8;
const panY = Math.cos(panT * 0.09) * 120 - panT * 5;
```
- 사인파 + 선형 드리프트(drift) 이중 레이어 모션 — 단순 반복이 아니며 매 순간 위치가 달라짐
- X/Y 주파수를 다르게 설정(0.12 vs 0.09)하여 시각적인 '규칙적 반복'을 방지
- ±900/500px 범위로 clamp하여 화면 밖으로 벗어나는 것을 방지

**왜 단순 선형 팬(pan)을 사용하지 않는가**: 단순 선형 이동은 관객이 다음 위치를 '예측'하게 만듭니다. 반면 사인파+드리프트 조합은 매 순간을 새롭게 만들며, 3D 틸트와 결합되어 (긍정적인 의미의) '미세한 멀미감'을 유발해 주의력을 붙잡아둡니다.

---

## 5가지 재사용 가능한 패턴 (v6→v9 반복 과정에서 추출)

### 1. **메인 이징(easing)으로 cubicOut이 아닌 expoOut 사용**`easeOut = 1 - (1-t)³`（부드럽게）vs  `expoOut = 1 - 2^(-10t)`(폭발 후 빠르게 수렴).

**선택 이유**: expoOut의 초기 30%가 빠르게 90%에 도달하여 물리적 댐핑에 가깝고, "무거운 물체가 떨어지는" 직관에 부합합니다. 특히 다음에 적합합니다:
- 카드 등장(무게감)
- Ripple 확산(충격파)
- Brand 부상(안정감)

**여전히 cubicOut을 사용하는 경우**: focus out ramp, 대칭형 마이크로 인터랙션.

### 2. **종이 질감 배경 + 테라코타 오렌지 accent (Anthropic 혈통)**```css
--bg: #F7F4EE;        /* 따뜻한 종이 */
--ink: #1D1D1F;       /* 거의 검정 */
--accent: #D97757;    /* 테라코타 오렌지 */
--hairline: #E4DED2;  /* 따뜻한 선 */
```
**이유**: 따뜻한 배경색은 GIF 압축 후에도 순백색의 "스크린 느낌"과 달리 여전히 "숨 쉬는 듯한 느낌"을 유지합니다. 테라코타 오렌지가 유일한 accent로서 terminal prompt, dir-card 선택, cursor, brand hyphen, focus ring 등 모든 시각적 앵커를 이 하나의 색상으로 연결합니다.

**v5 레슨**: "종이 질감"을 시뮬레이션하기 위해 noise overlay를 추가했으나, GIF 프레임 압축이 완전히 깨졌습니다(프레임마다 데이터가 달라짐). v6에서는 "배경색 + 따뜻한 shadow만 사용"하는 방식으로 변경하여, 종이 질감은 90% 유지하면서 GIF 용량은 60% 줄였습니다.

### 3. **두 단계 Shadow로 깊이감 시뮬레이션, 리얼 3D 미사용**```css
.gallery-card.depth-near { box-shadow: 0 32px 80px -22px rgba(60,40,20,0.22), ... }
.gallery-card.depth-far  { box-shadow: 0 14px 40px -16px rgba(60,40,20,0.10), ... }
```
사용`sin(i × 1.7) + cos(i × 0.73)`결정론적 알고리즘은 각 카드에 near/mid/far 3단계 shadow를 할당합니다——**시각적으로 "3D 스택" 느낌을 주지만, 프레임당 transform은 전혀 변하지 않으며 GPU 소모는 0입니다.**

**리얼 3D의 비용**: 각 card별로 개별적인`translateZ`, GPU가 매 프레임 48개의 transform + shadow blur를 계산하고 있습니다. v4에서 시도해 보았는데, Playwright로 25fps 녹화조차 버거웠습니다. v6의 두 단계 shadow는 육안으로 보는 효과 차이가 5% 미만이지만, 비용 차이는 10배에 달합니다.

### 4. **글자 굵기 변화(font-variation-settings)가 글자 크기 변화보다 더 시네마틱합니다**```js
const wght = 100 + (700 - 100) * morphP;  // 100 → 700 over 0.9s
wordmark.style.fontVariationSettings = `"wght" ${wght.toFixed(0)}`;
```
Brand wordmark는 Thin → Bold로 0.9s 동안 전환되며, letter-spacing 미세 조정(-0.045 → -0.048em)을 결합합니다.

**확대/축소보다 나은 이유**:
- 확대/축소는 사용자가 너무 많이 봐서 기대치가 고착되어 있음
- Weight 변화는 '가까이 밀려오는 것'이 아니라, 풍선이 부풀어 오르는 것과 같은 '내면의 충만함'을 줌
- variable fonts는 2020년 이후에야 보급된 특성으로, 사용자가 무의식적으로 '현대적'이라고 느낌

**제한 사항**: 반드시 variable font를 지원하는 폰트(Inter/Roboto Flex/Recursive 등)를 사용해야 합니다. 일반적인 정적 폰트는 흉내만 낼 수 있습니다(고정된 몇 개의 weight를 전환할 때 끊김이 발생함).

### 5. **Corner Brand 저강도 지속 시그니처**

Gallery 단계 좌측 상단에`Design`작은 식별자, 16% 불투명도(opacity) 색상값, 12px 폰트 크기, 넓은 자간.

**추가하는 이유**:
- Ripple 효과가 터진 후 관객이 '초점'을 잃고 무엇을 보고 있는지 잊기 쉽습니다. 좌측 상단의 가벼운 식별자가 앵커(anchor) 역할을 돕습니다.
- 전체 화면의 큰 로고보다 더 고급스럽습니다. 브랜딩을 아는 사람들은 브랜드 시그니처를 굳이 크게 외칠 필요가 없다는 것을 압니다.
- GIF가 스크린샷으로 공유될 때도 소속 신호를 남길 수 있습니다.

**규칙**: 중반부(화면이 복잡할 때)에만 표시하며, 시작 시(terminal을 가리지 않도록)와 종료 시(brand reveal이 주인공이므로)에는 끕니다.

---

## 반례: 이 연출 방식을 사용하지 말아야 할 때

**❌ 제품 데모(기능을 보여줘야 하는 경우)**: Gallery 방식은 각 장면이 순식간에 지나가므로 관객이 어떤 기능도 기억하지 못합니다. '단일 화면 focus + tooltip 표기'로 변경하세요.

**❌ 데이터 중심 콘텐츠**: 관객이 숫자를 읽어야 하지만, Gallery의 빠른 템포는 읽을 시간을 주지 않습니다. '데이터 차트 + 항목별 reveal'로 변경하세요.

**❌ 스토리텔링**: Gallery는 '병렬' 구조이며, 이야기는 '인과관계'가 필요합니다. keynote 섹션 전환 방식을 사용하세요.

**❌ 소재가 3~5장뿐인 경우**: Ripple 밀도가 부족하여 '땜질'처럼 보일 수 있습니다. '정적 배열 + 개별 하이라이트'로 변경하세요.

**❌ 세로 화면(9:16)**: 3D tilt는 가로 확장이 필요합니다. 세로 화면에서는 기울기가 '펼쳐짐'이 아닌 '비뚤어짐'으로 느껴질 수 있습니다.

---

## 자신의 작업에 이 연출 방식이 적합한지 판단하는 방법

3단계 빠른 체크:

**Step 1 · 소재 수량**: 유사한 시각 소재가 몇 개인지 세어보세요. < 15 → 중단; 15-25 → 보충; 25+ → 바로 사용.

**Step 2 · 일관성 테스트**: 무작위 소재 4장을 나란히 놓았을 때 '한 세트'처럼 보이나요? 그렇지 않다면 → 스타일을 먼저 통일하거나 방안을 변경하세요.

**Step 3 · 내러티브 매칭**: 표현하려는 것이 'Breadth × Depth'(양 × 질)인가요? 아니면 '프로세스', '기능', '스토리'인가요? 전자가 아니라면 억지로 끼워 맞추지 마세요.

세 단계 모두 yes라면, 바로 v6 HTML을 fork하여 수정하세요.`SLIDE_FILES`배열과 타임라인은 재사용 가능합니다. 팔레트를 수정하세요.`--bg / --accent / --ink`, 전체적으로 외형만 변경하고 구조는 유지했습니다.

---

## 관련 Reference

- 전체 기술 프로세스: [references/animations.md](animations.md) · [references/animation-best-practices.md](animation-best-practices.md)
- 애니메이션 내보내기 파이프라인: [references/video-export.md](video-export.md)
- 오디오 설정 (BGM + SFX 듀얼 트랙): [references/audio-design-rules.md](audio-design-rules.md)
- Apple 갤러리 스타일의 벤치마킹 레퍼런스: [references/apple-gallery-showcase.md](apple-gallery-showcase.md)
- 원본 HTML (v6 + 오디오 통합 버전):`www.huasheng.ai/design-studio-hero/index.html`
