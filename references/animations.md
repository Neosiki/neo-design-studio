# Animations: 타임라인 애니메이션 엔진

HTML 애니메이션/모션 디자인을 제작할 때 이 문서를 참고하세요. 원리, 사용법, 주요 패턴을 설명합니다.

## 핵심 패턴: Stage + Sprite

우리의 애니메이션 시스템(`assets/animations.jsx`) 타임라인 기반 엔진을 제공합니다:

- **`<Stage>`**：전체 애니메이션 컨테이너, auto-scale(fit viewport) + scrubber + play/pause/loop 컨트롤 자동 제공`<Sprite start end>`**: 시간 세그먼트. 하나의 Sprite는 오직`start`~까지`end`이 기간 동안 표시됩니다. 내부적으로는 다음을 통해 가능합니다.`useSprite()`hook으로 자신의 로컬 진행도 읽기`t` (0→1)
- **`useTime()`**현재 글로벌 시간 읽기(초)**
- **`Easing.easeInOut` / `Easing.easeOut`/ ...**: 이징 함수
- **`interpolate(t, from, to, easing?)`**: t 보간 기반

이 패턴은 Remotion/After Effects의 방식을 참고했지만, 가볍고 의존성이 없습니다.

## 시작하기```html
<script type="text/babel" src="animations.jsx"></script>
<script type="text/babel">
  const { Stage, Sprite, useTime, useSprite, Easing, interpolate } = window.Animations;

  function Title() {
    const { t } = useSprite();  // 로컬 진행도 0→1
    const opacity = interpolate(t, [0, 1], [0, 1], Easing.easeOut);
    const y = interpolate(t, [0, 1], [40, 0], Easing.easeOut);
    return (
      <h1 style={{ 
        opacity, 
        transform: `translateY(${y}px)`,
        fontSize: 120,
        fontWeight: 900,
      }}>
        Hello.
      </h1>
    );
  }

  function Scene() {
    return (
      <Stage duration={10}>  {/* 10초 애니메이션 */}
        <Sprite start={0} end={3}>
          <Title />
        </Sprite>
        <Sprite start={2} end={5}>
          <SubTitle />
        </Sprite>
        {/* ... */}
      </Stage>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<Scene />);
</script>
```
## 자주 사용하는 애니메이션 패턴

### 1. Fade In / Fade Out```jsx
function FadeIn({ children }) {
  const { t } = useSprite();
  const opacity = interpolate(t, [0, 0.3], [0, 1], Easing.easeOut);
  return <div style={{ opacity }}>{children}</div>;
}
```
**주의 범위**:`[0, 0.3]`Sprite의 앞부분 30% 시간 동안 페이드 인을 완료하고, 이후에는 opacity=1을 유지한다는 의미입니다.

### 2. Slide In```jsx
function SlideIn({ children, from = 'left' }) {
  const { t } = useSprite();
  const progress = interpolate(t, [0, 0.4], [0, 1], Easing.easeOut);
  const offset = (1 - progress) * 100;
  const directions = {
    left: `translateX(-${offset}px)`,
    right: `translateX(${offset}px)`,
    top: `translateY(-${offset}px)`,
    bottom: `translateY(${offset}px)`,
  };
  return (
    <div style={{
      transform: directions[from],
      opacity: progress,
    }}>
      {children}
    </div>
  );
}
```
### 3. 타이핑 효과 (⚠️ 먼저 두 가지 시나리오를 구분하세요. 글자 단위로 끊어지는 방식은 지양해야 합니다.)

일정한 속도의 글자 단위 Typewriter 방식은 공식적인 안티 패턴입니다(best-practices 「AI slop」 목록: 고전 영화 자막 같은 느낌). 콘텐츠에 따라 올바른 해결책을 선택하세요:

- **AI 출력**(토큰 스트리밍 방식) → Chunk Reveal: 불규칙한 덩어리 단위 노출, 참고:`animation-best-practices.md` §4.5 / `gsap-recipes.md`§3.4
- **사용자 입력**(실제 사용자가 입력창에 타이핑) → 3f/자 + 커서 점등에서 점멸로 전환 + 간헐적 백스페이스, 참조:`ui-demo-animation.md` 8식③

### 4. 숫자 카운팅```jsx
function CountUp({ from = 0, to = 100, duration = 0.6 }) {
  const { t } = useSprite();
  const progress = interpolate(t, [0, duration], [0, 1], Easing.easeOut);
  const value = Math.floor(from + (to - from) * progress);
  return <span>{value.toLocaleString()}</span>;
}
```
### 5. 단계별 설명 (대표적인 교육용 애니메이션)```jsx
function Scene() {
  return (
    <Stage duration={20}>
      {/* Phase 1: 문제 제시 */}
      <Sprite start={0} end={4}>
        <Problem />
      </Sprite>

      {/* Phase 2: 풀이 아이디어 제시 */}
      <Sprite start={4} end={10}>
        <Approach />
      </Sprite>

      {/* Phase 3: 결과 제시 */}
      <Sprite start={10} end={16}>
        <Result />
      </Sprite>

      {/* 전체 표시되는 자막 */}
      <Sprite start={0} end={20}>
        <Caption />
      </Sprite>
    </Stage>
  );
}
```
## Easing 함수

사전 정의된 easing curves:

| Easing | 특성 | 용도 |
|--------|------|------|`linear`| 등속 | 스크롤 자막, 지속 애니메이션 |
|`easeIn`| 느림→빠름 | 퇴장 사라짐 |
|`easeOut`| 빠름→느림 | 등장 |
|`easeInOut` | 느림→빠름→느림 | 위치 변화 |
| **`expoOut`** ⭐ | **지수 감속** | **Anthropic급 메인 easing** (물리적 무게감) |`overshoot`** ⭐ | **탄성 리바운드** | **Toggle / 버튼 팝업 / 강조 인터랙션** |`spring`| 스프링 | 인터랙션 피드백, 지오메트리 복귀 |
|`anticipation`| 역방향 후 정방향 | 동작 강조 |

**기본 메인 easing은`expoOut`**（아님  `easeOut`) — 참조`animation-best-practices.md`§2. 입장용`expoOut`, 등장용`easeIn`、toggle 용`overshoot`——Anthropic 수준 애니메이션의 기초 법칙.

## 리듬 및 지속 시간 가이드

### 마이크로 인터랙션 (0.1-0.3초)
- 버튼 호버(hover)
- 카드 확장(expand)
- 툴팁(Tooltip) 표시

### UI 트랜지션 (0.3-0.8초)
- 페이지 전환
- 모달 창 표시
- 리스트 아이템 추가

### 내러티브 애니메이션 (구간당 2-10초)
- 개념 설명의 한 단계(phase)
- 데이터 차트의 리빌(reveal)
- 장면 전환

### 단일 내러티브 애니메이션은 최대 10초를 초과하지 않음
인간의 주의력은 한계가 있습니다. 10초 동안 한 가지 사실을 전달하고, 완료되면 다음으로 넘어갑니다.

## 애니메이션 디자인 사고 순서

### 1. 콘텐츠/스토리가 먼저, 애니메이션은 그다음

**오류**: 화려한(fancy) 애니메이션을 먼저 구상하고 콘텐츠를 끼워 넣는 것
**올바른 예**: 전달하려는 정보가 무엇인지 명확히 한 뒤, 애니메이션 수단을 통해 그 정보를 제공(serve)하는 것

애니메이션은 **시그널(signal)**이지 **장식**이 아닙니다. 페이드 인(fade-in)은 "여기가 중요하니 주목하세요"라는 점을 강조합니다. 모든 것에 페이드 인을 적용하면 시그널은 효력을 잃습니다.

### 2. 씬(Scene)별 타임라인 작성```
0:00 - 0:03   문제 등장（fade in）
0:03 - 0:06   문제 확대/전개（zoom+pan）
0:06 - 0:09   해법 등장（slide in from right）
0:09 - 0:12   해법 전개 설명（typewriter）
0:12 - 0:15   결과 시연（counter up + chart reveal）
0:15 - 0:18   한 문장 요약（static, 3초 동안 표시）
0:18 - 0:20   CTA 또는 fade out
```
타임라인을 먼저 작성한 후 컴포넌트를 작성하세요.

### 3. 리소스 우선 준비

애니메이션에 사용할 이미지/아이콘/폰트를 **먼저** 준비하세요. 작업 중간에 소재를 찾지 마세요. 흐름이 끊깁니다.

## 자주 묻는 질문

**애니메이션 끊김 현상**
→ 주로 layout thrashing 때문입니다. 다음을 사용하세요:`transform`및`opacity`, 수정하지 마세요`top`/`left`/`width`/`height`/`margin`. 브라우저 GPU 가속`transform`。

**애니메이션이 너무 빨라 알아보기 힘든 경우**
→ 사람은 한 글자를 읽는 데 100~150ms, 한 단어에는 300~500ms가 필요합니다. 텍스트로 이야기를 전달한다면 한 문장당 최소 3초는 유지해야 합니다.

**애니메이션이 너무 느려 지루한 경우**
→ 흥미로운 시각적 변화가 조밀하게 배치되어야 합니다. 정지 화면이 5초 이상 지속되면 지루해집니다.

**여러 애니메이션이 서로 영향을 주는 경우**
→ CSS의`will-change: transform`브라우저에 이 요소가 변경될 것임을 미리 알려 reflow를 줄입니다.

**비디오로 녹화**
→ skill 자체 도구 체인 사용(명령어 하나로 세 가지 형식 생성): 다음 참고`video-export.md`
- `scripts/render-video.js` — HTML → 25fps MP4（Playwright + ffmpeg）
- `scripts/convert-formats.sh`— 25fps MP4 → 60fps MP4 + GIF 최적화
- 더 정밀한 프레임 렌더링을 원하시나요? render(t)를 pure function으로 만드세요. 다음을 참조:`animation-pitfalls.md`제 5 조

## 비디오 도구와의 연동

이 Skill은 **HTML 애니메이션**(브라우저에서 실행됨)을 제작합니다. 최종 결과물을 영상 소재로 사용하려는 경우:

- **짧은 애니메이션/컨셉 데모**: 이 방식대로 HTML 애니메이션 제작 → 화면 녹화
- **긴 영상/내러티브**(5~20분 분량의 해설 포함): SKILL.md Step 9.5 해설 기반 파이프라인(`voiceover-pipeline.md`), 다른 도구로 넘기지 않음
- **motion graphics**: 전문적인 After Effects/Motion Canvas가 더 적합함

## 물리 애니메이션(spring / decay)이 필요할 때

Popmotion을 도입하지 마세요 (제한된 네트워크에서 CDN은 반드시 실패하며, 자기 완결성 원칙에 위배됨. 다음 참조:`animation-pitfalls.md`#17). spring 요구사항은 GSAP으로 처리:`elastic.out` / `back.out`및 사용자 정의 springEase 매핑은 다음을 참조하십시오.`gsap-recipes.md`§1.2；착지 후 잔진동에 dampedSettle 폐쇄형 해를 사용（`camera-language.md` §9）。
