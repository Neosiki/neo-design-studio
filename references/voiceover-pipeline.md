# Voiceover Pipeline · 해설 기반 애니메이션

> 애니메이션을 「무성 화면 + 후반 더빙」에서 「**먼저 해설 대본을 작성하고, 오디오 실제 길이에 맞춰 화면을 구동**」하는 작업 흐름으로 업그레이드합니다。
> 적용 대상：5-20분 분량의 개념 해설 영상、튜토리얼 영상、장편 지식 교양。
>
> 연계 `references/animation-best-practices.md` 사용——이 문서는 **해설과 화면을 어떻게 맞출지**를 다룹니다，
"> animation-best-practices는 **매 프레임 장면이 어떻게 움직이는지**를 다룬다。

---

## 🛑 철칙 · 코드를 한 줄 쓰기 전에 필독

"> **아무리 강조해도 지나치지 않다：해설 애니메이션의 실패 패턴 #1은 내레이션이 붙은 PowerPoint로 만든 것이다。**

### 첫 번째 규칙 · 전체 영상은 연속적인 동작 서사이며，독립된 개별 장면들의 모음이 아니다

PowerPoint는 7장의 슬라이드입니다. 우리가 만드는 것은 **1개의 연속된 X분짜리 영화**입니다.

**정체성 전환**:
- ❌ 당신은 '7개의 scene을 만드는 것'이 아닙니다
- ✅ 당신은 '화면 위에서 하나 또는 몇 개의 hero element가 X분 동안 연기를 펼치는 것'입니다

**시각적 골격 = 하나 또는 몇 개의 전편을 관통하는 hero element**:
- 그것은 t=0에 등장하여 끝날 때까지 떠나지 않습니다
- 각 cue는 그것의 **상태 변화**(위치 / 크기 / 색상 / 원근 / 형태)이며, '새로운 요소로 교체'하는 것이 아닙니다
- scene의 경계는 대본에는 있지만, **화면에는 있어서는 안 됩니다** — 관객은 "이게 3번째 scene이다"를 알아차리지 못하고 단지 연속된 움직임만 보게 됩니다

**반례（이 skill v1 실전에서 밟은 함정 · 2026-05-10）**：
- 7개의 `<Scene>`가 각각 독립적인 layout，scene 전환 = 전체 페이지 opacity 1→0로 다음 페이지로 전환
- 각 cue = `opacity: p, transform: translateY((1-p)*30px)`（fade-up 단조롭게 사용）
- 결과：관객이 본 뒤 첫 반응은「한 장씩 넘기는 keynote 같다」，전체적인 퀄리티가 사라짐

**올바른 모드**：
- 1-2개의 hero element를 선택（예: 이 글의 demo에서는「md」「html」두 문자를 골격으로 선택해야 함）
- 이 두 문자는**시작부터 끝까지**항상 화면에 표시된다
- 각「scene」는 실제로 hero element의 한 번의 상태 변화다
  - opening：두 글자가 화면 중앙에서 마주 서 있다
  - md-side：md는 더 커지고 굵어져 화면을 차지하고，html은 구석의 작은 글씨로 물러난다；데이터가 md를 둘러싸며 쏟아진다
  - html-side：html이 주인공으로 반전한다；md는 구석으로 물러난다
  - the-real-question：두 글자가 중앙으로 돌아오지만，중간에「≠」기호가 나타나 분리된다
  - the-split：두 글자가 양쪽으로 밀려나고，중간의 빈 공간이 펼쳐진다
  - activity-proof：두 글자가 timeline 위에서 교대로 깜박인다
  - closing：두 글자가 착지해 최종 정답 위치를 차지한다
- 이렇게 전체는「md와 html이 화면에서 X분 동안 재생되는 것」，7장의 독립된 PPT가 아니다

**최소 구현 뼈대**（직접 복사·수정）：

