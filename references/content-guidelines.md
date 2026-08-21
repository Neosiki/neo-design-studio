# Content Guidelines: 안티 AI slop · 콘텐츠 준칙 · Scale 규범

AI가 디자인할 때 가장 쉽게 빠지는 함정들이다. 이건 「무엇을 하지 않을지」의 목록이고, 「무엇을 할지」보다 중요하다 — AI slop은 기본값이라서, 의식적으로 피하지 않으면 그냥 그렇게 나온다.

## AI Slop 전체 블랙리스트

### 시각 함정

**❌ 과격한 그라데이션 배경**
- 보라 → 분홍 → 파랑 전체 화면 그라데이션(AI가 만든 웹페이지의 전형적인 냄새)
- 방향을 가리지 않고 rainbow gradient
- Mesh gradient로 배경을 가득 채우기
- ✅ 그라데이션을 쓸 거라면: subtle하게, 단색 계열로, 의도를 갖고 부분만(예: button hover)

**❌ 둥근 카드 + 왼쪽 border accent 색**
```css
/* 이게 AI 냄새 나는 카드의 전형적인 서명이다 */
.card {
  border-radius: 12px;
  border-left: 4px solid #3b82f6;
  padding: 16px;
}
```
이런 카드가 AI로 만든 대시보드에 넘쳐난다. 강조하고 싶은가? 더 디자인다운 방법을 쓴다: 배경색 대비, 자중·자크기 대비, plain 구분선, 아니면 아예 카드로 나누지 않기.

**❌ 이모지 장식**
브랜드 자체가 이모지를 쓰는 경우(예: Notion, Slack)가 아니면 UI에 이모지를 올리지 않는다. **특히 하지 말 것**:
- 제목 앞의 🚀 ⚡️ ✨ 🎯 💡
- Feature 목록의 ✅
- CTA 버튼 안의 →(화살표 자체는 괜찮지만 이모지 화살표는 안 된다)

아이콘이 없으면 진짜 아이콘 라이브러리(Lucide/Heroicons/Phosphor)를 쓰거나 placeholder를 둔다.

**❌ SVG로 imagery 그리기**
SVG로 인물, 장면, 기기, 물건, 추상 예술을 그리려 하지 않는다. AI가 그린 SVG imagery는 한눈에 AI 냄새가 나고, 유치하고 싸 보인다. **회색 사각형 하나에 "일러스트 자리 1200×800"이라고 적어 두는 게 어설픈 SVG hero illustration보다 100배 낫다**.

SVG를 써도 되는 경우는 이것뿐이다:
- 진짜 아이콘(16×16에서 32×32 수준)
- 기하 도형으로 만드는 장식 요소
- Data viz의 chart

**❌ 과도한 iconography**
모든 제목·feature·section에 아이콘이 필요한 건 아니다. 아이콘을 남용하면 화면이 장난감처럼 보인다. Less is more.

**❌ "Data slop"**
지어낸 수치로 하는 장식:
- "10,000+ happy customers" (실제로 그런지 알지도 못한다)
- "99.9% uptime" (진짜 데이터가 없으면 쓰지 않는다)
- 아이콘 + 숫자 + 단어를 조합한 장식용 "metric cards"
- Mock table에 가짜 데이터를 화려하게 채워 넣기

진짜 데이터가 없으면 placeholder를 두거나 사용자에게 물어본다.

**❌ "Quote slop"**
지어낸 사용자 후기나 명언으로 페이지를 장식하기. placeholder를 두고 진짜 quote를 사용자에게 물어본다.

### 글꼴 함정

**❌ 이 흔해빠진 글꼴들은 피한다**:
- Inter(AI가 만든 웹페이지의 기본값)
- Roboto
- Arial / Helvetica
- 순수 system font stack
- Fraunces(AI가 이걸 발견하고는 닳도록 썼다)
- Space Grotesk(최근 AI가 가장 좋아하는 것)

**✅ 특징이 있는 display + body 조합을 쓴다**. 방향을 잡을 실마리:
- 세리프 display + 산세리프 body(editorial feel)
- Mono display + sans body(technical feel)
- Heavy display + light body(contrast)
- Variable font로 hero의 굵기를 애니메이션

