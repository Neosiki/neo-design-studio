# Animation Pitfalls: HTML 애니메이션에서 밟은 함정과 규칙

애니메이션을 만들 때 가장 자주 만나는 버그와 피하는 방법. 모든 규칙은 실제로 터진 사례에서 나왔다.

애니메이션을 쓰기 전에 이 문서를 다 읽으면 이터레이션 한 바퀴를 줄인다.

## 1. 겹친 레이아웃 — `position: relative`는 기본 의무다

**밟은 함정**: sentence-wrap 하나가 bracket-layer 3개(`position: absolute`)를 감쌌다. sentence-wrap에 `position: relative`를 주지 않아서 absolute인 bracket이 `.canvas`를 좌표계로 잡고 화면 아래 200px 밖으로 날아갔다.

**규칙**:
- `position: absolute` 자식을 가진 컨테이너는 **반드시** `position: relative`를 명시한다
- 시각적으로 「오프셋」이 필요 없어도 좌표계 기준점으로서 `position: relative`를 쓴다
- `.parent { ... }`를 쓰고 있고 그 자식에 `.child { position: absolute }`가 있다면, 반사적으로 parent에 relative를 붙인다

**빠른 점검**: `position: absolute`가 하나 나올 때마다 조상을 위로 세어 올라가서, 가장 가까운 positioned 조상이 *의도한* 좌표계인지 확인한다.

## 2. 문자 함정 — 희귀 유니코드에 의존하지 않는다

**밟은 함정**: `␣` (U+2423 OPEN BOX)로 「공백 token」을 시각화하려 했다. Noto Serif SC / Cormorant Garamond 둘 다 이 글자를 갖고 있지 않아서 공백/두부로 렌더링되고, 보는 사람 눈에는 아무것도 안 보였다.

**규칙**:
- **애니메이션에 등장하는 모든 글자는 선택한 글꼴 안에 실제로 있어야 한다**
- 흔한 희귀 문자 블랙리스트: `␣ ␀ ␐ ␋ ␨ ↩ ⏎ ⌘ ⌥ ⌃ ⇧ ␦ ␖ ␛`
- 「공백 / 엔터 / 탭」 같은 메타 문자를 나타내려면 **CSS로 만든 의미 박스**를 쓴다:
  ```html
  <span class="space-key">Space</span>
  ```
  ```css
  .space-key {
    display: inline-flex;
    padding: 4px 14px;
    border: 1.5px solid var(--accent);
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.3em;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  ```
- 이모지도 검증한다. Noto Emoji 밖의 글꼴에서는 회색 네모로 폴백하는 이모지가 있으니 `emoji` font-family나 SVG를 쓰는 편이 안전하다

## 3. 데이터로 움직이는 Grid/Flex 템플릿

**밟은 함정**: 코드에서는 token이 `const N = 6`인데 CSS는 `grid-template-columns: 80px repeat(5, 1fr)`로 박아뒀다. 6번째 token에 column이 없어서 행렬 전체가 어긋났다.

**규칙**:
- count가 JS 배열에서 온다면(`TOKENS.length`) CSS 템플릿도 데이터로 움직여야 한다
- 방법 A: CSS 변수로 JS에서 주입한다
  ```js
  el.style.setProperty('--cols', N);
  ```
  ```css
  .grid { grid-template-columns: 80px repeat(var(--cols), 1fr); }
  ```
- 방법 B: `grid-auto-flow: column`으로 브라우저가 알아서 늘리게 한다
- **「고정 숫자 + JS 상수」 조합은 금지한다**. N을 바꿔도 CSS는 따라오지 않는다

## 4. 전환 끊김 — 장면 전환은 이어져야 한다

**밟은 함정**: zoom1 (13-19s) → zoom2 (19.2-23s) 사이에서 주 문장은 이미 hidden, zoom1 fade out(0.6s) + zoom2 fade in(0.6s) + stagger delay(0.2s+) = 약 1초가 완전히 빈 화면이었다. 보는 사람은 애니메이션이 멈췄다고 생각한다.

**규칙**:
- 장면을 연달아 바꿀 때 fade out과 fade in은 **겹쳐야** 한다. 앞 장면이 완전히 사라진 다음에 다음 장면을 시작하는 게 아니다
  ```js
  // 나쁨:
  if (t >= 19) hideZoom('zoom1');      // 19.0s out
  if (t >= 19.4) showZoom('zoom2');    // 19.4s in → 사이에 0.4s 공백

  // 좋음:
  if (t >= 18.6) hideZoom('zoom1');    // 0.4s 먼저 fade out 시작
  if (t >= 18.6) showZoom('zoom2');    // 동시에 fade in (cross-fade)
  ```
- 아니면 「기준점 역할을 하는 요소」(예: 주 문장)를 장면 사이의 시각적 연결로 쓴다. zoom이 바뀌는 동안 잠깐 다시 보여준다
- CSS transition의 duration까지 계산에 넣어서, transition이 끝나기 전에 다음 것이 시작되지 않게 한다

## 5. Pure Render 원칙 — 애니메이션 상태는 seek 가능해야 한다

**밟은 함정**: `setTimeout` + `fireOnce(key, fn)`으로 애니메이션 상태를 연쇄 발동시켰다. 정상 재생은 문제없지만, 프레임 단위 녹화나 임의 시점으로 seek할 때는 이미 실행된 setTimeout을 「과거로 되돌릴」 수 없다.

**규칙**:
- `render(t)` 함수는 이상적으로 **pure function**이다. t가 주어지면 DOM 상태가 하나로 정해진다
- 부수효과(class 토글 등)를 꼭 써야 한다면 `fired` set과 명시적 reset을 함께 둔다:
  ```js
  const fired = new Set();
  function fireOnce(key, fn) { if (!fired.has(key)) { fired.add(key); fn(); } }
  function reset() { fired.clear(); /* 모든 .show class 제거 */ }
  ```