```jsx
// ── Step 1: hero의 각 scene에 대한 목표 상태 정의（위치/크기/불투명도）──
const HERO_KEYS = {
  opening:    { md: { x: 50, y: 35, scale: 1.0, opacity: 1 }, html: { x: 50, y: 65, scale: 1.0, opacity: 1 } },
  'md-side':  { md: { x: 78, y: 50, scale: 1.6, opacity: 1 }, html: { x: 92, y: 8,  scale: 0.25, opacity: 0.4 } },
  'html-side':{ md: { x: 8,  y: 8,  scale: 0.25, opacity: 0.4 }, html: { x: 22, y: 50, scale: 1.6, opacity: 1 } },
  // ... 각 구간마다 하나의 entry, 연속적인 동작은 이전 구간의 final → 현재 구간의 from
};

// ── Step 2: easing + lerp 도구 ──
const expoOut = t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPos = (from, to, t) => ({
  x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t),
  scale: lerp(from.scale, to.scale, t),
  opacity: lerp(from.opacity ?? 1, to.opacity ?? 1, t),
});

// ── Step 3: HeroAnchor 컴포넌트 —— 직접 <NarrationStage>의 자식으로 붙이고, <Scene> 안에 넣지 않음 ──
const HeroAnchor = () => {
  const { time, scene, timeline } = useNarration();
  if (!scene) return null;
  const idx = timeline.scenes.findIndex(s => s.id === scene.id);
  const prevId = idx > 0 ? timeline.scenes[idx - 1].id : scene.id;
  const from = HERO_KEYS[prevId];
  const to   = HERO_KEYS[scene.id];

  // 구간 내 앞 ~45% 시간은 prev 상태에서 morph하여 본 구간 상태로 전환하는 데 사용되고, 나머지는 hold
  const transitionDur = Math.min(2.0, scene.duration * 0.45);
  const t = expoOut(Math.min(1, (time - scene.start) / transitionDur));
  const md   = lerpPos(from.md,   to.md,   t);
  const html = lerpPos(from.html, to.html, t);

  // subtle breathing을 추가해 어떤 프레임에도 움직임이 있도록 함（철칙 세 번째 항목에 해당）
  const breath = 1 + Math.sin(time * 0.6) * 0.012;

  const renderHero = (label, pos, color) => (
    <div style={{
      position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
      transform: `translate(-50%, -50%) scale(${pos.scale * breath})`,
      opacity: pos.opacity, color, fontSize: 360, fontWeight: 800,
      lineHeight: 1, willChange: 'transform, opacity', pointerEvents: 'none',
    }}>{label}</div>
  );
  return <>
    {renderHero('md',   md,   '#1B4965')}
    {renderHero('html', html, '#C04A1A')}
  </>;
};

// ── Step 4: 주요 컴포넌트 —— hero는 NarrationStage의 자식이며, scene 내부 보조 요소는 별도 관리 ──
const App = () => (
  <NarrationStage timeline={TIMELINE} audioSrc="_narration/voiceover.mp3" width={1920} height={1080}>
    <HeroAnchor />  {/* ← scene를 가로질러 지속적으로 존재하며, 전체 시각 골격 */}
    {/* scene 내부 보조 요소는 useSceneFade로 부드럽게 페이드 인/아웃을 제어, 하드 컷 사용 금지 */}
    <MdSideAux />
    <HtmlSideAux />
    {/* ... */}
  </NarrationStage>
);
```

**완전 실행 가능한 참고 예제**：`demos/md-html-narration/md-html-demo.html`（3분 21초, 7개 구간, 21 cue, 실전에서 검증됨）

### 두 번째 조항 · 장면 간에는 「하드 컷」을 하지 말 것

| 잘못된 패턴（PowerPoint slop） | 올바른 패턴（영화적 연출） |
|---|---|
| scene A 전체 `opacity 1→0` 동시에 scene B `opacity 0→1` | scene A의 핵심 요소가 **morph로 진입**해 B로 변형（위치/크기/색상 부드럽게 변환） |
| 각 scene이 독립 layout，요소 등장/사라짐 | 요소는 화면에 **계속 존재**，단지 위치와 형태만 변함 |
| `keepMounted=false`，scene 전환 순간 컴포넌트가 언마운트됨 | hero는 `keepMounted=true`를 사용，scene 간에 DOM 노드 공유 |
| 자막 바/데이터 카드가 각자 fade in fade out | 자막 바는 화면에서 유일한 '비-hero' 입장 요소로，hold 후**hero의 움직임과 함께 퇴장** |

