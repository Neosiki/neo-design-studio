# React + Babel 프로젝트 규정

HTML+React+Babel로 프로토타입을 제작할 때 반드시 준수해야 하는 기술 규정입니다. 준수하지 않으면 오류가 발생할 수 있습니다.

## Pinned Script Tags (반드시 이 버전을 사용해야 함)

HTML의`<head>`여기에 이 세 개의 script tag를 넣고, **고정 버전 + integrity hash**를 사용하세요:```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
```
**사용하지 마세요**`react@18`또는`react@latest`이러한 unpinned 버전은 버전 드리프트/캐시 문제가 발생할 수 있습니다.

**절대로** 생략하지 마세요`integrity`——CDN이 하이재킹되거나 변조될 경우를 대비한 방어선입니다.

## 파일 구조```
프로젝트명/
├── index.html               # 메인 HTML
├── components.jsx           # 컴포넌트 파일（type="text/babel"로 로드）
├── data.js                  # 데이터 파일
└── styles.css               # 추가 CSS(선택 사항)
```
HTML에서의 로드 방식:```html
<!-- 먼저 React+Babel -->
<script src="https://unpkg.com/react@18.3.1/..."></script>
<script src="https://unpkg.com/react-dom@18.3.1/..."></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/..."></script>

<!-- 다음으로 컴포넌트 파일 -->
<script type="text/babel" src="components.jsx"></script>
<script type="text/babel" src="pages.jsx"></script>

<!-- 마지막으로 메인 진입점 -->
<script type="text/babel">
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
</script>
```
**사용하지** 마세요`type="module"`— Babel과 충돌합니다.

## 위반해서는 안 되는 3가지 규칙

### 규칙 1: styles 객체는 반드시 고유한 이름을 사용해야 함

**오류**(컴포넌트가 여러 개일 경우 반드시 충돌 발생):```jsx
// components.jsx
const styles = { button: {...}, card: {...} };

// pages.jsx  ← 동일 이름으로 덮어쓰기！
const styles = { container: {...}, header: {...} };
```
**올바른 사례**: 각 컴포넌트 파일의 styles에 고유한 접두사를 사용합니다.```jsx
// terminal.jsx
const terminalStyles = { 
  screen: {...}, 
  line: {...} 
};

// sidebar.jsx
const sidebarStyles = { 
  container: {...}, 
  item: {...} 
};
```
**또는 inline styles 사용** (위젯 추천):```jsx
<div style={{ padding: 16, background: '#111' }}>...</div>
```
이 항목은 **협상의 여지가 없습니다**. 작성할 때마다`const styles = {...}`모두 specific 네이밍으로 replace해야 하며, 그렇지 않으면 여러 컴포넌트 로드 시 전체 스택에서 에러가 발생합니다.

### 규칙 2: Scope는 공유되지 않으며, 수동으로 export해야 함

**핵심 개념**: 각`<script type="text/babel">`Babel에 의해 독립적으로 컴파일되므로, 서로 간에 **scope가 공유되지 않습니다**.`components.jsx`에 정의된`Terminal`컴포넌트, 에서`pages.jsx`에서는 **기본적으로 undefined**입니다.

**해결 방법**: 각 컴포넌트 파일 끝부분에서 공유할 컴포넌트/도구를 다음으로 export합니다.`window`：

```jsx
// components.jsx 맨 끝
function Terminal(props) { ... }
function Line(props) { ... }
const colors = { green: '#...', red: '#...' };

Object.assign(window, {
  Terminal, Line, colors,
  // 다른 곳에서 사용할 모든 것을 여기에 나열하세요
});
```
그런 다음`pages.jsx`바로 사용할 수 있습니다`<Terminal />`, JSX가 ~할 것이기 때문입니다`window.Terminal`찾기.

### 규칙 3: scrollIntoView를 사용하지 마세요`scrollIntoView`전체 HTML 컨테이너를 위로 밀어올려 web harness의 레이아웃을 망가뜨립니다. **절대로 사용하지 마세요**.

대안:```js
// 컨테이너 내부의 특정 위치로 스크롤
container.scrollTop = targetElement.offsetTop;