- Playwright / 디버깅용으로 `window.__seek(t)`를 노출한다:
  ```js
  window.__seek = (t) => { reset(); render(t); };
  ```
- 애니메이션 관련 setTimeout은 1초를 넘기지 않는다. 넘기면 seek로 되돌릴 때 엉킨다

## 6. 글꼴 로드 전 측정 = 잘못된 측정

**밟은 함정**: DOMContentLoaded 시점에 바로 `charRect(idx)`로 bracket 위치를 측정했다. 글꼴이 아직 로드되지 않아서 글자 폭이 전부 폴백 글꼴 기준이고 위치가 다 틀렸다. 글꼴이 로드된 뒤(약 500ms 후)에도 bracket의 `left: Xpx`는 옛 값 그대로, 영구히 어긋난다.

**규칙**:
- DOM 측정(`getBoundingClientRect`, `offsetWidth`)에 의존하는 레이아웃 코드는 **반드시** `document.fonts.ready.then()` 안에 넣는다
  ```js
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      buildBrackets(...);  // 이 시점에 글꼴이 준비되어 측정이 정확하다
      tick();              // 애니메이션 시작
    });
  });
  ```
- `requestAnimationFrame`을 한 겹 더 두면 브라우저가 layout을 커밋할 한 프레임을 준다
- Google Fonts CDN을 쓴다면 `<link rel="preconnect">`로 첫 로드를 앞당긴다

## 7. 녹화 준비 — 영상 내보내기용 손잡이를 미리 남긴다

**밟은 함정**: Playwright `recordVideo`는 기본 25fps이고 context를 만든 순간부터 녹화한다. 페이지 로드와 글꼴 로드에 쓰인 앞 2초가 그대로 들어간다. 납품한 영상 앞머리가 2초 공백/흰 화면이었다.

**규칙**:
- `render-video.js` 도구로 처리한다: warmup navigate → reload로 애니메이션 재시작 → duration 대기 → ffmpeg로 head trim + H.264 MP4 변환
- 애니메이션의 **0번째 프레임**은 최종 레이아웃이 다 자리 잡은 완전한 초기 상태여야 한다(공백이나 로딩 중이 아니다)
- 60fps가 필요하면? ffmpeg `minterpolate`로 후처리한다. 브라우저 원본 프레임레이트를 기대하지 않는다
- GIF가 필요하면? 2단계 palette(`palettegen` + `paletteuse`)를 쓴다. 30s 1080p 애니메이션을 3MB까지 줄일 수 있다

전체 스크립트 호출 방법은 `video-export.md`를 본다.

## 8. 일괄 내보내기 — tmp 디렉터리에는 PID를 붙여 동시 실행 충돌을 막는다

**밟은 함정**: `render-video.js` 프로세스 3개로 HTML 3개를 동시에 녹화했다. TMP_DIR 이름이 `Date.now()`뿐이라 3개가 같은 밀리초에 시작하면 같은 tmp 디렉터리를 공유한다. 먼저 끝난 프로세스가 tmp를 지우고, 남은 둘은 디렉터리를 읽다가 `ENOENT`로 전부 죽었다.

**규칙**:
- 여러 프로세스가 공유할 수 있는 임시 디렉터리 이름에는 **PID나 난수 접미사**를 반드시 넣는다:
  ```js
  const TMP_DIR = path.join(DIR, '.video-tmp-' + Date.now() + '-' + process.pid);
  ```
- 정말 여러 파일을 병렬로 돌리고 싶으면 node 스크립트 안에서 fork하지 말고 셸의 `&` + `wait`을 쓴다
- 여러 HTML을 일괄 녹화할 때 안전한 쪽은 **직렬** 실행이다(2개까지는 병렬도 괜찮고, 3개 이상은 얌전히 줄 세운다)

## 9. 녹화 화면에 진행 바/리플레이 버튼 — chrome 요소가 영상을 오염시킨다

**밟은 함정**: 애니메이션 HTML에 사람이 재생을 디버깅하기 편하도록 `.progress` 진행 바, `.replay` 리플레이 버튼, `.counter` 타임스탬프를 넣었다. MP4로 녹화해 납품하니 이 요소들이 영상 하단에 그대로 나와서, 개발자 도구를 화면에 같이 찍은 것처럼 보였다.

**규칙**:
- HTML에서 사람용 「chrome 요소」(progress bar / replay button / footer / masthead / counter / phase label)와 영상 내용 본체를 분리해서 관리한다
- **class 이름을 약속한다**: `.no-record`. 이 class가 붙은 요소는 녹화 스크립트가 자동으로 숨긴다
- 스크립트 쪽(`render-video.js`)은 기본으로 흔한 chrome class를 숨기는 CSS를 주입한다:
  ```
  .progress .counter .phases .replay .masthead .footer .no-record [data-role="chrome"]
  ```
- Playwright의 `addInitScript`로 주입한다(navigate마다 먼저 적용되므로 reload에도 안정적이다)
- 원래 HTML을 chrome까지 그대로 보고 싶으면 `--keep-chrome` flag를 붙인다

## 10. 녹화 앞 몇 초에 애니메이션이 반복된다 — Warmup 프레임 누출

**밟은 함정**: `render-video.js`의 옛 흐름은 `goto → wait fonts 1.5s → reload → wait duration`이었다. 녹화는 context 생성 시점부터 시작하므로 warmup 단계에서 애니메이션이 이미 한참 재생되고, reload 후 0에서 다시 시작한다. 결과적으로 영상 앞 몇 초가 「애니메이션 중간 + 전환 + 애니메이션 0부터 시작」이 되어 반복되는 느낌이 강했다.