글꼴을 구할 곳:
- Google Fonts의 덜 알려진 좋은 선택지(Instrument Serif, Cormorant, Bricolage Grotesque, JetBrains Mono)
- 오픈소스 글꼴 사이트(Fraunces의 형제 글꼴, Adobe Fonts)
- 글꼴 이름을 없는 데서 만들어 내지 않는다

### 색채 함정

**❌ 색을 없는 데서 만들어 내기**
익숙하지 않은 색채 체계를 처음부터 끝까지 직접 설계하지 않는다. 대개 조화롭지 않게 나온다.

**✅ 전략**:
1. 브랜드 색이 있다 → 브랜드 색을 쓰고, 빠진 color token은 oklch로 보간한다
2. 브랜드 색은 없지만 참고할 게 있다 → 참고 제품 스크린샷에서 색을 뽑는다
3. 완전히 맨땅이다 → 이미 알려진 배색 체계(Radix Colors / Tailwind 기본 palette / Anthropic brand)를 고르고, 직접 조색하지 않는다

**oklch로 색을 정의**하는 게 가장 현대적인 방식이다:
```css
:root {
  --primary: oklch(0.65 0.18 25);      /* 따뜻한 terracotta */
  --primary-light: oklch(0.85 0.08 25); /* 같은 계열의 밝은 색 */
  --primary-dark: oklch(0.45 0.20 25);  /* 같은 계열의 어두운 색 */
}
```
oklch는 밝기를 조정할 때 색상이 밀리지 않게 보장해 줘서 hsl보다 쓰기 좋다.

**❌ 다크 모드를 색 반전으로 대충 만들기**
색을 그냥 invert하는 게 아니다. 좋은 dark mode는 채도, 대비, accent 색을 다시 잡아야 한다. 그럴 생각이 없으면 dark mode는 만들지 않는다.

### Layout 함정

**❌ Bento grid 남용**
AI가 만든 landing page는 하나같이 bento를 하고 싶어 한다. 정보 구조가 정말로 bento에 맞는 경우가 아니면 다른 layout을 쓴다.

**❌ 큰 hero + 3-column features + testimonials + CTA**
이 landing page 템플릿은 닳도록 쓰였다. 새롭게 하고 싶으면 진짜로 새롭게 한다.

**❌ Card grid에서 모든 card가 똑같이 생긴 것**
Asymmetric하게, 크기가 다른 cards로, 어떤 건 image가 있고 어떤 건 글자만, 어떤 건 열을 걸치게 — 그래야 진짜 디자이너가 만든 것처럼 보인다.

## 콘텐츠 준칙

### 1. Don't add filler content

모든 요소는 자기 자리를 스스로 벌어야 한다. 빈 공간은 디자인 문제이고 **구성**으로 푼다(대비, 리듬, 여백). 내용으로 채워서 푸는 게 **아니다**.

**filler인지 판단하는 질문**:
- 이 내용을 빼면 디자인이 나빠지는가? 답이 "아니다"라면 뺀다.
- 이 요소는 어떤 실제 문제를 해결하는가? "페이지가 덜 비어 보이게"라면 지운다.
- 이 수치·quote·feature에 진짜 데이터 근거가 있는가? 없으면 없는 데서 쓰지 않는다.

「One thousand no's for every yes」.

### 2. Ask before adding material

한 단락, 한 페이지, 한 section을 더 넣으면 나아질 것 같은가? 먼저 사용자에게 물어보고, 일방적으로 넣지 않는다.

이유는 이렇다:
- 사용자는 자기 청중을 나보다 잘 안다
- 내용을 늘리는 데는 비용이 들고, 사용자가 원하지 않을 수도 있다
- 일방적으로 내용을 넣는 건 "junior designer가 일을 보고한다"는 관계를 어긴다

### 3. Create a system up front

design context 탐색이 끝나면 **먼저 쓸 시스템을 말로 꺼내서** 사용자에게 확인받는다:

```markdown
제 디자인 시스템입니다:
- 색채: #1A1A1A 본체 + #F0EEE6 배경 + #D97757 accent(브랜드에서 가져왔습니다)
- 서체: display는 Instrument Serif, body는 Geist Sans
- 리듬: section title은 full-bleed 컬러 배경 + 흰 글자, 일반 section은 흰 배경
- 이미지: hero는 full-bleed 사진, feature section은 주실 때까지 placeholder
- 배경색은 최대 2가지만 써서 산만해지지 않게 합니다

이 방향 확인해 주시면 시작하겠습니다.
```