// 또는 element.scrollTo를 사용
container.scrollTo({
  top: targetElement.offsetTop - 100,
  behavior: 'smooth'
});
```
## Claude API 호출 (HTML 내)

일부 네이티브 design-agent 환경(예: Claude.ai Artifacts)에는 설정이 필요 없는`window.claude.complete`, 하지만 대부분의 에이전트 환경(Claude Code / Codex / Cursor / Trae / etc.) 로컬에는 **없습니다**.

HTML 프로토타입에서 데모를 위해 LLM을 호출해야 하는 경우(예: 채팅 인터페이스 제작), 두 가지 옵션이 있습니다:

### 옵션 A: 실제 호출 대신 mock 사용

데모 시나리오에서 권장됩니다. 미리 설정된 response를 반환하는 가짜 helper를 작성하세요:```jsx
window.claude = {
  async complete(prompt) {
    await new Promise(r => setTimeout(r, 800)); // 지연 시뮬레이션
    return "이것은 mock 응답입니다. 실제 배포 시 실제 API로 교체하세요.";
  }
};
```
### 옵션 B: Anthropic API 실제 호출 (권장하지 않음, 로컬 데모 전용)

API key가 필요하며, 사용자가 HTML에 자신의 키를 입력해야 실행할 수 있습니다. **절대로 키를 HTML에 하드코딩하지 마세요.**

⚠️ 보안 경계: 이 방식은 로컬 환경에만 적합합니다.`file://`열어서 사용한 후 즉시 닫는 데모입니다. Key가 DOM/메모리에 남습니다—
**이 페이지를 배포하지 마십시오. Key가 입력된 페이지의 스크린샷이나 화면 녹화본을 배포하지 마십시오.** 프로덕션 환경에서는 반드시 로컬 프록시(Proxy) 백엔드 전달 방식을 사용해야 하며, 브라우저 측에서는 Key를 직접 다루지 않습니다. 기본적으로 옵션 A/C(Key가 전혀 필요 없음)를 우선적으로 권장합니다.```html
<input id="api-key" placeholder="당신의 Anthropic API key를 붙여넣으세요" />
<script>
window.claude = {
  async complete(prompt) {
    const key = document.getElementById('api-key').value;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    return data.content[0].text;
  }
};
</script>
```
**주의**: 브라우저에서 Anthropic API를 직접 호출하면 CORS 문제가 발생합니다. 사용자가 제공한 미리보기 환경이 CORS bypass를 지원하지 않는다면 이 방법은 사용할 수 없습니다. 이 경우 옵션 A의 mock 데이터를 사용하거나 사용자에게 프록시 백엔드가 필요함을 안내하십시오.

### 옵션 C: 에이전트 측의 LLM 기능을 활용한 mock 데이터 생성

단순히 로컬 데모용이라면, 현재 에이전트 세션에서 해당 에이전트의 LLM 기능(또는 사용자가 설치한 멀티 모델 클래스 스킬)을 임시로 호출하여 mock 응답 데이터를 먼저 생성한 후 HTML에 하드코딩할 수 있습니다. 이렇게 하면 HTML 실행 시 API에 전혀 의존하지 않게 됩니다.

## 전형적인 HTML 시작 템플릿

이 템플릿을 복사하여 React 프로토타입의 골격으로 사용하십시오:```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Prototype Name</title>

  <!-- React + Babel pinned -->
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; width: 100%; }
    body { 
      font-family: -apple-system, 'SF Pro Text', sans-serif;
      background: #FAFAFA;
      color: #1A1A1A;
    }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>

  <!-- 당신의 컴포넌트 파일 -->
  <script type="text/babel" src="components.jsx"></script>

  <!-- 메인 진입점 -->
  <script type="text/babel">
    const { useState, useEffect } = React;

    function App() {
      return (
        <div style={{padding: 40}}>
          <h1>Hello</h1>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>
```
## 주요 오류 및 해결 방법`styles is not defined` 또는 
`Cannot read property 'button' of undefined`**
→ 파일에 정의했습니다`const styles`, 다른 파일이 덮어쓰기 되었습니다. 각각 specific한 명칭으로 변경하세요.`Terminal is not defined`**
→ 파일 간 참조 시 scope가 공유되지 않습니다. Terminal을 정의한 파일 끝에 추가하십시오.`Object.assign(window, {Terminal})`.

**전체 페이지가 빈 화면으로 나오고 콘솔에 오류가 없음**
→ 대부분 JSX 문법 오류이지만 Babel이 콘솔에 표시하지 않은 경우입니다. 다음을`babel.min.js`임시로 변경`babel.js`비압축 버전은 에러 메시지가 더 명확합니다.

**ReactDOM.createRoot is not a function**
→ 버전이 맞지 않습니다. react-dom@18.3.1을 사용 중인지 확인하세요(17 또는 기타 버전이 아님).`Objects are not valid as a React child`**
→ JSX/문자열이 아닌 객체를 렌더링했습니다. 일반적으로`{someObj}`작성됨`{someObj.name}`。

## 대규모 프로젝트 파일 분할 방법

**1,000행 이상의 단일 파일**은 유지보수가 어렵습니다. 분할 전략:```
프로젝트/
├── index.html
├── src/
│   ├── primitives.jsx      # 기본 요소：Button、Card、Badge...
│   ├── components.jsx      # 비즈니스 컴포넌트：UserCard、PostList...
│   ├── pages/
│   │   ├── home.jsx        # 홈
│   │   ├── detail.jsx      # 상세 페이지
│   │   └── settings.jsx    # 설정 페이지
│   ├── router.jsx          # 간단한 라우터（React state 전환）
│   └── app.jsx             # 엔트리 컴포넌트
└── data.js                 # mock data
```
HTML에서 순차적으로 로드:```html
<script type="text/babel" src="src/primitives.jsx"></script>
<script type="text/babel" src="src/components.jsx"></script>
<script type="text/babel" src="src/pages/home.jsx"></script>
<script type="text/babel" src="src/pages/detail.jsx"></script>
<script type="text/babel" src="src/pages/settings.jsx"></script>
<script type="text/babel" src="src/router.jsx"></script>
<script type="text/babel" src="src/app.jsx"></script>
```
**각 파일 끝**에 필수`Object.assign(window, {...})`공유할 항목 내보내기.