**규칙**:
- **Warmup과 Record는 별개의 context를 써야 한다**:
  - Warmup context(`recordVideo` 옵션 없음): url 로드, 글꼴 대기, 그리고 close만 한다
  - Record context(`recordVideo` 있음): fresh 상태에서 시작해서 animation을 t=0부터 녹화한다
- ffmpeg `-ss trim`으로는 Playwright의 startup latency(~0.3s) 정도만 자를 수 있다. warmup 프레임을 덮는 데는 **쓸 수 없다**. 원천이 깨끗해야 한다
- 녹화 context를 닫는 것 = webm 파일이 디스크에 기록되는 것. Playwright의 제약이다
- 관련 코드 패턴:
  ```js
  // Phase 1: warmup (throwaway)
  const warmupCtx = await browser.newContext({ viewport });
  const warmupPage = await warmupCtx.newPage();
  await warmupPage.goto(url, { waitUntil: 'networkidle' });
  await warmupPage.waitForTimeout(1200);
  await warmupCtx.close();

  // Phase 2: record (fresh)
  const recordCtx = await browser.newContext({ viewport, recordVideo });
  const page = await recordCtx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(DURATION * 1000);
  await page.close();
  await recordCtx.close();
  ```

## 11. 화면 안에 「가짜 chrome」을 그리지 않는다 — 장식용 player UI가 진짜 chrome과 충돌한다

**밟은 함정**: 애니메이션이 `Stage` 컴포넌트를 쓰는데, 여기에는 이미 scrubber + 타임코드 + 일시정지 버튼이 들어 있다(`.no-record` chrome이라 내보낼 때 자동으로 숨는다). 그런데 화면 하단에 「`00:60 ──── CLAUDE-DESIGN / ANATOMY`」 같은 "잡지 페이지 번호 느낌의 장식 진행 바"를 또 그려 넣고 스스로 만족했다. **결과**: 사용자에게는 진행 바가 두 줄로 보였다. 하나는 Stage 컨트롤러, 하나는 내가 그린 장식. 시각적으로 완전히 충돌해서 버그로 판정됐다. 「영상 안에 진행 바가 또 있는 건 뭐죠?」

**규칙**:

- Stage는 이미 scrubber + 타임코드 + 일시정지/리플레이 버튼을 제공한다. **화면 안에 진행 표시, 현재 타임코드, 저작권 서명 띠, 챕터 카운터를 또 그리지 않는다.** chrome과 충돌하거나, 아니면 그냥 filler slop이다(「earn its place」 원칙 위반).
- 「페이지 번호 느낌」 「잡지 느낌」 「하단 서명 띠」 같은 **장식 욕구**는 AI가 자동으로 얹는 대표적 filler다. 하나 나올 때마다 경계한다. 정말 대체 불가능한 정보를 전달하는가, 아니면 빈 자리를 채우는 것뿐인가?
- 어떤 하단 띠가 반드시 있어야 한다고 확신한다면(예: 애니메이션 주제 자체가 player UI다) 그것은 **서사적으로 필요**해야 하고, **Stage scrubber와 시각적으로 뚜렷이 구분**되어야 한다(다른 위치, 다른 형태, 다른 색조).

**요소 소속 테스트**(canvas에 그려 넣는 요소는 전부 답할 수 있어야 한다):

| 무엇에 속하는가 | 처리 |
|------------|------|
| 어떤 한 장면의 서사 내용 | OK, 남긴다 |
| 전역 chrome(제어·디버깅용) | `.no-record` class를 붙여 내보낼 때 숨긴다 |
| **어느 장면에도 속하지 않고 chrome도 아니다** | **삭제.** 주인 없는 물건이고, 반드시 filler slop이다 |

**자체 점검(납품 전 3초)**: 정지 이미지 한 장을 찍고 스스로 묻는다.

- 화면에 「video player UI처럼 보이는 것」이 있나(가로 진행 바, 타임코드, 컨트롤 버튼 모양)?
- 있다면, 지웠을 때 서사가 손해를 보나? 손해가 없으면 지운다.
- 같은 종류의 정보(진행/시간/서명)가 두 번 나오지 않나? chrome 한 곳으로 합친다.

**나쁜 예**: 하단에 `00:42 ──── PROJECT NAME`, 오른쪽 아래에 "CH 03 / 06" 챕터 카운터, 화면 가장자리에 버전 번호 "v0.3.1" — 전부 가짜 chrome filler다.

## 12. 녹화 앞 공백 + 녹화 시작점 어긋남 — `__ready` × tick × lastTick 삼중 함정

**밟은 함정(A · 앞 공백)**: 60초 애니메이션을 MP4로 내보냈더니 앞 2-3초가 빈 페이지였다. `ffmpeg --trim=0.3`으로는 잘리지 않는다.

**밟은 함정(B · 시작점 어긋남, 2026-04-20 실제 사고)**: 24초 영상을 내보냈는데 사용자 체감이 「19초가 되어서야 첫 프레임이 나온다」였다. 실제로는 애니메이션 t=5부터 녹화가 시작되어 t=24까지 찍고 t=0으로 loop한 뒤 5초를 더 찍고 끝났다. 그래서 영상의 마지막 5초가 애니메이션의 진짜 시작이었다.

**근본 원인**(두 함정이 원인을 공유한다):

Playwright `recordVideo`는 `newContext()` 하는 순간부터 WebM을 쓰기 시작하고, 이때 Babel/React/글꼴 로드에 L초(2-6s)가 든다. 녹화 스크립트는 「애니메이션이 여기서 시작한다」는 기준점으로 `window.__ready = true`를 기다린다. 이 신호와 애니메이션 `time = 0`은 엄격하게 짝이어야 한다. 자주 나오는 두 가지 오류가 있다:

