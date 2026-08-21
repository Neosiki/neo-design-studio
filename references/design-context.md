# Design Context: 이미 있는 컨텍스트에서 출발한다

**이 skill에서 가장 중요한 one thing이다.**

좋은 hi-fi 디자인은 반드시 이미 있는 design context에서 자라난다. **맨땅에서 hi-fi를 만드는 건 last resort이고, 반드시 generic한 결과가 나온다.** 그래서 디자인 작업을 시작할 때마다 먼저 묻는다: 참고할 게 있는가?

## Design Context란

우선순위가 높은 것부터:

### 1. 사용자의 Design System/UI Kit
사용자 제품에 이미 있는 컴포넌트 라이브러리, 색상 token, 서체 규격, icon 시스템. **가장 완벽한 경우다.**

### 2. 사용자의 Codebase
코드베이스를 받았다면 그 안에 살아 있는 컴포넌트 구현이 있다. 그 컴포넌트 파일들을 Read한다:
- `theme.ts` / `colors.ts` / `tokens.css` / `_variables.scss`
- 구체적인 컴포넌트（Button.tsx, Card.tsx）
- Layout scaffold（App.tsx, MainLayout.tsx）
- Global stylesheets

**코드를 읽어 exact values를 그대로 가져온다**: hex codes, spacing scale, font stack, border radius. 기억에 의존해 다시 그리지 않는다.

### 3. 사용자가 이미 배포한 제품
서비스 중인 제품은 있지만 코드를 주지 않았다면, Playwright로 찍거나 사용자에게 스크린샷을 받는다.

```bash
# Playwright로 공개 URL 스크린샷 찍기
npx playwright screenshot https://example.com screenshot.png --viewport-size=1920,1080
```

이렇게 하면 실제 시각 vocabulary가 보인다.

### 4. 브랜드 가이드/Logo/기존 자료
사용자가 갖고 있을 만한 것들: Logo 파일, 브랜드 색 규격, 마케팅 자료, slide 템플릿. 전부 context다.

### 5. 경쟁 제품 참고
사용자가 "XX 사이트처럼"이라고 말하면 —— URL이나 스크린샷을 받는다. 학습 데이터 속 흐릿한 인상으로 만들지 **않는다**.

### 6. 알려진 design system（fallback）
위의 어느 것도 없으면 공인된 디자인 시스템을 base로 쓴다:
- Apple HIG
- Material Design 3
- Radix Colors（배색）
- shadcn/ui（컴포넌트）
- Tailwind 기본 palette

무엇을 썼는지 사용자에게 분명히 말해서, 이게 출발점이지 확정안이 아니라는 걸 알게 한다.

## Context를 확보하는 흐름

### Step 1: 사용자에게 묻는다

작업을 시작할 때 반드시 묻는 목록（출처는 `workflow.md`）:

```markdown
1. 이미 쓰는 design system/UI kit/컴포넌트 라이브러리가 있나요? 어디에 있나요?
2. 브랜드 가이드, 색·서체 규격이 있나요?
3. 현재 제품의 스크린샷이나 URL을 주실 수 있나요?
4. 제가 읽을 수 있는 codebase가 있나요?
```

### Step 2: 사용자가 "없다"고 하면 대신 찾아준다

바로 포기하지 않는다. 이렇게 시도한다:

```markdown
단서가 있는지 같이 찾아보죠:
- 이전 프로젝트에 관련 디자인이 있나요?
- 회사 marketing 사이트는 어떤 색·서체를 쓰나요?
- 제품 Logo는 어떤 스타일인가요? 한 장 주실 수 있나요?
- 좋게 보는 제품이 있다면 참고로 알려주세요.
```

### Step 3: 찾을 수 있는 context를 전부 Read한다

사용자가 codebase 경로를 줬다면 이렇게 읽는다:
1. **먼저 파일 구조를 list한다**: style/theme/component 관련 파일을 찾는다
2. **theme/token 파일을 읽는다**: 구체적인 hex/px values를 그대로 가져온다
3. **대표 컴포넌트 2-3개를 읽는다**: 시각 vocabulary를 본다（hover state, shadow, border, padding node pattern）
4. **global stylesheet를 읽는다**: 기본 리셋, font loading
5. **Figma 링크나 스크린샷이 있으면**: 보되, **코드를 더 믿는다**

**중요**: 한 번 훑고 인상으로 만들지 **않는다**. 다 읽고 나서 구체적인 values가 30개 이상 나와야 진짜로 가져온 것이다.

### Step 4: 쓸 시스템을 Vocalize한다

context를 다 본 뒤, 쓸 시스템을 사용자에게 말한다:

```markdown
codebase와 제품 스크린샷을 보고 정리한 디자인 시스템입니다:

**색상**
- Primary: #C27558（tokens.css에서）
- Background: #FDF9F0
- Text: #1A1A1A
- Muted: #6B6B6B

**서체**
- Display: Instrument Serif（global.css의 @font-face에서）
- Body: Geist Sans
- Mono: JetBrains Mono

**Spacing**（쓰고 계신 scale 시스템）
- 4, 8, 12, 16, 24, 32, 48, 64

**Shadow pattern**
- `0 1px 2px rgba(0,0,0,0.04)`（subtle card）
- `0 10px 40px rgba(0,0,0,0.1)`（elevated modal）

**Border-radius**
- 작은 컴포넌트 4px, 카드 12px, 버튼 8px

**component vocabulary**
- Button: filled primary, outlined secondary, ghost tertiary, 전부 라운드 8px
- Card: 흰 배경, subtle shadow, border 없음

이 시스템으로 시작합니다. 이대로 괜찮나요?
```

사용자가 확인한 뒤에 손을 댄다.

## 맨땅에서 디자인하기（Context가 없을 때의 fallback）

**강한 경고**: 이 경우 산출물 품질이 확연히 떨어진다. 사용자에게 분명히 말한다.

```markdown
design context가 없으면 일반적인 직관에 기대서 만들 수밖에 없습니다.
"보기엔 괜찮지만 특징이 없는" 결과가 나옵니다.
그대로 진행할까요, 아니면 참고 자료를 먼저 채울까요?
```

사용자가 그래도 하자고 하면, 이 순서로 결정한다:

### 1. aesthetic direction 하나를 고른다
generic한 결과를 내지 않는다. 방향을 하나 분명히 고른다:
- brutally minimal
- editorial/magazine
- brutalist/raw
- organic/natural
- luxury/refined
- playful/toy
- retro-futuristic
- soft/pastel

어느 쪽을 골랐는지 사용자에게 말한다.

### 2. known design system 하나를 골격으로 쓴다
- 배색은 Radix Colors（https://www.radix-ui.com/colors）
- 컴포넌트 vocabulary는 shadcn/ui（https://ui.shadcn.com）
- Tailwind spacing scale（4의 배수）

### 3. 특징 있는 글꼴 조합을 고른다

Inter/Roboto는 쓰지 않는다. 추천 조합（Google Fonts에서 공짜로）:
- Instrument Serif + Geist Sans
- Cormorant Garamond + Inter Tight
- Bricolage Grotesque + Söhne（유료）
- Fraunces + Work Sans（Fraunces는 이미 AI가 남용해 닳았다는 점 주의）
- JetBrains Mono + Geist Sans（technical feel）

### 4. 핵심 결정마다 reasoning을 남긴다

말없이 고르지 않는다. HTML의 comment에 적는다:

```html
<!--
Design decisions:
- Primary color: warm terracotta (oklch 0.65 0.18 25) — fits the "editorial" direction  
- Display: Instrument Serif for humanist, literary feel
- Body: Geist Sans for cleanness contrast
- No gradients — committed to minimal, no AI slop
- Spacing: 8px base, golden ratio friendly (8/13/21/34)
-->
```

## Import 전략（사용자가 codebase를 준 경우）

사용자가 "이 codebase를 참고로 import해줘"라고 하면:

### 소형（50개 파일 미만）
전부 Read해서 context를 몸에 익힌다.

### 중형（50-500개 파일）
여기에 Focus한다:
- `src/components/` 또는 `components/`
- styles/tokens/theme 관련 파일 전부
- 대표적인 전체 페이지 컴포넌트 2-3개（Home.tsx, Dashboard.tsx）

### 대형（500개 파일 초과）
사용자에게 focus를 지정받는다:
- "settings 페이지를 만들려고 한다" → 기존 settings 관련을 읽는다
- "새 feature를 만들려고 한다" → 전체 shell + 가장 가까운 참고를 읽는다
- 전부 보려 하지 않고 정확한 것만 본다

## Figma/디자인 시안과 맞물리기

사용자가 Figma 링크를 줬다면:

- "Figma를 HTML로 바로 변환"할 수 있다고 기대하지 **않는다** —— 별도 도구가 필요하다
- Figma 링크는 보통 공개 접근이 안 된다
- 사용자에게 이렇게 요청한다: **스크린샷**으로 내보내 보내주고 + 구체적인 color/spacing values를 알려달라

Figma 스크린샷만 받았다면 사용자에게 말한다:
- 시각은 볼 수 있지만 정확한 values는 가져올 수 없다
- 핵심 숫자（hex, px）를 알려주거나, export as code를 써달라（Figma가 지원한다）

## 마지막으로

**프로젝트의 디자인 품질 상한은 받은 context의 품질이 정한다.**

context를 모으는 데 10분 쓰는 게, 맨땅에서 hi-fi를 한 시간 그리는 것보다 값지다.

**context가 없는 상황에서는 밀어붙이지 말고 사용자에게 먼저 요청한다.**
