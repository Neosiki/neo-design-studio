# Cinematic Patterns · Workflow Demo 의 Best Practice

> 「PPT 애니메이션」에서 「발표회급 cinematic」으로 업그레이드하는 5가지 핵심 pattern。
> 2026-04 「대화 skill」 deck 에서 증류된 두 개의 cinematic demo（Nuwa workflow + Darwin workflow），실제로 재현 가능。

---

## 0 · 이 문서가 해결하는 문제

당신이 「워크플로우 데모 애니메이션을 시연하는」을(를) 해야 할 때（전형적 장면：skill 워크플로우、제품 onboarding、API 호출 흐름、agent 작업 실행），두 가지 흔한 방식이 있다：

| 패러다임 | 어떤 모습인가 | 결과 |
|---|---|---|
| **PPT 애니메이션**（나쁨） | step 1 fade in → step 2 fade in → step 3 fade in，4개의 box가 동일 화면에 배치됨 | 관객은 「그냥 PPT에 fade 효과를 넣은 것」이라고 느끼며, wow moment가 없음 |
| **Cinematic**（좋음） | scene-based，한 번에 하나의 일에만 focus，scene들 사이에는 dissolve / focus pull / morph 있음 | 관객은 「이건 제품 발표회의 한 장면이다」라고 느껴 스크린샷을 찍어 공유하고 싶어함 |

차이의 근원은 **애니메이션 기술**이 아니라 **서사 패러다임**이다. 이 문서는 전자에서 후자로 어떻게 업그레이드하는지 설명한다.

---

## 1 · 다섯 가지 핵심 pattern

### Pattern A · Dashboard + Cinematic Overlay 이중 구조

**문제**：단순한 cinematic은 기본적으로 검은 화면 + ▶ 버튼 하나뿐이라서, 사용자가 이 페이지로 와서 누르지 않으면 아무것도 보이지 않는다.

**해결**：
```
DEFAULT 상태 (항상 표시)：완전한 정적 workflow dashboard
  └── 관객이 한눈에 이 skill / 워크플로우가 어떻게 동작하는지 알 수 있도록

POINT ▶ 트리거 (overlay가 떠오름)：22 초 cinematic
  └── 실행이 끝나면 자동으로 fade로 DEFAULT로 돌아감

```

**구현 요점**：
- `.dash` 기본적으로 visible，`.cinema` 기본적으로 `opacity: 0; pointer-events: none`
- `.play-cta` 는 오른쪽 아래 금색 작은 버튼(중앙의 큰 오버레이가 아님)
- 클릭 → `cinema.classList.add('show')` + `dash.classList.add('hide')`
- `requestAnimationFrame`을 한 번 실행(루프 아님), 끝나면 `endCinematic()`으로 상태를 되돌림

**안티 패턴**：기본 = 중앙 큼 ▶ overlay가 모든 것을 덮음，클릭하기 전에는 페이지가 빈 상태.

---

### Pattern B · Scene-based, NOT Step-based

**문제**：애니메이션을「step 1 표시 → step 2 표시 → ...」로 나누는 것은 PPT식 사고방식이다.

**해결**：5개의 scene으로 나누고，각 scene은**독립적인 샷**이며，전체 화면은 한 가지에만 집중한다：

| Scene 유형 | 역할 | 소요 시간 |
|---|---|---|
| 1 · Invoke | 사용자 입력 트리거（터미널 typewriter）| 3-4s |
| 2 · Process | 핵심 작업 흐름의 시각화（독특한 시각 언어）| 5-6s |
| 3 · Result/Insight | 정제된 핵심 산출물（시각화）| 4-5s |
| 4 · Output | 실제 산출물 전시（파일 / diff / 숫자）| 3-4s |
| 5 · Hero Reveal | 마무리 hero moment（대형 텍스트 + 가치 제안）| 4-5s |

**총 길이 ≈ 22초**——이는 테스트를 통해 검증된 최적 길이입니다：
- 18초 미만：PM이 본격적으로 시작하기도 전에 끝난다
- 25초 초과：인내심을 잃는다
- 22초는 딱 충분하다「관심을 끌기 → 전개 → 정리 → 인상 남기기」