| 오류 | 증상 |
|------|------|
| `__ready`를 `useEffect`나 동기 setup 단계에서 설정(tick 첫 프레임보다 앞) | 녹화 스크립트는 애니메이션이 시작한 줄 알지만 WebM은 여전히 빈 페이지를 찍는 중 → **앞 공백** |
| tick의 `lastTick = performance.now()`를 **스크립트 최상위**에서 초기화 | 글꼴 로드 L초가 첫 프레임 `dt`에 들어가서 `time`이 순간 L로 뛴다 → 녹화가 전 구간 L초 지연 → **시작점 어긋남** |

**✅ 올바른 starter tick 템플릿 전문**(손으로 쓰는 애니메이션은 이 골격을 쓴다):

```js
// ━━━━━━ state ━━━━━━
let time = 0;
let playing = false;   // ❗ 기본은 정지. 글꼴 ready 후에 시작한다
let lastTick = null;   // ❗ sentinel — tick 첫 프레임에서 dt를 강제로 0으로 (performance.now()를 쓰지 않는다)
const fired = new Set();

// ━━━━━━ tick ━━━━━━
function tick(now) {
  if (lastTick === null) {
    lastTick = now;
    window.__ready = true;   // ✅ pair: 「녹화 시작점」과 「애니메이션 t=0」이 같은 프레임
    render(0);               // DOM이 준비됐음을 확실히 하려고 한 번 더 렌더 (글꼴은 이미 ready)
    requestAnimationFrame(tick);
    return;
  }
  const dt = (now - lastTick) / 1000;   // 첫 프레임 이후부터 dt가 흐른다
  lastTick = now;

  if (playing) {
    let t = time + dt;
    if (t >= DURATION) {
      t = window.__recording ? DURATION - 0.001 : 0;  // 녹화 중에는 loop하지 않고 0.001s를 남겨 마지막 프레임을 지킨다
      if (!window.__recording) fired.clear();
    }
    time = t;
    render(time);
  }
  requestAnimationFrame(tick);
}

// ━━━━━━ boot ━━━━━━
// 최상위에서 곧바로 rAF를 돌리지 않는다 — 글꼴 로드가 끝나야 시작한다
document.fonts.ready.then(() => {
  render(0);                 // 초기 화면을 먼저 그려둔다 (글꼴 준비됨)
  playing = true;
  requestAnimationFrame(tick);  // 첫 tick이 __ready와 t=0을 pair로 묶어준다
});

// ━━━━━━ seek 인터페이스 (render-video의 방어적 보정용) ━━━━━━
window.__seek = (t) => { fired.clear(); time = t; lastTick = null; render(t); };
```

**이 템플릿이 맞는 이유**:

| 지점 | 왜 이렇게 해야 하나 |
|------|-------------|
| `lastTick = null` + 첫 프레임 `return` | 「스크립트 로드부터 tick 첫 실행까지」의 L초가 애니메이션 시간에 들어가는 것을 막는다 |
| `playing = false` 기본값 | 글꼴 로드 중에 `tick`이 돌아도 time이 흐르지 않아 렌더가 어긋나지 않는다 |
| `__ready`를 tick 첫 프레임에서 설정 | 녹화 스크립트가 이 순간부터 시간을 재고, 그 화면이 애니메이션의 진짜 t=0이다 |
| `document.fonts.ready.then(...)` 안에서 tick 시작 | 폴백 글꼴 폭으로 측정하는 일을 피하고, 첫 프레임 글꼴 튐을 막는다 |
| `window.__seek` 존재 | `render-video.js`가 능동적으로 보정할 수 있게 한다 — 2차 방어선이다 |

**녹화 스크립트 쪽의 대응 방어**:
1. `addInitScript`로 `window.__recording = true` 주입(page goto보다 먼저)
2. `waitForFunction(() => window.__ready === true)`, 이 시점의 오프셋을 ffmpeg trim 값으로 기록
3. **추가로**: `__ready` 이후 능동적으로 `page.evaluate(() => window.__seek && window.__seek(0))`를 호출해 HTML이 가질 수 있는 time 오차를 강제로 0으로 만든다. 이것이 2차 방어선이고, starter 템플릿을 엄격히 지키지 않은 HTML을 상대한다

**검증 방법**: MP4를 내보낸 뒤
```bash
ffmpeg -i video.mp4 -ss 0 -vframes 1 frame-0.png
ffmpeg -i video.mp4 -ss $DURATION-0.1 -vframes 1 frame-end.png
```
첫 프레임은 애니메이션 t=0의 초기 상태여야 하고(중간도, 검은 화면도 아니다), 마지막 프레임은 애니메이션의 최종 상태여야 한다(두 번째 loop의 어느 시점이 아니다).

**참고 구현**: `assets/animations.jsx`의 Stage 컴포넌트, `scripts/render-video.js` 모두 이 프로토콜대로 구현되어 있다. 손으로 쓰는 HTML은 starter tick 템플릿을 그대로 써야 한다. 한 줄 한 줄이 구체적인 버그를 막아낸 결과다.

## 13. 녹화 중 loop 금지 — `window.__recording` 신호

**밟은 함정**: 애니메이션 Stage는 기본이 `loop=true`다(브라우저에서 결과를 보기에 편하다). `render-video.js`는 duration만큼 녹화한 뒤 여유로 300ms를 더 기다렸다가 멈추는데, 이 300ms에 Stage가 다음 루프로 들어갔다. ffmpeg `-t DURATION`으로 자를 때 마지막 0.5-1s가 다음 루프에 걸려서, 영상 끝에서 갑자기 첫 프레임(Scene 1)으로 돌아갔다. 보는 사람은 영상이 버그난 줄 안다.