구현 측면：
- **공유 요소가 scene 간에 걸치도록** → hero를 `<NarrationStage>`의 직접 자식으로 올리고, **어떤 `<Scene>`에도 넣지 않기**
- `useNarration()` hook을 hero 안에서 사용해 `time`、`scene`、`isCueTriggered`를 읽고, 현재 시간에 따라 스스로 형태를 결정한다
- `<Scene>`은 해당 구간에서만 등장하는 보조 요소(데이터 카드、인용 블록 등)를 관리하는 데만 사용하고, **이 보조 요소들도 갑작스럽게 컷하지 말 것**——등장 시에는 expoOut + stagger를 사용하고, 퇴장 시에는 fade overlap으로 다음 구간과 겹치게 한다

### 제3조 · 각 프레임의 화면에는 반드시 움직임이 있어야 한다

**자가 점검 방법**：녹화 중**임의로 한 프레임을 캡처**（cue가 트리거된 그 1초는 아님）。
- 화면이「**완전히 정지**」처럼 보이면 → 틀림。돌아가서 기본적인 움직임을 추가（background drift / hero subtle scale / camera pan / parallax）
- 항상 하나의**기저적 움직임**이 작동한다（설령 초점이 아니더라도）：
  - hero element의 `scale: 1 ↔ 1.02` 5초 호흡 루프
  - 배경 `translateX: 0 ↔ -20px` 느리게 이동
  - 데이터 카드가 등장한 후 `translateY`의 작은 떨림 유지(Perlin noise)
- 완전히 정적인 화면 = PowerPoint slop

### 네 번째 · Easing / Stagger / Hold은 기본 원칙

| 항목 | 필수 | 금지 |
|---|---|---|
| Easing | `expoOut` 주축(`cubic-bezier(0.16, 1, 0.3, 1)`), `overshoot` 강조, `spring` 착지 | `linear`、`ease`、CSS 기본 |
| 다중 요소 등장 | 30ms stagger(각 요소마다 30ms 지연) | 한 번에 전부 등장 |
| 핵심 cue 이전 | hold 0.3-0.5s 관객이 「보게」 (이전 요소를 먼저 0.3s 정지시킨 뒤 cue를 트리거) | 한 부분을 끝내고 무중단으로 다음 부분으로 전환 |
| 마무리 | 갑자기 멈춤，마지막 프레임 hold 1s | fade to black |

자세한 규칙은 `animation-best-practices.md`의 §1-§4를 참고하세요.

### 셀프 점검 · 첫 번째 관객 반응

완성한 뒤 한 번도 본 적 없는 사람에게 보여주거나(또는 스스로 24시간 후 다시 봤을 때), **그들의 첫 반응**은 무엇인가?

| 반응 | 등급 | 행동 |
|---|---|---|
| 「이건 내레이션이 있는 PPT」 | 실패 | 다시 만들어라 |
| 「화면이 소리에 맞춰 전환된다」 | 불합격 | 연속 서사가 부족함, hero element가 없거나 일관되게 이어지지 않음 |
| 「이게 움직여요」 | 합격 | 하지만 기억에 남을 포인트가 없음 |
| 「끝까지 보고 싶다」 | 양호 | 템포가 맞다 |
| 「이 부분은 스크린샷 찍고 싶다」 | great | 해냈어요 |

---

## 워크플로(상위 수준)

```
                ┌──────────────────────────┐
                │  해설 대본 .md（## scene + │
                │  [[cue:xx]] 핵심 문장 표시）   │
                └──────────────┬───────────┘
                               │
                  narrate-pipeline.mjs
                               │
                               ▼
            ┌──────────────────────────────┐
            │ voiceover.mp3 (이어붙인 전체 구간)  │
            │ timeline.json (실제 측정 시간)    │
            └──────────────┬───────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌─────────────────┐      ┌──────────────────┐
    │ HTML 애니메이션       │      │ 녹화 MP4 + 믹싱  │
    │ (NarrationStage)│      │ render-narration │
    │ 실방송 테이프 audio 동기화│      │ → 최종 공개 MP4   │
    └─────────────────┘      └──────────────────┘
       제공 형식 1                제공 형식 2
```