**실행 요점**：
- `T = { DURATION: 22.0, s1_in: [0, 0.7], s2_in: [3.8, 4.6], ... }` 전역 타임라인
- 하나의 `requestAnimationFrame(render)`로 모든 scene의 opacity / transform 계산을 처리
- setTimeout 체인 사용 금지（끊기 쉽고 디버깅 어렵다）
- Easing은 반드시 `expoOut` / `easeOut` / cubic-bezier 사용，**linear 금지**

---

### Pattern C · 각 데모의 시각 언어는 반드시 독립적이어야 한다

**문제**：첫 번째 cinematic을 만든 뒤, 두 번째를 만들 때 귀찮아서 같은 템플릿（같은 orbit + pentagon + typewriter + hero 대형 글자）을 재사용하고 문구만 바꿨다。

**결과**：관객은 두 skill이「똑같이 생겼다」고 느끼며，즉「이 두 skill은 차이가 없다」고 말하는 것과 같다。

**해결**：각 워크플로의 핵심 은유가 다르면 시각 언어도 반드시 달라야 한다。

**대조 사례**：

| 차원 | Nuwa（증류사）| Darwin（최적화 skill）|
|---|---|---|
| 핵심 은유 | 수집 → 정제 → 작성 | 순환 → 평가 → 래칫 |
| 시각적 움직임 | 부유 / 방사 / pentagon | 순환 / 상승 / 대비 |
| Scene 2 | 3D Orbit · 8장 아카이브가 원근 타원에 떠 있음 | Spin Loop · token이 6 노드 원형 고리를 따라 5바퀴 돈다 |
| Scene 3 | Pentagon · 5 token이 중앙에서 방사 | v1 vs v5 · 병렬 diff（레드 버전 vs 골드 버전） |
| Scene 4 | SKILL.md typewriter | Hill-Climb · 전체 화면 곡선 그리기 |
| Scene 5 hero | 「21분」serif italic 큰 글자 | 회전하는 기어 ⚙ + 「KEPT +1.1」금색 tag |

**판단 기준**：문구를 가리고 시각만 보고 이게 어느 demo인지 구분할 수 있나？구분 못하면 게으른 것이다。

---

### Pattern D · AI로 생성한 실제 같은 소재를 사용하고, emoji 또는 SVG 손그림은 사용하지 마세요

**문제**：3D orbit / gallery에서는 소재 조각이 떠다니게 해야 하는데，emoji（📚🎤）는 못생기고 브랜드성이 없으며，SVG 손그림 책등은 절대 진짜 책처럼 보이지 않는다。

**해결**：`design-gpt-image`로 4×2 grid 대형 이미지를 생성（주제 관련 물품 8점 · 흰 배경 · 60px breathing space · unified style），`extract_grid.py --mode bbox`로 잘라 8장의 개별 투명 PNG로 만든다。

**Prompt 요점**（자세한 prompt patterns는 `design-gpt-image` skill를 참조）：
- IP 고정（"1960s Caltech archive aesthetic" / "Hearthstone-style consistent treatment"）
- 흰 배경（마스크 작업에 용이，회색 배경은 분위기는 좋지만 투명 배경으로 뽑기 어렵다）
- 4×2 사용，5×5 사용 금지（마지막 줄 압축 bug 방지）
- Persona finishing（"You are a Wired magazine curator preparing an exhibition photo"）

**반 pattern**：emoji를 icon으로 사용하고, 제품 이미지를 CSS 실루엣으로 대체한다。

---

### Pattern E · BGM + SFX 듀얼 트랙

**문제**：애니메이션만 있고 소리가 없으면, 관객은 무의식적으로 「이건 초라한 demo 같다」고 느낀다。

**해결**：BGM 긴 음 + 11개의 SFX cues。

**공통 SFX cue 레시피**（워크플로우 demo에 적용）：