**근본 원인**: 녹화 스크립트와 HTML 사이에 "지금 녹화 중이다"라는 핸드셰이크 규약이 없었다. HTML은 자기가 녹화되는 줄 모르니 브라우저 인터랙션 상황대로 계속 반복한다.

**규칙**:

1. **녹화 스크립트**: `addInitScript`에서 `window.__recording = true`를 주입한다(page goto보다 먼저):
   ```js
   await recordCtx.addInitScript(() => { window.__recording = true; });
   ```

2. **Stage 컴포넌트**: 이 신호를 알아보고 loop=false를 강제한다:
   ```js
   const effectiveLoop = (typeof window !== 'undefined' && window.__recording) ? false : loop;
   // ...
   if (next >= duration) return effectiveLoop ? 0 : duration - 0.001;
   //                                                       ↑ 0.001을 남겨 end=duration인 Sprite가 꺼지는 것을 막는다
   ```

3. **끝 Sprite의 fadeOut**: 녹화 상황에서는 `fadeOut={0}`으로 둔다. 그러지 않으면 영상 끝이 투명/어두운 색으로 서서히 사라진다. 사용자는 선명한 마지막 프레임에서 멈추기를 기대하고, 페이드아웃을 기대하지 않는다. 손으로 쓰는 HTML도 끝 Sprite는 `fadeOut={0}`을 권한다.

**참고 구현**: `assets/animations.jsx`의 Stage와 `scripts/render-video.js`에 핸드셰이크가 이미 들어 있다. 직접 만든 Stage는 `__recording` 감지를 반드시 구현해야 한다. 아니면 녹화할 때 이 함정을 반드시 밟는다.

**검증**: MP4를 내보낸 뒤 `ffmpeg -ss 19.8 -i video.mp4 -frames:v 1 end.png`으로 마지막 0.2초가 여전히 기대한 마지막 프레임인지, 다른 scene으로 갑자기 넘어가지 않았는지 확인한다.

## 14. 60fps 영상은 기본을 프레임 복제로 — minterpolate는 호환성이 나쁘다

**밟은 함정**: `convert-formats.sh`가 `minterpolate=fps=60:mi_mode=mci...`로 만든 60fps MP4가 macOS QuickTime / Safari 일부 버전에서 열리지 않았다(전부 검게 나오거나 아예 재생을 거부). VLC / Chrome은 열린다.

**근본 원인**: minterpolate가 내놓는 H.264 elementary stream에 일부 플레이어가 제대로 해석하지 못하는 SEI / SPS 필드가 들어 있다.

**규칙**:

- 60fps 기본값은 단순 `fps=60` filter(프레임 복제)를 쓴다. 호환 범위가 넓다(QuickTime/Safari/Chrome/VLC 모두 열린다)
- 고품질 보간은 `--minterpolate` flag로 명시적으로 켠다. 다만 **목표 플레이어에서 직접 테스트한 뒤** 납품한다
- 60fps 표기의 가치는 **업로드 플랫폼의 알고리즘 인식**이다(Bilibili / YouTube에서 60fps 표시가 있으면 스트림을 우선 밀어준다). CSS 애니메이션에서 체감 부드러움 향상은 미미하다
- `-profile:v high -level 4.0`을 붙여 H.264 범용 호환성을 높인다

**`convert-formats.sh`는 기본이 이미 호환 모드로 바뀌어 있다.** 고품질 보간이 필요하면 `--minterpolate` flag를 붙인다:
```bash
bash convert-formats.sh input.mp4 --minterpolate
```

## 15. `file://` + 외부 `.jsx`의 CORS 함정 — 단일 파일 납품은 엔진을 인라인해야 한다

**밟은 함정**: 애니메이션 HTML에서 `<script type="text/babel" src="animations.jsx"></script>`로 엔진을 외부에서 불렀다. 로컬에서 더블클릭으로 열면(`file://` 프로토콜) Babel Standalone이 XHR로 `.jsx`를 가져오려 하고, Chrome이 `Cross origin requests are only supported for protocol schemes: http, https, chrome, chrome-extension...`를 던진다. 페이지 전체가 검게 되는데 `pageerror`는 안 나고 console error만 나오니 "애니메이션이 안 돌았다"로 오진하기 쉽다.

HTTP server를 띄워도 구제되지 않을 수 있다. 로컬에 전역 프록시가 있으면 `localhost`도 프록시를 타고 502 / 연결 실패가 돌아온다.

**규칙**:

- **단일 파일 납품(더블클릭으로 바로 쓰는 HTML)** → `animations.jsx`를 `<script type="text/babel">...</script>` 태그 안에 **인라인**해야 한다. `src="animations.jsx"`를 쓰지 않는다
- **여러 파일 프로젝트(HTTP server를 띄워 시연)** → 외부 로드도 되지만, 납품할 때 `python3 -m http.server 8000` 명령을 분명히 적는다
- 판단 기준: 사용자에게 주는 것이 "HTML 파일"인가, "server가 필요한 프로젝트 디렉터리"인가? 앞쪽이면 인라인한다
- Stage 컴포넌트 / animations.jsx는 200줄이 넘는 일이 많다. HTML `<script>` 블록에 붙여 넣어도 전혀 문제없다. 용량을 걱정하지 않는다

**최소 검증**: 만든 HTML을 더블클릭한다. 어떤 server로도 열지 **않는다**. Stage가 애니메이션 첫 프레임을 정상적으로 보여주면 통과다.

## 16. scene마다 색이 반전되는 맥락 — 화면 안 요소에 색을 박아 넣지 않는다

