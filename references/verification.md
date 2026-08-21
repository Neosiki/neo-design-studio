# Verification: 산출물 검증 절차

일부 design-agent 네이티브 환경(예: Claude.ai Artifacts)에는 `fork_verifier_agent`로 subagent를 띄워 iframe 스크린샷으로 확인하는 기능이 내장돼 있다. 대부분의 agent 환경(Claude Code / Codex / Cursor / Trae 등)에는 이 기능이 없다 — Playwright로 직접 하면 같은 검증 범위를 덮을 수 있다.

## 검증 목록

HTML을 산출할 때마다 이 목록을 한 번씩 훑는다:

### 1. 브라우저 렌더링 확인(필수)

가장 기본: **HTML이 열리는가?** macOS에서는:

```bash
open -a "Google Chrome" "/path/to/your/design.html"
```

또는 Playwright로 스크린샷을 찍는다(다음 절).

### 2. 콘솔 오류 확인

HTML 파일에서 가장 흔한 문제는 JS 오류로 화면이 하얗게 뜨는 것이다. Playwright로 한 번 돌린다:

```bash
python ~/.claude/skills/design-studio/scripts/verify.py path/to/design.html
```

이 스크립트가 하는 일:
1. headless chromium으로 HTML을 연다
2. 스크린샷을 프로젝트 디렉터리에 저장한다
3. 콘솔 오류를 걷어 온다
4. status를 보고한다

자세한 내용은 `scripts/verify.py` 참고.

### 3. 다중 뷰포트 확인

반응형 디자인이라면 여러 viewport를 찍는다:

```bash
python verify.py design.html --viewports 1920x1080,1440x900,768x1024,375x667
```

### 4. 인터랙션 확인

Tweaks, 애니메이션, 버튼 전환 — 기본 정적 스크린샷으로는 보이지 않는다. **사용자가 직접 브라우저를 열어 눌러 보게 하는 걸 권한다**. 아니면 Playwright로 화면을 녹화한다:

```python
page.video.record('interaction.mp4')
```

### 5. 슬라이드 한 장씩 확인

Deck 계열 HTML은 한 장씩 찍는다:

```bash
python verify.py deck.html --slides 10  # 앞 10장을 찍는다
```

`deck-slide-01.png`, `deck-slide-02.png`... 를 만들어 주니 빠르게 훑어보기 좋다.

## Playwright Setup

처음 쓸 때 필요한 것:

```bash
# 아직 설치하지 않았다면
npm install -g playwright
npx playwright install chromium

# 또는 Python 버전
pip install playwright
playwright install chromium
```

사용자가 이미 전역에 Playwright를 설치해 뒀다면 그대로 쓰면 된다.

## 스크린샷 모범 사례

### 전체 페이지 찍기

```python
page.screenshot(path='full.png', full_page=True)
```

### viewport 찍기

```python
page.screenshot(path='viewport.png')  # 기본값은 보이는 영역만 찍는다
```

### 특정 요소 찍기

```python
element = page.query_selector('.hero-section')
element.screenshot(path='hero.png')
```

### 고해상도 스크린샷

```python
page = browser.new_page(device_scale_factor=2)  # retina
```

### 애니메이션이 끝난 뒤에 찍기

```python
page.wait_for_timeout(2000)  # 2초 기다려 애니메이션이 settle되게 한다
page.screenshot(...)
```

## 스크린샷을 사용자에게 보내기

### 로컬 스크린샷은 바로 열기

```bash
open screenshot.png
```

사용자가 자기 Preview/Figma/VSCode/브라우저에서 본다.

### 이미지 호스팅에 올려 링크 공유

원격 협업자에게 보여줘야 한다면(예: Slack/페이슈/위챗), 사용자가 자기 이미지 호스팅 도구나 MCP로 스크린샷을 올려 영구 링크를 받게 한다. 그러면 어디든 붙여 넣을 수 있다.

## 검증에서 문제가 나왔을 때

### 페이지가 하얗게 뜬다

콘솔에 반드시 오류가 있다. 먼저 확인할 것:

1. React+Babel script tag의 integrity hash가 맞는지(`react-setup.md` 참고)
2. `const styles = {...}` 이름 충돌은 아닌지
3. 파일을 넘나드는 컴포넌트가 `window`로 export됐는지
4. JSX 문법 오류(babel.min.js는 오류를 안 내니 압축하지 않은 babel.js로 바꿔 본다)

### 애니메이션이 끊긴다

- Chrome DevTools Performance tab으로 한 구간을 녹화한다
- layout thrashing(잦은 reflow)을 찾는다
- 모션은 `transform`과 `opacity`를 우선 쓴다(GPU 가속)

### 글꼴이 이상하다

- `@font-face`의 url에 접근이 되는지 확인한다
- fallback 글꼴을 확인한다
- CJK 글꼴은 로딩이 느리다: 먼저 fallback을 보여주고 로딩이 끝나면 바꾼다

### 레이아웃이 어긋난다

- `box-sizing: border-box`가 전역에 적용됐는지 확인한다
- `*  margin: 0; padding: 0` reset을 확인한다
- Chrome DevTools에서 gridlines를 켜서 실제 레이아웃을 본다

## 검증 = 디자이너의 두 번째 눈

**항상 스스로 한 번 훑는다.** AI가 코드를 쓸 때 이런 일이 자주 생긴다:

- 보기에는 맞는데 interaction에 버그가 있다
- 정적 스크린샷은 좋은데 scroll할 때 어긋난다
- 넓은 화면에서는 예쁜데 좁은 화면에서 깨진다
- Dark mode 테스트를 잊었다
- Tweaks를 전환한 뒤 일부 컴포넌트가 반응하지 않는다

**마지막 1분의 검증이 1시간의 재작업을 아껴 준다.**

## 자주 쓰는 검증 스크립트 명령

```bash
# 기본: 열고 + 찍고 + 오류 걷기
python verify.py design.html

# 여러 viewport
python verify.py design.html --viewports 1920x1080,375x667

# 여러 slide
python verify.py deck.html --slides 10

# 지정한 디렉터리로 출력
python verify.py design.html --output ./screenshots/

# headless=false, 실제 브라우저를 열어서 보여준다
python verify.py design.html --show
```

## 영상 산출물 하드 검증(verify-video.sh)

렌더링해서 나온 MP4나 완성본은 눈으로 통과시키지 않고 스크립트로 하드 검증한다(HTML 합성 쪽 검증은 `hyperframes check`의 5개 관문 감사가 맡고, 이 스크립트는 산출물 쪽만 본다):

```bash
# 완성본(기본적으로 음성 트랙을 요구한다)
bash scripts/verify-video.sh final.mp4 --duration=22 --fps=60 --width=1920 --height=1080

# 소리 없는 중간 산출물
bash scripts/verify-video.sh raw.mp4 --duration=10 --fps=60 --no-audio

# 의도적으로 검은 화면으로 시작하는 시네마틱
bash scripts/verify-video.sh film.mp4 --duration=30 --fps=60 --allow-black-open
```

검사 항목: 해상도·프레임레이트, 길이 오차(±2%), audio stream 존재 여부(음성 트랙이 없으면 반제품이라는 철칙을 기계가 집행한다), 앞뒤 검은 프레임(blackdetect, 녹화 시작점이 밀리거나 loop가 되돌아갈 때 나오는 전형적인 증상), LUFS 라우드니스(완성본 목표 -14±4). exit code가 0이 아니면 전달하지 않는다.