| 시점 | SFX | 트리거 상황 |
|---|---|---|
| 0.10s | whoosh | 터미널이 아래에서 올라옴 |
| 3.0s | enter | typewriter 완료, enter 누름 |
| 4.0s | slide-in | scene 2 요소 등장 |
| 5-9s × 5회 | sparkle | 핵심 과정 노드（세대별 / 각 token / 각 데이터 포인트）|
| 14s | click | output scene으로 전환 |
| 17.8s | logo-reveal | hero reveal 순간 |
| typewriter | type | 문자 2개마다 한 번 트리거（밀도는 너무 높지 않게）|

**주파수 대역 분리**：BGM volume 0.32（저역 배경 노이즈），SFX volume 0.55（중고역 punch），sparkle 0.7（눈에 띄게），logo-reveal 0.85（가장 강한 hero moment）。

**사용자 제어**：
- 반드시 ▶ 시작 오버레이（브라우저 autoplay 제한）
- 오른쪽 위 작은 mute 버튼(사용자가 언제든지 음소거할 수 있음)
- 페이지로 넘어오면 강제로 소리가 울리게 만들지 마세요

---

## 2 · 정적 Dashboard 설계 요점

Dashboard는 이중 구조의 Layer 1으로, PM이 ▶를 클릭하지 않아도 이 skill을 이해할 수 있어야 한다.

**레이아웃**：3열 grid(또는 1 큰 + 2 작은), 각 panel이 하나의 문제를 해결:

| Panel 유형 | 어떤 문제를 해결하는가 | 사례 |
|---|---|---|
| **Pipeline / Flow Diagram** | "이 skill의 작업 흐름은 무엇인가?" | Nuwa 4 단계 pipeline · Darwin autoresearch loop |
| **Snapshot / State** | "실제로 생성된 데이터는 어떤 모습인가?" | Darwin 8 차원 rubric snapshot |
| **Trajectory / Evolution** | 「여러 번 실행한 후 어떻게 변하나?」| Darwin 5대 hill-climb 곡선 |
| **Examples / Gallery** | 「이미 어떤 결과물이 나왔나？」| Nuwa 21 personas gallery |
| **Strip · Example I/O** | 「무엇을 입력 → 무엇을 출력」| Nuwa example strip：`› nuwa 증류 파인만 → feynman.skill (21 min)` |

**핵심 제약**：
- 정보 밀도가 충분해야 함（각 패널은 차별화된 정보를 담아야 함）
- 하지만 데이터 slop을 집어넣어선 안 됨（각 숫자는 의미가 있어야 함）
- 색채 구성은 cinematic과 일치（동일 색계열로 전환 시 어색하지 않도록）

---

## 3 · 디버깅 및 개발 도구

모든 긴 애니메이션에는 세 가지 dev 도구가 반드시 필요하다. 그렇지 않으면 디버깅이 엉망이 된다.

### 도구 1 · `?seek=N` N초로 고정

```js
const seek = parseFloat(params.get('seek'));
if (!isNaN(seek)) {
  started = true; muted = true;
  frozenT = seek;  // render()는 elapsed 대신 이 t를 사용합니다
  cinema.classList.add('show'); dash.classList.add('hide');
}

// render() 안：
let t = frozenT !== null ? frozenT : (elapsed % T.DURATION);
```

사용법：`http://.../slide.html?seek=12` 직접 12초 화면을 볼 수 있으며 재생을 기다릴 필요가 없습니다.

### 도구 2 · `?autoplay=1` ▶ overlay 건너뛰기

playwright 자동 스크린샷 테스트에 편리하고, iframe에 삽입할 때 force로 강제 시작하는 데도 편리하다.

### 도구 3 · 수동 REPLAY 버튼

오른쪽 상단의 작은 버튼으로, 사용자나 디버깅 중에 원하는 만큼 재생할 수 있다. CSS:

```css
.replay{position:absolute;top:18px;right:18px;background:rgba(212,165,116,0.1);
  border:1px solid rgba(212,165,116,0.3);color:#D4A574;
  font-family:monospace;font-size:10px;letter-spacing:.28em;text-transform:uppercase;
  padding:6px 12px;border-radius:1px;cursor:pointer;backdrop-filter:blur(6px);z-index:6}
```