**밟은 함정**: 여러 장면 애니메이션에서 `ChapterLabel` / `SceneNumber` / `Watermark`처럼 **scene을 넘어 계속 나오는** 요소에 `color: '#1A1A1A'`(진한 글자색)를 컴포넌트 안에 박아 넣었다. 앞 4개 scene은 밝은 배경이라 괜찮았는데, 5번째 검은 배경 scene에서 "05"와 워터마크가 그냥 사라졌다. 오류도 없고, 어떤 검사에도 안 걸리고, 핵심 정보가 투명해진다.

**규칙**:

- **여러 scene에서 재사용되는 화면 안 요소**(chapter 라벨 / scene 번호 / 타임코드 / 워터마크 / 저작권 띠)는 **색 값을 하드코딩하지 않는다**
- 다음 셋 중 하나로 바꾼다:
  1. **`currentColor` 상속**: 요소는 `color: currentColor`만 쓰고, 부모 scene 컨테이너가 `color: 계산값`을 설정한다
  2. **invert prop**: 컴포넌트가 `<ChapterLabel invert />`를 받아 밝고 어두움을 수동으로 바꾼다
  3. **배경색 기반 자동 계산**: `color: contrast-color(var(--scene-bg))`(CSS 4 신규 API, 또는 JS로 판단)
- 납품 전에 Playwright로 **scene마다 대표 프레임**을 뽑아, "scene을 넘나드는 요소"가 다 보이는지 눈으로 한 번 훑는다

이 함정이 잘 안 보이는 이유는 — **버그 경보가 없다는 것**이다. 사람 눈이나 OCR만 잡아낼 수 있다.

## 17. 오프라인/CDN 없는 진짜 자기완결 — React/Babel 전부 인라인, 엔진도 transpile해야 한다

**밟은 함정(2026-05 미유 홍보 애니메이션)**: 애니메이션 HTML이`<script src="https://unpkg.com/react...">` + `<script src=".../@babel/standalone">`로 CDN을 탔다. 로컬에 전역 프록시가 있어서 Playwright 녹화 시 chromium이 unpkg / Google Fonts에 붙지 못하고 전부 `net::ERR_CONNECTION_CLOSED`가 났다:

1. React/ReactDOM 미로드 → `window.React undefined`
2. Babel 미로드 → `<script type="text/babel">` 안의 JSX가 평범한 JS로 실행 → `Unexpected token '<'`

React/Babel을 고친 뒤 두 번째 함정을 밟았다. **`animations.jsx` 엔진을 평범한 `<script>`로 인라인했는데도 여전히 `Unexpected token '<'` → `window.Animations is undefined`**. 근본 원인은 **`animations.jsx` 엔진 자체가 JSX를 담고 있다**는 것이다(`Stage`/`Sprite` 컴포넌트가 `return (<div>...)`). 원래 설계가 `<script type="text/babel">`로 Babel이 변환해 로드하는 구조였다. app 코드만 transpile하고 엔진을 빼먹어서 엔진 쪽 JSX가 컴파일되지 않았다.

**규칙**(「더블클릭으로 열리고 / 오프라인이고 / Playwright로 녹화 가능한」 진짜 자기완결 단일 파일을 만들 때):

- **React + ReactDOM 로컬 인라인**: `curl`로 `react.production.min.js`(~10KB) + `react-dom.production.min.js`(~131KB)를 로컬에 내려받아 `<script>`에 inline한다. CDN을 타지 않는다
- **빌드 때 Babel로 미리 컴파일하고, 실행 때는 Babel을 싣지 않는다**: `@babel/standalone`(한 번만 내려받고 빌드에만 쓴다)으로 node에서 `Babel.transform(src,{presets:['react']}).code`를 돌려 JSX → `React.createElement`로 바꾼다. **app과 `animations.jsx` 엔진 두 덩어리 모두 transform을 통과해야 한다.** 엔진에 JSX가 있으니 빼먹으면 반드시 `Unexpected token '<'`이 난다
- **글꼴을 시스템 글꼴로 바꾼다**: Google Fonts CDN도 프록시에 끊긴다. 중국어 애니메이션은 `'PingFang SC'`(sans) / `'Songti SC'`(serif) 같은 시스템 글꼴을 써서 네트워크에 의존하지 않는다. 시스템 글꼴이면 `document.fonts.ready`가 즉시 resolve되어 녹화가 멈추지 않는다
- **이미지 소재는 base64 인라인**: `<img src="png/x.png">` 상대 경로는 `file://`에서도 렌더링되지만, 진짜로 옮겨 다니게(파일을 이동해도 이미지가 안 깨지게) 하려면 base64 data URL로 인라인한다. 큰 배경 이미지는 JPEG로 한 번 압축한 뒤 base64로 만든다
- **빌드 템플릿화**: HTML 템플릿에 `__REACT__/__REACTDOM__/__ASSETS__/__ENGINE__` token과 `type="text/jsx-source"`로 감싼 app 소스를 남기고, node 빌드 스크립트가 token을 읽어 주입한다(vendor는 그대로, 엔진+app은 Babel 통과) → 최종 단일 파일을 쓴다. 애니메이션을 고칠 때는 템플릿만 고치고 빌드를 다시 돌린다

**검증**: Playwright에서 `page.evaluate(()=>({React:typeof window.React, Animations:typeof window.Animations}))` — 둘 다 `object`여야 한다. 하나라도 `undefined`면 그에 해당하는 `<script>`가 예외를 던진 것이다(대개 transpile되지 않은 JSX다).