## 해설 스크립트 형식

프로젝트 디렉터리의 아무 위치에 두고, 파일명은 `script.md`를 권장：

```markdown
---
title: LLM이란 무엇인가
voice: S_JSdgdWk22   # 선택 사항, .env의 기본 음색을 덮어씀
speed: 1.0           # 선택 사항, 0.5-2.0
gap: 0.4             # 단락 간 무음 시간(초), 기본값 0.3
---

## intro
여러분 안녕하세요, 오늘은 5분 만에 LLM이 무엇인지 분명히 설명하겠습니다.

## what-is
LLM의 정식 명칭은 Large Language Model，[[cue:bigmodel]] 수천억 개의 파라미터를 가진 신경망입니다.
본질적으로는 글자 이어맞추기 예측기입니다.

## demo
예를 들어 당신이「오늘 날씨」를 입력하면，[[cue:input]] 모델은 다음 글자가 무엇일지 가장 가능성이 높은 것을 예측합니다.
[[cue:predict]]아마는「정말 좋아」，아마는「괜찮다」。
```

**규칙**：
- 단락 제목 `## scene-id` 는 영문/숫자 + 하이픈(예: `## what-is`, `## scene-1`)
- `[[cue:xx]]` **핵심 문장 중간**에 표시——스크립트 실행 시 해당 위치에서 텍스트를 잘라내며, cue 이후 그 순간이 바로 화면의 트리거 포인트입니다
- cue id는 애니메이션 HTML에서 `<Cue id="xx">`로 감지합니다
- 해설을 작성할 때 **리듬 + 짧은 문장**에 신경 쓰세요, 긴 문장은 TTS로 출력되면 밋밋해집니다

## timeline.json schema

```ts
{
  title: string,
  voice: string | null,
  speed: number,
  gap: number,
  totalDuration: number,        // voiceover.mp3 전체의 실측 초 수
  voiceover: 'voiceover.mp3',   // timeline.json에 대한 상대 경로
  scenes: [
    {
      id: string,
      start: number,            // 해당 구간이 전체 오디오에서 시작되는 시간
      end: number,
      duration: number,
      audio: 'audio/<id>.mp3',  // 이 구간의 단독 오디오(병합 전의 하위 구간은 이미 concat됨)
      text: string,             // [[cue:xx]] 표기를 제거한 전체 텍스트
      // chunks는 자막 표시의 소스——각 chunk는 cue로 잘라진 하위 구간이며, TTS 실측 시간 창을 포함함
      chunks: [
        {
          text: string,            // 하위 구간 텍스트
          start: number,           // 구간 내 상대 시간
          end: number,
          absoluteStart: number,   // 트랙 전체의 절대 시간（voiceover.mp3와 동기화）
          absoluteEnd: number,
          // words: 글자 단위 타임스탬프（TTS enable_subtitle 실측 반환，기본 포함；--no-timestamps로 비활성화）
          // 주의 text는 TN 이후의 텍스트（\"2025\"→\"이영이오\"），구두점은 앞 글자에 붙음
          words: [
            { text: string, start: number, end: number, absoluteStart: number, absoluteEnd: number }
          ],
        }
      ],
      cues: [
        {
          id: string,
          offset: number,       // 구간 내 상대 시간
          absoluteTime: number, // 구간 전체 타임라인의 절대 시간
        }
      ]
    }
  ]
}
```

`absoluteTime` 및 `absoluteStart/End`는 모두 **실제 측정값**입니다——pipeline은 구간 내 텍스트를 cue에 따라 하위 구간으로 잘라 각각 TTS 처리하며, 시간 = 앞선 하위구간들의 실측 길이를 누적한 값입니다. **문자 수로 선형 추정한 근사값이 아닙니다**。

## 자막（Subtitles）