사용자가 확인한 뒤에 손을 댄다. 이 check-in이 "절반쯤 만들고 나서 방향이 틀렸다는 걸 알게 되는" 일을 막아 준다.

## Scale 규범

### 슬라이드(1920×1080)

- 본문 최소 **24px**, 이상적으로는 28-36px
- 제목 60-120px
- Section title 80-160px
- Hero headline은 180-240px의 큰 글자도 괜찮다
- <24px 글자는 절대로 슬라이드에 쓰지 않는다

### 인쇄 문서

- 본문 최소 **10pt**(≈13.3px), 이상적으로는 11-12pt
- 제목 18-36pt
- Caption 8-9pt

### Web과 모바일

- 본문 최소 **14px**(고령 사용자를 배려하면 16px)
- 모바일 본문 **16px**(iOS의 자동 확대를 피한다)
- Hit target(클릭 가능한 요소)은 최소 **44×44px**
- 행간 1.5-1.7(한글·한자는 1.7-1.8)

### 대비

- 본문 vs 배경 **최소 4.5:1**(WCAG AA)
- 큰 글자 vs 배경 **최소 3:1**
- Chrome DevTools의 accessibility 도구로 확인한다

## CSS 무기고

**요즘 CSS 기능**은 디자이너의 친구다. 과감하게 쓴다:

### 조판

```css
/* 제목 줄바꿈을 자연스럽게 해서 마지막 줄에 단어 하나만 남지 않게 한다 */
h1, h2, h3 { text-wrap: balance; }

/* 본문 줄바꿈, 과부·고아줄을 피한다 */
p { text-wrap: pretty; }

/* 한글·한자 조판의 핵심: 표점 압축, 행 첫머리·끝 제어 */
p { 
  text-spacing-trim: space-all;
  hanging-punctuation: first;
}
```

### Layout

```css
/* CSS Grid + named areas = 가독성 폭발 */
.layout {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto 1fr auto;
}

/* Subgrid로 카드 내용을 정렬 */
.card { display: grid; grid-template-rows: subgrid; }
```

### 시각 효과

```css
/* 디자인이 느껴지는 스크롤바 */
* { scrollbar-width: thin; scrollbar-color: #666 transparent; }

/* 글래스모피즘(절제해서 쓴다) */
.glass {
  backdrop-filter: blur(20px) saturate(150%);
  background: color-mix(in oklch, white 70%, transparent);
}

/* View transitions API로 페이지 전환을 매끄럽게 */
@view-transition { navigation: auto; }
```

### 인터랙션

```css
/* :has() 선택자가 조건부 스타일을 쉽게 만들어 준다 */
.card:has(img) { padding-top: 0; } /* 이미지가 있는 카드는 위쪽 padding 없음 */

/* container queries로 컴포넌트가 진짜 반응형이 된다 */
@container (min-width: 500px) { ... }

/* 새로 생긴 color-mix 함수 */
.button:hover {
  background: color-mix(in oklch, var(--primary) 85%, black);
}
```

## 빠른 판단표: 망설여질 때

- 그라데이션을 넣고 싶다? → 대개는 넣지 않는다
- 이모지를 넣고 싶다? → 넣지 않는다
- 카드에 둥근 모서리 + border-left accent를 넣고 싶다? → 넣지 않고 다른 방법으로 바꾼다
- SVG로 hero 일러스트를 그리고 싶다? → 그리지 않고 placeholder를 쓴다
- quote 한 줄을 장식으로 넣고 싶다? → 진짜 quote가 있는지 사용자에게 먼저 물어본다
- 아이콘 feature를 한 줄 넣고 싶다? → 아이콘이 필요한지 먼저 묻는다. 아마 필요 없다
- Inter를 쓸까? → 더 특징 있는 것으로 바꾼다
- 보라색 그라데이션을 쓸까? → 근거 있는 배색으로 바꾼다

**"조금 더 넣으면 보기 좋아질 것 같다"는 생각이 들 때 — 그게 보통 AI slop의 징조다**. 가장 단순한 버전을 먼저 만들고, 사용자가 요구할 때만 더한다.