**함정 #15와의 관계**: #15는 「단일 파일에서 `src=`로 `.jsx`를 외부 참조하지 않는다(file:// CORS)」는 얘기다. 이 함정은 한 걸음 더 나간다. React/Babel/글꼴의 **원격 CDN도 제한된 네트워크에서는 끊긴다.** 진짜 자기완결이 되려면 전부 인라인 + 빌드 때 transpile이다.

## 18. 【HyperFrames】CSS transition + class 토글은 seek 렌더링에서 비결정적이다

CSS `transition`은 벽시계를 따라간다. 타임라인이 아니다. 프레임 단위 seek 렌더링에서는 매 프레임이 독립 스크린샷이고, transition의 중간 상태는 「이 프레임으로 seek한 뒤 벽시계로 얼마가 지났는가」에 달렸다. 완전히 비결정적이며, 시작 값에 영원히 머물 수도 있고 중간 어딘가에서 무작위로 멈출 수도 있다. c3 이관 실측(2026-07-17): `.watermark-br`에 `transition: opacity 0.6s` + class 토글을 썼더니 seek 렌더링에서 투명도가 말을 듣지 않았다.

**고치는 법**: 렌더링 경로 위의 모든 상태 변화를 tween이나 t의 순수 함수로 표현한다. 옛 demo를 이관할 때는 `transition:`을 전문 검색해서 하나씩 `render(t)` 안의 lerp로 바꾼다. 새로 쓰는 합성은 처음부터 transition을 쓰지 않는다. hover 같은 인터랙션 상태의 transition은 상관없다(렌더링할 때 발동하지 않는다).

## 19. 【HyperFrames】프록시 tween의 첫 프레임이 발동하지 않는다 — `render(0)`을 직접 채운다

프록시 tween으로 `render(t)`를 GSAP timeline에 붙일 때(옛 demo 어댑터 경로), timeline이 t=0에 멈춘 상태에서는 `onUpdate`가 호출되지 않을 수 있다. 첫 프레임이 `render(0)`의 화면이 아니라 HTML의 정적 미초기화 상태일 수 있다.

**고치는 법**: timeline을 등록한 뒤 `render(0)`을 수동으로 한 번 동기 호출한다. 전체 레시피는 `references/hyperframes-backend.md`에 있다.

## 20. 【HyperFrames】contrast 게이트가 어두운 시네마틱과 충돌한다 — `--no-contrast`를 쓰고 나머지 네 게이트는 0 error여야 한다

`npm run check`의 contrast 게이트는 WCAG AA 4.5:1로 모든 글자를 검사한다. 어두운 cinematic 디자인에서 투명도 16-40%의 워터마크, mono 라벨, 장식적 글자는 **의도한** 저대비다(영화적 느낌의 일부다). 이것들이 줄줄이 오류로 잡히는데 프레임워크에는 요소별 예외 장치가 없다. c3 실측에서 contrast error 42개가 전부 디자인 의도였다.

**고치는 법**: 어두운 시네마틱 산출물은 `npx hyperframes check --no-contrast`로 돌리고, lint/runtime/layout/motion 네 게이트는 여전히 0 error여야 한다. **밝은 배경의 정보형 산출물에서는 contrast를 건너뛰지 않는다.** 그런 경우의 오류는 대개 진짜 가독성 문제다(가독성 최저선은 SKILL.md Fallback 절을 본다).

## 21. 【HyperFrames/GSAP】fromTo의 immediateRender 유령 — 요소가 몇 초 먼저 나타난다

GSAP의 `fromTo()`는 기본이 `immediateRender: true`다. timeline을 build할 때 from 상태를 요소에 바로 렌더한다. from 상태 자체가 보이는 상태라면(`autoAlpha > 0`) 그 tween이 시작하기 전부터 요소가 화면에 나와 있다. 불꽃, 클릭 링, 물결, 먼지 같은 「짧은 특수효과」가 가장 잘 걸린다(B00 실측에서 한 번에 4곳이 걸렸다. 특수효과가 제자리에 들어올 시점보다 몇 초 앞서 화면에 걸려 있었다).

**고치는 법**: from 상태가 보이는 모든 `fromTo()`에 `immediateRender: false`를 명시한다. 또는 「set으로 초기 숨김 + to」로 바꾼다. 자체 점검: 렌더 후 각 장면 시작 프레임을 뽑아 「있어서는 안 될 특수효과 요소」가 없는지 본다.

## 22. 【카메라】3D/확대 모드에서 글자가 뭉개진다 — 확대는 CSS zoom으로, transform scale로 하지 않는다

**증상**: `transform: scale()`로 페이지를 밀어 당기면(특히 3D perspective 모드에서) 글자가 뭉개진다. 배율이 높을수록 심하고, 2x를 넘으면 납품할 수 없다.

**근본 원인**: Chromium은 요소의 **레이아웃 크기**로 래스터화한 다음 그 비트맵을 확대한다. scale은 비트맵만 키운다.

**해법**(shotcraft 판례, 저장소에서 가장 비싸게 얻은 지식): 카메라 층의 확대는 **CSS `zoom` 속성**으로 한다(레이아웃 수준 확대이며, 확대된 크기로 layout을 다시 하고 래스터화하므로 어떤 배율에서도 글자가 선명하다). 좌표 환산과 전체 공식은 `camera-language.md` §3.4, `gsap-recipes.md` §9.2에 있다. 주의: `zoom`은 매 프레임 re-layout을 일으킨다. 「레이아웃 속성 tween 금지」의 유일한 합법 예외이며, `#world` 카메라 층에만 허용한다. 오프라인 프레임 단위 렌더링에서 렌더 시간이 길어지는 것은 정상이고, 산출물 품질이 우선이다. 함께 쓸 것: 전체 페이지 스크린샷은 2x부터, 클로즈업은 4x 슬라이스를 따로 준비해 밀고 들어가는 구간에서 6f 교차 페이드인.