> **자막은 기본 제공됩니다**——긴 해설 영상에 자막이 없으면 시청 유지율이 크게 떨어집니다. NarrationStage는 `<Subtitles />`를 즉시 사용할 수 있게 제공합니다。

### 사용법（한 줄）

```jsx
const { NarrationStage, Subtitles } = NarrationStageLib;
<NarrationStage timeline={TIMELINE} audioSrc="...">
  {/* 당신의 hero / scene 내용 */}
  <Subtitles />  {/* ← timeline.scenes[].chunks에서 활성 텍스트를 자동으로 가져옵니다 */}
</NarrationStage>
```

### 시각 규칙(Bilibili풍 · 반 PowerPoint)

| 항목 | 규칙 | 반례 |
|---|---|---|
| 배경 | **배경 없음**（검은 가로바 금지, backdrop-blur 금지）| 반투명 검은 배경 + blur = 자막 바가 화면을 가림 = PPT 느낌 |
| 글자색 | **밝은 배경엔 진한 먹색 `#1a1a1a` + 흰색 글로우**；어두운 배경엔 흰색 글자 + 검은 글로우 | 밝은 배경에 흰 글자+검은 외곽선 = 글자가 뭉침 |
| 글자 크기 | 32px（1080p 비디오）| <24px 알아보기 어려움，>40px 시선을 빼앗음 |
| 글꼴 | `PingFang SC` / `Noto Sans SC`(산세리프, Bilibili 표준) | 세리프 글꼴 = 영화 자막 느낌 |
| 위치 | bottom: 90px（모서리에 붙이지 않음）| 하단에 딱 붙이면 저렴해 보임 |
| 한 줄 길이 | **≤ 12-13자**（중영 혼합일 때 영어는 0.5자 계산）| >15자 한 줄이면 모바일에서 읽기 어렵다 |
| 문장 나누기 규칙 | **절대 마침표를 넘겨 끊지 않음**：먼저 `。！？`로 문장 분리하고, 각 문장은 다시 `，、；：`로 병합하여 ≤maxLen에 맞춤 | 글자 수로 강제로 자르면, 「이것은 좋은」을 「이것은 좋」+「은」로 자름 |

`<Subtitles />`는 위 규칙에 따라 기본 동작하므로 props를 전달할 필요가 없습니다. 어두운 배경에서는 다음과 같이 사용합니다: `<Subtitles color="#fff" haloColor="rgba(0,0,0,0.85)" />`.

### 카라오케 모드（글자 단위 하이라이트）

```jsx
<Subtitles karaoke />                          {/* 읽은 글자마다 브랜드 오렌지로 변함 #e8590c */}
<Subtitles karaoke karaokeColor="#0a84ff" />   {/* 하이라이트 색상 사용자 지정 */}
```

- timeline chunks 안의 `words` 글자 단위 타임스탬프에 의존합니다(narrate-pipeline.mjs이 기본 출력하며, 두바오 TTS v3 `enable_subtitle`과 2.0 리소스가 필요하고 중국어·영어만 지원).
- 한 줄 전체 표시, 글자별 색상 변경, 행 분할 재사용 ≤maxLen + 마침표를 넘지 않는 규칙（words로 행을 구성하며, 발음과 엄격히 일치）
- chunk words가 없을 때 자동으로 일반 chunk 모드로 되돌아가며，호출자는 별도 판단이 필요 없습니다

### 문장 분할 알고리즘（이미 narration_stage.jsx에 내장되어 있음）

```js
splitChunkToLines(text, maxLen = 13)
// 1. 강한 구두점으로 문장 분할（。！？\n）
// 2. 각 문장이 ≤ maxLen이면 그대로 유지
// 3. 그렇지 않으면 약한 구두점（，、；：）으로 자르고 ≤ maxLen 이하가 되도록 병합
// 4. 최후수단으로 강제 분할（드물게）
// 중영 혼합：영어/숫자는 0.5자 시각적 너비로 계산
```

만약 chunk를 분할한 뒤 어떤 줄이 현저히 너무 길거나 짧다면，**해설 원고의 cue 위치를 변경하세요**（cue가 구간을 더 세분화합니다），프론트엔드에서 문장 분할 로직을 조정하지 마세요。