---

## 4 · iframe 임베드 함정(만약 cinematic이 deck에 임베드되어 있다면)

### 문제 1 · 부모 창의 click zone이 iframe 내부 버튼을 가로챔

만약 deck index.html에 '좌우 22vw 투명 click zone으로 페이지 넘기기'를 추가하면，**iframe 내부의 ▶ play 버튼을 덮어써서**——사용자가 버튼을 누르면 다음 페이지로 넘어가 버립니다.

**수정**：click zone에 `top: 12vh; bottom: 25vh`를 추가해，상단과 하단 25%는 차단하지 않아 iframe 내부의 중앙 ▶와 오른쪽 하단 ▶ 모두 클릭 가능하게 만듭니다.

### 문제 2 · iframe이 포커스를 가져가면 키보드 이벤트가 손실됨

사용자가 iframe을 클릭하면 포커스가 iframe에 머물러 부모 창의 ←/→ 키보드 이벤트를 받지 못합니다.

**수정**：
```js
iframe.addEventListener('load', () => {
  // 키보드 전달기 주입
  const doc = iframe.contentDocument;
  doc.addEventListener('keydown', (e) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, ... }));
  });
  // 클릭 후 포커스를 부모 창으로 되돌림
  doc.addEventListener('click', () => setTimeout(() => window.focus(), 0));
});
```

### 문제 3 · file:// vs https:// 동작 차이

로컬 file://에서 테스트한 cinematic은 배포 후에 제대로 동작하지 않을 수 있습니다，이유：
- file:// 하에서 iframe contentDocument 동일 출처
- https:// 하에서도 동일 출처(만약 host가 같다면), 하지만 audio autoplay 제한이 더 엄격함

**수정**：
- 배포 전에 `python3 -m http.server` 로 로컬 HTTP 서버에서 한 번 테스트
- BGM은 반드시 사용자가 ▶를 클릭한 뒤에 `bgm.play()`를 호출해야 하며, page-load 시 즉시 재생하지 말 것

---

## 5 · 안티 패턴 빠른 참조표

| ❌ 안티 패턴 | ✅ 권장 패턴 |
|---|---|
| 기본 = 검은 화면 ▶ overlay | 기본 = 정적 dashboard, ▶는 보조 |
| 4개 step 가로로 같은 화면에 fade in | 5개 scene 전체 화면 전환, 각 장면은 한 가지에만 focus |
| 템플릿 재사용해 문구만 바꿔 다른 demo 제작 | 각 demo마다 독립적인 시각 언어（문구만으로 구분 가능） |
| emoji / SVG 손그림을 소재로 사용 | gpt-image-2 대형 이미지 + extract_grid으로 배경 제거 |
| BGM 없음, SFX 없음 | BGM + 11 SFX cues 이중 트랙 |
| setTimeout 체인으로 스케줄링 | requestAnimationFrame + 전역 타임라인 T 객체 |
| linear 애니메이션 | Expo / cubic-bezier easing |
| dev 도구 없음 | `?seek=N` + `?autoplay=1` + REPLAY 버튼 |
| iframe 내부 버튼이 부모 click zone에 의해 가로채짐 | click zone에 top/bottom margin을 추가해 버튼에 공간 확보 |

---

## 6 · 시간 예산

이 pattern에 따라, 하나의 완성된 cinematic demo（dashboard 포함）：

| 작업 | 시간 |
|---|---|
| 디자인 5-scene narrative + 비주얼 언어 | 30분（신중히, 독립성 여부 결정）|
| Dashboard 정적 레이아웃 + 내용 | 1시간 |
| Cinematic 5 scenes 구현 | 1.5시간 |
| Audio cues 타이밍 조정 + replay 버튼 | 30분 |
| Playwright 스크린샷으로 5개의 핵심 순간 검증 | 15분 |
| **데모 하나 총계** | **3-4시간** |

두 번째 demo는 프레임워크를 재사용하되 **시각 언어는 반드시 독립적**이어야 하며, 약 2-3시간이 소요됩니다.