## 23. 【카메라】perspective가 중간 층에 끊긴다 — 3D가 순간 평면이 된다

**증상**: `perspective` + `preserve-3d`를 다 설정했는데 렌더 결과에 3D 느낌이 전혀 없고 모든 층이 납작하게 붙어 있다.

**근본 원인**: `#camera`와 3D 자식 요소 사이의 **중간 층 어디에든** `overflow: hidden`, `filter`, `opacity < 1`, `clip-path` 중 하나가 붙으면 새 stacking context가 생겨 preserve-3d가 평면화된다.

**해법**: 3D 모드에서는 필터/투명도 효과를 **가장 안쪽 요소**에만 붙인다. 컨테이너 사슬은 층마다 위 네 가지 속성을 확인한다. 점검 요령: `#camera`부터 문제가 생긴 요소까지 중간의 모든 층에서 이 네 항목을 `getComputedStyle`로 하나씩 본다.

## 24. 【카메라】pan에서 바깥이 보인다 — 이동할 때 캔버스 밖 빈 공간이 드러난다

**증상**: 카메라를 좌우로 옮기거나 흔들 때 화면 가장자리에 흰 테두리나 검은 테두리가 보인다.

**근본 원인**: `#world` 크기를 뷰포트와 똑같이만 잡아서 카메라가 움직이는 순간 바깥으로 나간다.

**해법**: `#world`를 사방으로 bleed ≥ 최대 pan 진폭 + 8% 안전 여유만큼 넓힌다(camera-language §3.3). 배경 층과 분위기 층도 bleed 영역까지 따라 깔아야 한다. 뷰포트만 채우지 않는다. 자체 점검: timeline을 각 pan 구간의 양 끝점으로 seek해 스크린샷을 찍고 네 변을 본다.

## 빠른 자체 점검 목록(작업 시작 전 5초)

- [ ] `position: absolute`인 요소의 부모마다 `position: relative`가 있나?
- [ ] 애니메이션 안의 특수 문자(`␣` `⌘` `emoji`)가 다 글꼴 안에 있나?
- [ ] Grid/Flex 템플릿의 count와 JS 데이터의 length가 일치하나?
- [ ] 장면 전환 사이에 cross-fade가 있고, 0.3s가 넘는 빈 화면이 없나?
- [ ] DOM 측정 코드가 `document.fonts.ready.then()` 안에 있나?
- [ ] `render(t)`가 pure한가, 아니면 명확한 reset 장치가 있나?
- [ ] 0번째 프레임이 완전한 초기 상태이고 공백이 아닌가?
- [ ] 화면 안에 「가짜 chrome」 장식이 없나(진행 바/타임코드/하단 서명 띠가 Stage scrubber와 충돌)?
- [ ] 애니메이션 tick 첫 프레임에서 `window.__ready = true`를 동기로 설정하나?(animations.jsx를 쓰면 기본 제공. 손으로 쓰는 HTML은 직접 넣는다)
- [ ] Stage가 `window.__recording`을 감지해 loop=false를 강제하나?(손으로 쓰는 HTML은 필수)
- [ ] 끝 Sprite의 `fadeOut`을 0으로 뒀나(영상 끝이 선명한 프레임에서 멈추게)?
- [ ] 60fps MP4는 기본으로 프레임 복제 모드(호환성)를 쓰고, 고품질 보간일 때만 `--minterpolate`를 붙이나?
- [ ] 내보낸 뒤 0번째 프레임과 마지막 프레임을 뽑아 애니메이션 초기/최종 상태인지 검증했나?
- [ ] 특정 브랜드(Stripe/Anthropic/Lovart/...)가 걸린다면: 「브랜드 자산 프로토콜」(SKILL.md §1.a 다섯 단계)을 다 밟았나? `brand-spec.md`를 썼나?
- [ ] 단일 파일로 납품하는 HTML: `animations.jsx`가 인라인이고 `src="..."`가 아닌가?(file:// 아래 외부 .jsx는 CORS로 검은 화면이 된다)
- [ ] scene을 넘나드는 요소(chapter 라벨/워터마크/scene 번호)에 색이 하드코딩되어 있지 않나? 모든 scene 배경색에서 보이나?
- [ ] 오프라인/진짜 자기완결이 필요하면: React+ReactDOM 로컬 인라인, **app과 `animations.jsx` 엔진 모두 Babel transpile**, 글꼴은 시스템 글꼴인가?(함정 #17 참고. 엔진에 JSX가 있어서 transpile을 빼먹으면 반드시 `Unexpected token '<'`)
- [ ] 【HyperFrames】렌더링 경로에 CSS `transition`이 없나? 상태 변화가 전부 tween이나 t의 순수 함수인가?(함정 #18)
- [ ] 【HyperFrames】프록시 tween 장면은 등록 후 `render(0)`을 채웠나?(함정 #19)
- [ ] 【HyperFrames】check를 통과했나? 어두운 시네마틱은 `--no-contrast`, 나머지 네 게이트는 0 error인가?(함정 #20)
- [ ] 【HyperFrames/GSAP】from 상태가 보이는 `fromTo()`에 전부 `immediateRender:false`를 붙였나?(함정 #21, B00 실측에서 유령 4곳)
- [ ] 【카메라】3D/확대 클로즈업이 CSS `zoom`을 쓰고, scale 확대로 뭉개지지 않나?(함정 #22)
- [ ] 【카메라】`#camera`에서 3D 요소까지 중간 층에 overflow/filter/opacity/clip-path가 없나?(함정 #23)
- [ ] 【카메라】`#world`에 bleed를 넓혔고, pan 끝점 스크린샷 네 변에 흰 테두리가 없나?(함정 #24)