## NarrationStage API

```jsx
import 'assets/narration_stage.jsx';
const { NarrationStage, Scene, Cue, useNarration } = NarrationStageLib;

<NarrationStage
  timeline={TIMELINE}                  // timeline.json 내용
  audioSrc=\"_narration/voiceover.mp3\"  // 현재 HTML 파일에 대한 상대 경로
  width={1920} height={1080}
  background="#f5f1e8"
  controls={true}                      // 실제 재생 중 하단 재생 바를 표시
>
  {/* hero element：scene 간에 지속 존재 —— NarrationStage의 자식으로 직접 배치 */}
  <HeroAnchor />

  {/* scene 내 보조 요소：해당 구간에서만 나타남 */}
  <Scene id="intro">
    <Cue id="bigmodel">{(triggered, progress) => (
      <SomeElement style={{ opacity: progress }} />
    )}</Cue>
  </Scene>
</NarrationStage>
```

**Hooks**：
- `useNarration()` 반환 `{ time, scene, sceneTime, isCueTriggered, cueProgress }`
- 커스텀 컴포넌트에서 직접 읽으면 되며, props로 전달할 필요 없음

**Scene 컴포넌트**：
- 기본적으로 `scene.id === id` 일 때만 마운트됨
- `keepMounted`를 추가하면 계속 마운트됨（씬 간 애니메이션이 연속될 때 사용）

**Cue 컴포넌트**：
- children은 반드시 `(triggered, progress) => ReactNode` 여야 함
- progress는 cue가 트리거된 후 0→1로 변화하는 점진적 값（기본 0.6s ramp）

## 시간 소스（이중 트랙）

NarrationStage는 자동으로 `window.__recording`을 감지합니다：
- **실제 재생 모드**（기본）：audio 요소의 currentTime을 따라가며，사용자가 일시정지/드래그로 seek해도 동기화됩니다
- **비디오 녹화 모드**（render-video.js에서 `window.__recording = true`로 설정）：rAF wall-clock이 자체 구동하여 0부터 시작하고，`window.__seek(t)`를 render-video.js에 노출해 재설정합니다

## 세 개의 스크립트

| 스크립트 | 입력 | 출력 |
|---|---|---|
| `scripts/cloud/tts-doubao.mjs` | 단일 텍스트 | 단일 mp3 + 실측 재생 시간 |
| `scripts/narrate-pipeline.mjs` | 나레이션 원고 .md | voiceover.mp3 + timeline.json |
| `scripts/mix-voiceover.sh` | 비디오 + voiceover.mp3 [+ BGM] | 오디오 포함 MP4 |
| `scripts/render-narration.sh` | 해설 HTML + timeline.json | 최종 MP4(녹화 + 믹싱 일괄처리) |

## .env 설정

> ⚠️ TTS는 선택형 클라우드 기능입니다. 해설 원고 텍스트는 두바오 TTS 공식 API(openspeech.bytedance.com)로 전송됩니다.
> 본인의 key를 사용하세요. 스크립트를 처음 호출할 때는 `--yes` 또는 `DESIGN_CLOUD_OK=1`로 명시적으로 확인해야 합니다.
> endpoint는 ByteDance 공식 도메인 허용 목록을 강제로 검증합니다. 데이터 흐름 선언은 저장소 루트의 `SECURITY.md`를 참조하세요.

skill 루트 디렉터리의 `.env`（이미 gitignore 처리됨）：

```
DOUBAO_TTS_API_KEY=<your_api_key>
DOUBAO_TTS_VOICE_ID=zh_female_xiaohe_uranus_bigtts
DOUBAO_TTS_ENDPOINT=https://openspeech.bytedance.com/api/v3/tts/unidirectional
```

콘솔의 App ID + Access Token으로 인증할 수도 있습니다：

```
DOUBAO_APP_ID=<your_app_id>
DOUBAO_ACCESS_KEY=<your_access_token>
DOUBAO_TTS_VOICE_ID=zh_female_xiaohe_uranus_bigtts
```

`DOUBAO_TTS_RESOURCE_ID`는 음색에 따라 기본값을 자동 추론합니다. `S_` 복제 음색에는 `seed-icl-1.0`, `uranus` 공식 음색에는 `seed-tts-2.0`, 그 밖의 공식 음색에는 `seed-tts-1.0`을 사용합니다.

## 표준 워크플로（10 단계）

1. **해설 원고 작성**：해설 원고는 소스 코드입니다。먼저 전체 음성 원고를 완성하고，단락 제목은 `## scene-id`로 표시하며，핵심 문장 앞에 `[[cue:xx]]`를 추가하세요
2. **narrate-pipeline 실행**: `node scripts/narrate-pipeline.mjs --script script.md --out-dir _narration --yes`(`--yes`는 텍스트가 두바오 TTS로 전송되는 것을 확인)
3. **voiceover.mp3 전체 청취**：리듬이 맞지 않으면 원고로 돌아가 수정하세요。**이 단계가 전체 영상의 품질 상한을 결정합니다**
4. **🛑 설계 전에 철칙에 답하세요**：hero element은 무엇인가？각 장면에서 어떤 상태인가？장면을 넘을 때 어떻게 morph하나？답할 수 없으면 코드를 작성하지 마세요
5. **애니메이션 HTML 작성**：NarrationStage + 하나 또는 여러 hero element로 scene을 넘나들며 연출하세요
6. **실제 재생 미리보기**：브라우저에서 HTML을 열고 ▶ Play를 클릭해 영상과 해설의 동기화를 확인하세요
7. **최초 관객 자기검사**：위의「자기검사 · 최초 관객 반응」표로 점수를 매기세요。실패하면 Step 4로 돌아가 다시 하세요
8. **비디오 녹화**：`bash scripts/render-narration.sh demo.html --timeline=_narration/timeline.json`（무음 MP4를 자동으로 녹화하고 voiceover를 합침）
9. **선택적 BGM**：render-narration에 `--bgm-mood=educational` 추가（또는 tech / tutorial 등）
10. **전달물**：브라우저 HTML（실시간 데모용）+ 최종 MP4（배포용）

## 문제 해결

| 문제 | 해결 |
|---|---|
| TTS API 오류 | .env의 `DOUBAO_TTS_API_KEY` 또는 `DOUBAO_APP_ID` + `DOUBAO_ACCESS_KEY`가 올바른지 확인 |
| 일부 구간의 오디오가 대본보다 길거나 짧음 | 해당 구간 텍스트에 이상한 구두점이나 emoji가 있어 TTS 파싱 오류 → 원고 수정 |
| cue absoluteTime이 정확하지 않음 | 구간 내 서브구간을 이어붙일 때 ffmpeg 문제가 있을 수 있음 → mp3 인코딩 일관성 확인 |
| 녹화 영상이 검은 화면임 | render-video.js가 `window.__ready` 신호를 받지 못함 → NarrationStage가 정상적으로 마운트되어 있는지 확인 |
| 녹화 영상이 끊김 | 애니메이션에서 레이아웃 재계산이 많음(대량의 box-shadow / blur) → 단순화하거나 사전 합성 |
| 실시간 재생에서 영상과 오디오가 맞지 않음 | audio 요소 로딩 지연 → `preload="auto"`를 추가하거나 로컬에서 미리 로드 |

## 언제 이 파이프라인을 사용하지 않나요

- **<60s 단편 애니메이션**：무음 애니메이션을 바로 만들고 후처리로 음성(add-music.sh + 별도의 TTS 한 건)을 추가하면 충분하며, timeline 구동은 필요 없음
- **순수 BGM 비디오**：`add-music.sh`로 프리셋 BGM 추가
- **실제 녹음으로 TTS 대체**：`voiceover.mp3`를 실제 녹음으로 교체, 타임라인은 직접 작성하거나 ffprobe로 구간 길이 측정 + 도구 스크립트로 생성 → 나머지 흐름은 공통

---

**마지막 경고**：코드 쓰기 전에 철칙으로 돌아가라. **내레이션이 들어간 PowerPoint를 만들지 마라**.
