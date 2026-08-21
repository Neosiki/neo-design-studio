# Slide Decks: HTML 슬라이드 제작 규범

슬라이드 제작은 디자인 작업에서 가장 자주 나오는 장면이다. 이 문서는 HTML 슬라이드를 잘 만드는 방법을 다룬다 — 아키텍처 선택, 한 장의 설계에서 PDF/PPTX 내보내기까지 전 구간.

**이 skill이 커버하는 범위**:
- **HTML 발표판(기본 산출물, 언제나 기본으로 반드시 만든다)** → 페이지별 독립 HTML + `assets/deck_index.html` 취합, 브라우저에서 키보드로 넘기고 전체화면으로 발표
- HTML → PDF 내보내기 → `scripts/export_deck_pdf.mjs` / `scripts/export_deck_stage_pdf.mjs`
- HTML → 편집 가능한 PPTX 내보내기 → `references/editable-pptx.md` + `scripts/html2pptx.js` + `scripts/export_deck_pptx.mjs`(HTML을 4개 하드 제약에 맞춰 써야 한다)

> **⚠️ HTML이 기본이고 PDF/PPTX는 파생물이다.** 최종 납품 형식이 무엇이든 **반드시** HTML 취합 발표판(`index.html` + `slides/*.html`)을 먼저 만든다. 그것이 슬라이드 작업물의 「원본」이다. PDF/PPTX는 HTML에서 명령 한 줄로 뽑아낸 스냅샷이다.
>
> **왜 HTML이 먼저인가**:
> - 발표·시연 현장에서 가장 쓰기 좋다(프로젝터/화면 공유에서 바로 전체화면, 키보드로 넘기기, Keynote/PPT 소프트웨어에 의존하지 않음)
> - 개발 중에 페이지마다 따로 더블클릭해서 확인할 수 있고, 매번 내보내기를 다시 돌릴 필요가 없다
> - PDF/PPTX 내보내기의 유일한 상류다(「내보낸 뒤에야 HTML을 고쳐야 함을 알고 다시 뽑는」 무한루프를 막는다)
> - 납품물을 「HTML + PDF」 또는 「HTML + PPTX」 두 벌로 줄 수 있고, 받는 쪽이 편한 걸 쓴다
>
> 2026-04-22 moxt brochure 실측: 13페이지 HTML + index.html 취합을 끝낸 뒤 `export_deck_pdf.mjs` 한 줄로 PDF를 뽑았고 수정은 0건이었다. HTML 판 자체가 브라우저로 바로 발표할 수 있는 납품물이다.

---

## 🛑 착수 전에 납품 형식을 먼저 확정한다 (가장 단단한 checkpoint)

**이 결정이 「단일 파일이냐 다중 파일이냐」보다 먼저다.** 2026-04-20 옵션 사외이사회 프로젝트 실측: **착수 전에 납품 형식을 확정하지 않으면 = 2~3시간 재작업.**

### 결정 트리 (HTML-first 아키텍처)

모든 납품은 같은 HTML 취합 페이지(`index.html` + `slides/*.html`)에서 출발한다. 납품 형식은 **HTML 작성 제약**과 **내보내기 명령**만 결정한다.

```
【언제나 기본 · 필수】 HTML 취합 발표판 (index.html + slides/*.html)
   │
   ├── 브라우저 발표 / 로컬 HTML 보관만 필요       → 여기서 끝. HTML 시각 자유도가 최대
   │
   ├── PDF도 필요 (인쇄 / 단체방 배포 / 보관)      → export_deck_pdf.mjs 실행해서 한 번에
   │                                                 HTML 작성은 자유, 시각 제약 없음
   │
   └── 편집 가능한 PPTX도 필요 (동료가 문구 수정)  → 첫 줄부터 4개 하드 제약에 맞춰 쓴다
                                                      export_deck_pptx.mjs 실행해서 한 번에
                                                      그라디언트 / web component / 복잡한 SVG를 포기
```

### 착수 멘트 (그대로 가져다 쓰세요)

> 최종 납품이 HTML이든 PDF든 PPTX든, 저는 먼저 브라우저에서 넘기며 발표할 수 있는 HTML 취합판(`index.html` + 키보드 넘기기)을 만듭니다 — 이건 언제나 기본으로 나오는 산출물입니다. 그 위에 PDF / PPTX 스냅샷을 추가로 뽑을지 여쭤봅니다.
>
> 어떤 내보내기 형식이 필요하세요?
> - **HTML만**(발표/보관) → 시각적으로 완전히 자유
> - **PDF까지** → 위와 같고, 내보내기 명령 한 줄이 추가됨
> - **편집 가능한 PPTX까지**(동료가 PPT에서 문구를 고칠 예정) → 첫 줄 HTML부터 4개 하드 제약에 맞춰야 하고, 시각 능력 일부를 포기합니다(그라디언트 없음, web component 없음, 복잡한 SVG 없음).

### 왜 「PPTX가 필요하면 처음부터 4개 하드 제약」인가

PPTX가 편집 가능해지는 전제는 `html2pptx.js`가 DOM을 요소 단위로 PowerPoint 객체로 번역할 수 있다는 것이다. 여기에는 **4개 하드 제약**이 필요하다.

1. body를 960pt × 540pt로 고정(`LAYOUT_WIDE`에 맞춤, 13.333″ × 7.5″. 1920×1080px가 아니다)
2. 모든 텍스트를 `<p>`/`<h1>`-`<h6>` 안에 넣는다(div에 텍스트를 직접 넣지 말고, `<span>`에 본 텍스트를 담지 말 것)
3. `<p>`/`<h*>` 자신에는 background/border/shadow를 걸 수 없다(바깥 div에 걸 것)
4. `<div>`에 `background-image`를 쓸 수 없다(`<img>` 태그를 쓸 것)
5. CSS gradient, web component, 복잡한 SVG 장식을 쓰지 않는다

**이 skill의 기본 HTML은 시각 자유도가 높다** — span 다수, 중첩 flex, 복잡한 SVG, web component(`<deck-stage>` 등), CSS 그라디언트 — **그중 html2pptx의 제약을 자연히 통과하는 것은 거의 없다**(시각 주도로 쓴 HTML을 그대로 html2pptx에 올렸을 때 pass율 < 30% 실측).

### 실제 두 경로의 비용 비교 (2026-04-20 실제 사고 기록)

| 경로 | 방식 | 결과 | 비용 |
|------|------|------|------|
| ❌ **HTML을 자유롭게 먼저 쓰고 나중에 PPTX 수습** | 단일 파일 deck-stage + SVG/span 장식 다수 | 편집 가능한 PPTX를 만들려면 남는 길이 둘뿐:<br>A. pptxgenjs를 수백 줄 손으로 쓰고 좌표를 하드코딩<br>B. 17페이지 HTML을 Path A 형식으로 재작성 | 2~3시간 재작업, 게다가 손으로 쓴 판은 **유지 비용이 영구적**(HTML에서 한 글자 고치면 PPTX를 또 사람 손으로 맞춰야 한다) |
| ✅ **첫 단계부터 Path A 제약에 맞춰 쓴다** | 페이지별 독립 HTML + 4개 하드 제약 + 960×540pt | 명령 한 줄로 100% 편집 가능한 PPTX를 뽑고, 동시에 브라우저 전체화면 발표도 된다(Path A HTML은 브라우저에서 그대로 재생되는 표준 HTML이다) | HTML 쓸 때 「텍스트를 `<p>`로 어떻게 감쌀까」를 5분 더 고민, 재작업 0 |

### 혼합 납품은 어떻게 하나

사용자가 「HTML 발표 **와** 편집 가능한 PPTX를 원한다」고 하면 — **이건 혼합이 아니다.** PPTX 요구가 HTML 요구를 포함한다. Path A로 쓴 HTML은 그 자체로 브라우저 전체화면 발표가 된다(`deck_index.html` 취합기만 붙이면 된다). **추가 비용이 없다.**

사용자가 「PPTX **와** 애니메이션 / web component를 원한다」고 하면 — **이건 진짜 모순이다.** 사용자에게 알린다: 편집 가능한 PPTX를 원하면 그 시각 능력들을 포기해야 한다. 사용자가 선택하게 하고, 몰래 pptxgenjs 수작업으로 우회하지 않는다(영구 유지보수 부채가 된다).

### 나중에야 PPTX가 필요한 걸 알았다면 (긴급 수습)

아주 드물게 HTML을 다 쓴 뒤에 PPTX가 필요하다는 걸 알게 된다. **fallback 절차**를 권한다(전체 설명은 `references/editable-pptx.md` 끝의 「Fallback: 시각 원고는 이미 있는데 사용자가 editable PPTX를 고집할 때」 참조).

1. **1순위: PDF로 뽑는다**(시각 100% 보존, 크로스플랫폼, 받는 쪽이 보고 인쇄할 수 있다) — 받는 쪽의 실제 요구가 「발표/보관」이라면 PDF가 최선의 납품물이다
2. **2순위: 시각 원고를 청사진 삼아 AI가 editable HTML을 다시 쓴다** → editable PPTX로 내보낸다 — 색·레이아웃·문구의 설계 판단은 남기고, 그라디언트·web component·복잡한 SVG 같은 시각 능력을 포기한다
3. **비권장: pptxgenjs 수작업 재구축** — 위치·글꼴·정렬을 다 손으로 맞춰야 하고 유지 비용이 크며, 이후 HTML에서 한 글자만 고쳐도 또 사람 손으로 동기화해야 한다

선택지는 언제나 사용자에게 알리고 사용자가 결정하게 한다. **첫 반응으로 pptxgenjs를 손으로 쓰기 시작하는 일은 절대 없어야 한다** — 그건 마지막 방어선이다.

---

## 🛑 대량 제작 전에: 2페이지 showcase로 grammar를 확정한다

**deck이 5페이지 이상이면 1페이지에서 마지막 페이지까지 그냥 내리쓰는 건 절대 금지다.** 2026-04-22 moxt brochure 실전에서 검증한 올바른 순서:

1. **시각 차이가 가장 큰 페이지 유형 2개**를 골라 showcase를 먼저 만든다(예: 「표지」 + 「감정/인용 페이지」, 또는 「표지」 + 「제품 소개 페이지」)
2. 스크린샷으로 사용자에게 grammar를 확인받는다(masthead / 글꼴 / 색 / 간격 / 구조 / 중영 이중언어 비율)
3. 방향이 통과되면 남은 N-2 페이지를 대량으로 밀고, 페이지마다 확립된 grammar를 재사용한다
4. 전부 끝난 뒤 HTML 취합 + PDF / PPTX 파생물을 함께 만든다

**왜인가**: 13페이지를 곧장 끝까지 쓰면 → 사용자가 「방향이 아니다」라고 할 때 = 13번 재작업. 2페이지 showcase를 먼저 하면 방향이 틀려도 = 2번 재작업. 시각 grammar가 한 번 확립되면 이후 N페이지의 결정 공간은 크게 줄고 「내용을 어떻게 넣을까」만 남는다.

**showcase 페이지 선택 원칙**: 시각 구조가 가장 다른 두 페이지를 고른다. 그 둘이 통과하면 = 중간 형태들은 다 통과한다.

| Deck 유형 | 권장 showcase 페이지 조합 |
|-----------|---------------------|
| B2B brochure / 제품 홍보 | 표지 + 내용 페이지(철학/감성 페이지) |
| 브랜드 발표 | 표지 + 제품 특징 페이지 |
| 데이터 리포트 | 데이터 대형 그래픽 페이지 + 분석 결론 페이지 |
| 강의 교안 | 챕터 표지 + 구체적 지식 페이지 |

---

## 📐 출판물 grammar 템플릿 (moxt 실측, 재사용 가능)

B2B brochure / 제품 홍보 / 장문 리포트류 deck에 적합하다. 페이지마다 이 구조를 재사용 = 13페이지 시각이 완전히 일관되고 재작업 0.

### 페이지 골격

```
┌─ masthead(상단 strip + 가로선)─────────────┐
│  [logo 22-28px] · A Product Brochure                Issue · Date · URL │
├──────────────────────────────────────────┤
│                                          │
│  ── kicker(초록 짧은 선 + uppercase 라벨) │
│  CHAPTER XX · SECTION NAME                 │
│                                          │
│  H1(중문 Noto Serif SC 900)               │
│  핵심 단어만 브랜드 주색으로                │
│                                          │
│  English subtitle (Lora italic, 부제)     │
│  ─────────── 구분선 ──────────            │
│                                          │
│  [본 내용: 2단 60/40 / 2x2 grid / 목록]   │
│                                          │
├──────────────────────────────────────────┤
│ section name                     XX / total │
└──────────────────────────────────────────┘
```

### 스타일 규약 (그대로 가져다 쓰세요)

- **H1**: 중문 Noto Serif SC 900, 자크기 80-140px을 정보량에 맞춰, 핵심 단어만 브랜드 주색으로(전문에 색을 쌓지 말 것)
- **영문 부제**: Lora italic 26-46px, 브랜드 시그니처 단어(예: "AI team")는 볼드 + 주색 이탤릭
- **본문**: Noto Serif SC 17-21px, line-height 1.75-1.85
- **accent 강조**: 본문에서 주색 볼드로 핵심어를 표시, 페이지당 3곳 이하(많아지면 앵커 역할을 잃는다)
- **배경**: 따뜻한 아이보리 바닥 #FAFAFA + 아주 옅은 radial-gradient noise(`rgba(33,33,33,0.015)`)로 종이 느낌을 더한다

### 시각 주인공은 반드시 페이지마다 달라야 한다

13페이지가 전부 「텍스트 + 스크린샷 한 장」이면 너무 단조롭다. **페이지별 시각 주인공 유형을 돌려 쓴다.**

| 시각 유형 | 어울리는 section |
|---------|---------------|
| 표지 조판(큰 글자 + masthead + pillar) | 첫 페이지 / 챕터 표지 |
| 단일 캐릭터 portrait(초대형 momo 한 마리 등) | 개념/캐릭터 하나를 소개 |
| 다중 캐릭터 단체샷 / 프로필 카드 나열 | 팀 / 사용자 사례 |
| 타임라인 카드 점진 | 「장기 관계」「진화」를 보여줄 때 |
| 지식 그래프 / 노드 연결도 | 「협업」「흐름」을 보여줄 때 |
| Before/After 대비 카드 + 중간 화살표 | 「변화」「차이」를 보여줄 때 |
| 제품 UI 스크린샷 + 외곽선 디바이스 프레임 | 구체적 기능 소개 |
| 큰 인용부호 big-quote(반 페이지 큰 글자) | 감정 페이지 / 문제 페이지 / 인용 페이지 |
| 실제 인물 사진 + 인용 카드(2×2 또는 1×4) | 사용자 증언 / 사용 장면 |
| 큰 글자 뒤표지 + URL 타원 버튼 | CTA / 마무리 |

---

## ⚠️ 자주 밟는 함정 (moxt 실전 정리)

### 1. Chromium / Playwright 내보내기에서 이모지가 렌더링되지 않는다

Chromium은 기본적으로 컬러 이모지 글꼴을 싣지 않아서, `page.pdf()`나 `page.screenshot()` 때 이모지가 빈 네모로 나온다.

**대책**: 유니코드 문자 기호(`✦` `✓` `✕` `→` `·` `—`)로 바꾸거나, 아예 순수 텍스트로 고친다(「📧 23 emails」가 아니라 「Email · 23」).

### 2. `export_deck_pdf.mjs`가 `Cannot find package 'playwright'` 에러를 낸다

원인: ESM 모듈 해석은 스크립트가 있는 위치에서 위로 올라가며 `node_modules`를 찾는다. 스크립트는 `~/.claude/skills/design-studio/scripts/`에 있고 거기엔 의존성이 없다.

**대책**: 스크립트를 deck 프로젝트 디렉터리로 복사하고(예: `brochure/build-pdf.mjs`), 프로젝트 루트에서 `npm install playwright pdf-lib`를 돌린 뒤 `node build-pdf.mjs --slides slides --out output/deck.pdf`를 실행한다.

### 3. Google Fonts 로딩이 끝나기 전에 스크린샷 → 중문이 시스템 기본 고딕으로 나온다

Playwright 스크린샷/PDF 전에 최소 `wait-for-timeout=3500`을 줘서 webfont가 내려오고 paint되게 한다. 또는 글꼴을 `shared/fonts/`에 self-host해서 네트워크 의존을 줄인다.

### 4. 정보 밀도 불균형: 내용 페이지에 너무 많이 넣는다

moxt philosophy 페이지 초판은 2×2 = 4개 단락 + 하단 3개 신조 = 7개 블록이라 답답하고 중복됐다. 1×3 = 3개 단락으로 고치자 숨 쉴 틈이 바로 돌아왔다.

**대책**: 페이지당 「핵심 정보 1개 + 보조 포인트 3-4개 + 시각 주인공 1개」로 통제하고, 넘치면 새 페이지로 쪼갠다. **적은 것이 많은 것이다** — 관객은 한 페이지를 10초 본다. 기억점 4개보다 1개를 주는 쪽이 더 잘 남는다.

---

## 🛑 아키텍처를 먼저 정한다: 단일 파일이냐 다중 파일이냐?

**이 선택이 슬라이드 제작의 첫 단계고, 틀리면 같은 함정을 반복해서 밟는다. 이 절을 다 읽고 손을 대세요.**

### 두 아키텍처 비교

| 항목 | 단일 파일 + `deck_stage.js` | **다중 파일 + `deck_index.html` 취합기** |
|------|--------------------------|--------------------------------------|
| 코드 구조 | HTML 하나, 모든 slide가 `<section>` | 페이지별 독립 HTML, `index.html`이 iframe으로 취합 |
| CSS 스코프 | ❌ 전역. 한 페이지 스타일이 모든 페이지에 영향 | ✅ 자연 격리. iframe마다 별세계 |
| 확인 단위 | ❌ JS goTo를 써야 특정 페이지로 이동 | ✅ 단일 페이지 파일을 더블클릭하면 브라우저에서 바로 보인다 |
| 병렬 개발 | ❌ 파일 하나라 여러 agent가 고치면 충돌 | ✅ 여러 agent가 서로 다른 페이지를 동시에, 충돌 0 merge |
| 디버깅 난도 | ❌ CSS 한 곳이 틀리면 deck 전체가 뒤집힌다 | ✅ 한 페이지 오류는 자기 페이지만 영향 |
| 내장 인터랙션 | ✅ 페이지 간 상태 공유가 아주 쉽다 | 🟡 iframe 사이에는 postMessage가 필요 |
| PDF 인쇄 | ✅ 내장 | ✅ 취합기가 beforeprint에서 iframe을 순회 |
| 키보드 내비게이션 | ✅ 내장 | ✅ 취합기에 내장 |

### 어느 쪽을 고르나? (결정 트리)

```
│ 질문: deck이 몇 페이지 예정인가?
├── 10페이지 이하, in-deck 애니메이션이나 페이지 간 인터랙션 필요, pitch deck → 단일 파일
└── 10페이지 이상, 학술 강연, 교안, 긴 deck, 여러 agent 병렬 → 다중 파일(권장)
```

**기본은 다중 파일 경로다.** 「대안」이 아니라 **긴 deck과 팀 협업의 주 경로**다. 이유: 단일 파일 아키텍처의 장점(키보드 내비게이션, 인쇄, scale)은 다중 파일에도 전부 있는데, 다중 파일의 스코프 격리와 검증 용이성은 단일 파일이 만회할 수 없다.

### 이 규칙이 왜 이렇게 단단한가? (실제 사고 기록)

단일 파일 아키텍처는 AI 심리학 강연 deck 제작에서 함정 네 개를 연달아 밟았다.

1. **CSS 특이도 덮어쓰기**: `.emotion-slide { display: grid }`(특이도 10)가 `deck-stage > section { display: none }`(특이도 2)를 뒤집어서 모든 페이지가 동시에 겹쳐 렌더링됐다.
2. **Shadow DOM slot 규칙이 바깥 CSS에 눌림**: `::slotted(section) { display: none }`이 outer rule의 덮어쓰기를 막지 못해 section들이 숨지 않았다.
3. **localStorage + hash 내비게이션 경합**: 새로고침 후 hash 위치로 가지 않고 localStorage에 기록된 옛 위치에 멈췄다.
4. **검증 비용이 높다**: 특정 페이지를 찍으려면 `page.evaluate(d => d.goTo(n))`을 거쳐야 해서 `goto(file://.../slides/05-X.html)`보다 두 배 느리고, 에러도 자주 났다.

근본 원인은 전부 **단일 전역 이름공간**이다 — 다중 파일 아키텍처는 이 문제들을 물리적으로 없앤다.

---

## 경로 A(기본): 다중 파일 아키텍처

### 디렉터리 구조

```
내Deck/
├── index.html              # assets/deck_index.html에서 복사해 MANIFEST만 고친다
├── shared/
│   ├── tokens.css          # 공유 디자인 token(색판/자크기/공용 chrome)
│   └── fonts.html          # <link>로 Google Fonts 로드(페이지마다 include)
└── slides/
    ├── 01-cover.html       # 각 파일이 완결된 1920×1080 HTML
    ├── 02-agenda.html
    ├── 03-problem.html
    └── ...
```

### slide 한 장의 템플릿 골격

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>P05 · Chapter Title</title>
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
<link rel="stylesheet" href="../shared/tokens.css">
<style>
  /* 이 페이지 전용 스타일. 어떤 class 이름을 쓰든 다른 페이지를 오염시키지 않는다. */
  body { padding: 120px; }
  .my-thing { ... }
</style>
</head>
<body>
  <!-- 1920×1080의 내용(body의 width/height는 tokens.css에서 잠근다) -->
  <div class="page-header">...</div>
  <div>...</div>
  <div class="page-footer">...</div>
</body>
</html>
```

**핵심 제약**:
- `<body>`가 곧 캔버스다. 그 위에 바로 배치한다. `<section>`이나 다른 wrapper로 감싸지 말 것.
- `width: 1920px; height: 1080px`은 `shared/tokens.css`의 `body` 규칙이 잠근다.
- `shared/tokens.css`를 로드해 디자인 token(색판, 자크기, page-header/footer 등)을 공유한다.
- 글꼴 `<link>`는 페이지마다 각자 쓴다(fonts를 따로 import하는 비용은 크지 않고, 페이지마다 독립적으로 열리는 것이 보장된다).

### 취합기: `deck_index.html`

**`assets/deck_index.html`에서 그대로 복사한다.** 고칠 곳은 한 군데뿐이다 — `window.DECK_MANIFEST` 배열에 모든 slide 파일명과 사람이 읽을 수 있는 라벨을 순서대로 적는다.

```js
window.DECK_MANIFEST = [
  { file: "slides/01-cover.html",    label: "표지" },
  { file: "slides/02-agenda.html",   label: "목차" },
  { file: "slides/03-problem.html",  label: "문제 정의" },
  // ...
];
```

취합기에는 이미 들어 있다: 키보드 내비게이션(←/→/Home/End/숫자키/P 인쇄), scale + letterbox, 우하단 카운터, localStorage 기억, hash 페이지 이동, 인쇄 모드(iframe을 순회해 페이지 단위로 PDF 출력).

#### 두 가지 개요 모드 (적응형 + 함정 방지, 2026-06 재작성)

deck을 열면 기본으로 **개요**로 들어간다. 사용자가 지정하지 않으면 초 단위로 무작위: **그리드 grid 60% / 무한 갤러리 gallery 40%**(URL `?ov=grid|gallery` 또는 `window.DECK_OVERVIEW='grid'|'gallery'`로 고정 가능).

- **그리드 grid(기본 주력)**: **iframe으로 실제 하위 페이지를 렌더링**한다(선명하고, 보이는 대로가 결과이며, 썸네일이 필요 없다). **적응형**: 한 화면에 들어가면 → 대각으로 기울여 중앙에 가득 채운다. 페이지가 많아 안 들어가면 → 카드를 편안한 크기로 유지하고 **세로 스크롤**한다(수십 페이지를 한 화면에 우표 크기로 밀어넣는 짓은 절대 하지 않는다).
- **무한 갤러리 gallery**: 모든 페이지를 **끊김 없이 무한 타일링 + 느린 표류 + 미세한 호흡 스케일**로 보여준다. 타일 하나에 전체 페이지가 들어간다(셔플 배치, 모든 페이지를 다 본 뒤에 반복). 타일이 많으니 **반드시 `<img>` 썸네일로 성능을 버텨야 한다**(아래 참조). thumb가 없으면 iframe으로 되돌아간다.

🛑 **실전에서 나온 하드 제약 3개(이 파일을 고치기 전에 반드시 읽으세요. 안 그러면 같은 실수를 되풀이한다)**:
1. **개요 벽을 `transform-style: preserve-3d`로 카드 벽처럼 만들지 절대 말 것.** preserve-3d의 3D 장면에서는 브라우저가 「뒤로 물러난 카드」(맨 윗줄)의 히트 테스트를 신뢰할 수 없게 처리한다 → 윗줄은 클릭이 안 되고 중간 줄은 될 때도 안 될 때도 있다. **정답**: 벽 전체를 **3D로 기울어진 하나의 평면**으로 다룬다(preserve-3d를 켜지 않는다). 모든 카드가 같은 평면에 있으므로 클릭은 하나의 평면으로 역투영된다 → 신뢰할 수 있다. hover는 `translateZ`가 아니라 2D `scale`로 한다.
2. **페이지 수가 얼마든 적응해야 한다**: 열 수를 고정하고 벽 전체에 강한 기울기를 박아두면, 페이지가 늘어나는 순간 넘쳐서 모서리가 무너지고 원근이 일그러진다. 페이지 수 + 뷰포트로 열 수를 계산하고, 행이 많으면 기울기를 눕히고, 한 화면에 안 들어가면 스크롤한다.
3. **썸네일 해상도를 너무 낮추지 말 것**: 갤러리 썸네일이 1000px 미만이면 hover로 확대할 때 뭉개진다. 기본 1600px.

**갤러리용 썸네일 생성**: `scripts/gen_deck_thumbs.mjs`를 쓴다(playwright로 페이지마다 캡처 + sharp로 다운샘플링).
```bash
npm install playwright sharp
node gen_deck_thumbs.mjs --slides slides --out thumbs --width 1600
```
그 뒤 MANIFEST 각 항목에 `thumb: "thumbs/<같은이름>.jpg"`를 추가한다. 그리드 모드는 thumb를 무시하고(항상 iframe) 갤러리 모드만 쓴다.

### 단일 페이지 검증 (다중 파일 아키텍처의 결정적 장점)

slide는 모두 독립 HTML이다. **한 장 만들면 바로 브라우저에서 더블클릭해 확인한다.**

```bash
open slides/05-personas.html
```

Playwright 스크린샷도 `goto(file://.../slides/05-personas.html)`로 바로 된다. JS로 페이지를 이동할 필요가 없고, 다른 페이지의 CSS에 방해받지도 않는다. 덕분에 「조금 고치고 조금 확인하는」 작업 흐름의 비용이 거의 0이 된다.

### 병렬 개발

slide별 작업을 서로 다른 agent에 쪼개서 동시에 돌린다 — HTML 파일이 서로 독립적이라 merge 때 충돌이 없다. 긴 deck을 이 방식으로 병렬화하면 제작 시간을 1/N까지 줄일 수 있다.

### `shared/tokens.css`에는 무엇을 넣나

**정말로 페이지를 넘어 공용인 것**만 넣는다.

- CSS 변수(색판, 자크기 단계, 간격 단계)
- `body { width: 1920px; height: 1080px; }` 같은 canvas 잠금
- `.page-header` / `.page-footer`처럼 모든 페이지가 똑같이 쓰는 chrome

단일 페이지의 레이아웃 class는 **넣지 말 것** — 그러면 단일 파일 아키텍처의 전역 오염 문제로 되돌아간다.

---

## 경로 B(작은 deck): 단일 파일 + `deck_stage.js`

10페이지 이하, 페이지 간 상태 공유가 필요한 경우(예: React tweaks 패널 하나가 모든 페이지를 조작), 또는 pitch deck demo처럼 극도로 압축된 장면에 쓴다.

### 기본 사용법

1. `assets/deck_stage.js`의 내용을 읽어 HTML의 `<script>`에 넣는다(또는 `<script src="deck_stage.js">`)
2. body 안에서 `<deck-stage>`로 slide를 감싼다
3. 🛑 **script 태그는 반드시 `</deck-stage>` 뒤에 둔다**(아래 하드 제약 참조)

```html
<body>

  <deck-stage>
    <section>
      <h1>Slide 1</h1>
    </section>
    <section>
      <h1>Slide 2</h1>
    </section>
  </deck-stage>

  <!-- ✅ 올바름: script가 deck-stage 뒤에 있다 -->
  <script src="deck_stage.js"></script>

</body>
```

### 🛑 Script 위치 하드 제약 (2026-04-20 실제 사고)

**`<script src="deck_stage.js">`를 `<head>`에 두면 안 된다.** `<head>`에서 `customElements`를 정의할 수는 있지만, parser가 `<deck-stage>` 시작 태그를 만나는 순간 `connectedCallback`이 발동한다 — 이때 자식 `<section>`은 아직 parse되지 않았으므로 `_collectSlides()`가 빈 배열을 받고, counter는 `1 / 0`을 표시하며 모든 페이지가 동시에 겹쳐 렌더링된다.

**규격에 맞는 세 가지 작성법**(아무거나 하나):

```html
<!-- ✅ 가장 권장: script가 </deck-stage> 뒤에 -->
</deck-stage>
<script src="deck_stage.js"></script>

<!-- ✅ 가능: script를 head에 두되 defer를 붙인다 -->
<head><script src="deck_stage.js" defer></script></head>

<!-- ✅ 가능: module 스크립트는 본래 defer다 -->
<head><script src="deck_stage.js" type="module"></script></head>
```

`deck_stage.js` 자체에 `DOMContentLoaded` 지연 수집 방어가 들어 있어서, script를 head에 둬도 완전히 터지지는 않는다 — 그래도 `defer`나 body 하단이 더 깔끔하고, 방어 분기에 기대지 않는 편이 낫다.

### ⚠️ 단일 파일 아키텍처의 CSS 함정 (반드시 읽으세요)

단일 파일 아키텍처에서 가장 흔한 함정 — **`display` 속성을 단일 페이지 스타일이 빼앗아 간다.**

흔한 실수 1(section에 display: flex를 직접 쓴다):

```css
/* ❌ 외부 CSS 특이도 2가 shadow DOM의 ::slotted(section){display:none}(역시 2)을 덮어썼다 */
deck-stage > section {
  display: flex;            /* 모든 페이지가 동시에 겹쳐 렌더링된다! */
  flex-direction: column;
  padding: 80px;
  ...
}
```

흔한 실수 2(section에 특이도가 더 높은 class가 있다):

```css
.emotion-slide { display: grid; }   /* 특이도: 10, 더 나쁘다 */
```

둘 다 **모든 slide가 동시에 겹쳐 렌더링되게** 만든다 — counter는 `1 / 10`을 띄우며 정상인 척할 수 있지만, 화면에서는 첫 페이지가 두 번째를 덮고 그게 세 번째를 덮는다.

### ✅ Starter CSS (착수할 때 그대로 복사하면 함정을 피한다)

**section 자신**은 「보임/안 보임」만 담당하고, **layout(flex/grid 등)은 `.active`에 쓴다.**

```css
/* section에는 display가 아닌 공통 스타일만 정의 */
deck-stage > section {
  background: var(--paper);
  padding: 80px 120px;
  overflow: hidden;
  position: relative;
  /* ⚠️ 여기에 display를 쓰지 말 것! */
}

/* 「비활성이면 숨김」을 잠근다 — 특이도 + 가중치 이중 보험 */
deck-stage > section:not(.active) {
  display: none !important;
}

/* 활성 페이지에만 필요한 display + layout을 쓴다 */
deck-stage > section.active {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* 인쇄 모드: 모든 페이지가 보여야 하므로 :not(.active)를 덮는다 */
@media print {
  deck-stage > section { display: flex !important; }
  deck-stage > section:not(.active) { display: flex !important; }
}
```

대안: **단일 페이지의 flex/grid를 내부 wrapper `<div>`에 쓴다.** section 자체는 언제나 `display: block/none` 전환기일 뿐이다. 이게 가장 깔끔하다.

```html
<deck-stage>
  <section>
    <div class="slide-content flex-layout">...</div>
  </section>
</deck-stage>
```

### 사용자 지정 크기

```html
<deck-stage width="1080" height="1920">
  <!-- 9:16 세로판 -->
</deck-stage>
```

---

## Slide Labels

Deck_stage와 deck_index 모두 페이지마다 라벨을 붙인다(카운터에 표시). **의미 있는** 라벨을 주세요.

**다중 파일**: `MANIFEST`에 `{ file, label: "04 문제 정의" }`
**단일 파일**: section에 `<section data-screen-label="04 Problem Statement">`

**핵심: Slide 번호는 1부터 시작한다. 0부터가 아니다.**

사용자가 "slide 5"라고 하면 다섯 번째 장을 말하는 것이고, 절대 배열 위치 `[4]`가 아니다. 사람은 0-indexed로 말하지 않는다.

---

## Speaker Notes

**기본은 넣지 않는다.** 사용자가 명확히 요구할 때만 넣는다.

speaker notes를 넣으면 slide 위 글자를 최소로 줄이고 impactful visuals에 집중할 수 있다 — 완결된 script는 notes가 담는다.

### 형식

**다중 파일**: `index.html`의 `<head>`에 쓴다.

```html
<script type="application/json" id="speaker-notes">
[
  "1번째 장 script...",
  "2번째 장 script...",
  "..."
]
</script>
```

**단일 파일**: 위와 같은 위치.

### Notes 작성 요점

- **완결성**: 개요가 아니라 실제로 말할 말이다
- **대화체**: 평소 말하듯이. 문어체가 아니다
- **대응**: 배열의 N번째가 N번째 slide에 대응한다
- **길이**: 200-400자가 최적
- **감정선**: 강세, 멈춤, 강조점을 표시한다

---

## Slide 디자인 패턴

### 1. 시스템을 하나 세운다 (필수)

design context 탐색이 끝나면 **쓸 시스템을 먼저 말로 밝힌다.**

```markdown
Deck 시스템:
- 배경색: 최대 2종(90% 흰색 + 10% 어두운 section divider)
- 서체: display는 Instrument Serif, body는 Geist Sans
- 리듬: section divider는 full-bleed 컬러 + 흰 글자, 일반 slide는 흰 바닥
- 이미지: hero slide는 full-bleed 사진, data slide는 chart

이 시스템대로 만듭니다. 문제가 있으면 알려주세요.
```

사용자 확인을 받고 다음으로 넘어간다.

### 2. 자주 쓰는 slide layout

- **Title slide**: 단색 배경 + 거대한 제목 + 부제 + 저자/날짜
- **Section divider**: 컬러 배경 + 챕터 번호 + 챕터 제목
- **Content slide**: 흰 바닥 + 제목 + 1-3개 bullet points
- **Data slide**: 제목 + 큰 차트/숫자 + 짧은 설명
- **Image slide**: full-bleed 사진 + 하단 작은 caption
- **Quote slide**: 여백 + 거대한 quote + attribution
- **Two-column**: 좌우 대비(vs / before-after / problem-solution)

deck 하나에 layout은 최대 4-5종까지.

### 3. Scale (다시 강조)

- 본문 최소 **24px**, 이상적으로 28-36px
- 제목 **60-120px**
- Hero 글자 **180-240px**
- 슬라이드는 10미터 밖에서 보는 것이다. 글자는 충분히 커야 한다

### 4. 시각 리듬

Deck에는 **intentional variety**가 필요하다.

- 색 리듬: 대부분 흰 바닥 + 이따금 컬러 section divider + 이따금 dark 구간
- 밀도 리듬: text-heavy 몇 장 + image-heavy 몇 장 + quote 여백 몇 장
- 자크기 리듬: 평범한 제목 + 이따금 거대한 hero 텍스트

**모든 slide가 똑같이 생기면 안 된다** — 그건 PPT 템플릿이고 디자인이 아니다.

### 5. 공간의 호흡 (데이터 밀집 페이지는 필독)

**초보가 가장 쉽게 밟는 함정**: 넣을 수 있는 정보를 다 한 페이지에 밀어넣는다.

정보 밀도 ≠ 유효 정보 전달. 학술/강연류 deck은 특히 절제해야 한다.

- 목록/매트릭스 페이지: N개 요소를 다 같은 크기로 그리지 말 것. **주종 층위**를 쓴다 — 오늘 이야기할 5개를 키워 주인공으로 두고, 남은 16개는 줄여 배경 hint로 둔다.
- 큰 숫자 페이지: 숫자 자체가 시각 주인공이다. 주변 caption은 3줄을 넘기지 말 것. 넘으면 관객 눈이 왔다 갔다 한다.
- 인용 페이지: 인용문과 attribution 사이에 여백을 둬서 떨어뜨린다. 붙여 놓지 말 것.

「데이터가 주인공인가」「글자가 서로 끼어 있지 않은가」 두 항목으로 자기검토하고, 여백이 조금 불안할 정도까지 고친다.

---

## PDF로 인쇄

**다중 파일**: `deck_index.html`이 이미 `beforeprint` 이벤트를 처리해 페이지 단위로 PDF를 출력한다.

**단일 파일**: `deck_stage.js`도 같이 처리한다.

인쇄 스타일은 이미 작성돼 있으니 `@media print` CSS를 따로 쓸 필요가 없다.

---

## PPTX / PDF로 내보내기 (셀프서비스 스크립트)

HTML 우선이 제1원칙이다. 다만 사용자는 PPTX/PDF 납품을 자주 필요로 한다. **다중 파일 deck이면 어디에나 쓸 수 있는** 범용 스크립트 두 개를 `scripts/` 아래에 둔다.

### `export_deck_pdf.mjs` — 벡터 PDF 내보내기 (다중 파일 아키텍처)

```bash
node scripts/export_deck_pdf.mjs --slides <slides-dir> --out deck.pdf
```

**특징**:
- 텍스트가 **벡터로 남는다**(복사 가능, 검색 가능)
- 시각 100% 충실(Playwright 내장 Chromium이 렌더링한 뒤 인쇄)
- **HTML을 한 글자도 고칠 필요가 없다**
- slide별로 `page.pdf()`를 따로 돌리고 `pdf-lib`로 합친다

**의존성**: `npm install playwright pdf-lib`

**한계**: PDF는 텍스트를 다시 편집할 수 없다 — 고치려면 HTML로 돌아간다.

### `export_deck_stage_pdf.mjs` — 단일 파일 deck-stage 아키텍처 전용 ⚠️

**언제 쓰나**: deck이 단일 HTML 파일 + `<deck-stage>` web component가 N개 `<section>`을 감싼 형태(즉 경로 B 아키텍처)일 때. 이때는 `export_deck_pdf.mjs`의 「HTML마다 `page.pdf()` 한 번」 방식이 통하지 않으므로 이 전용 스크립트로 간다.

```bash
node scripts/export_deck_stage_pdf.mjs --html deck.html --out deck.pdf
```

**export_deck_pdf.mjs를 재사용할 수 없는 이유**(2026-04-20 실제 사고 기록):

1. **Shadow DOM이 `!important`를 이긴다**: deck-stage의 shadow CSS에 `::slotted(section) { display: none }`이 있다(active인 장만 `display: block`). light DOM에서 `@media print { deck-stage > section { display: block !important } }`를 써도 누르지 못한다 — `page.pdf()`가 print 미디어를 발동시킨 뒤 Chromium의 최종 렌더링에는 active인 장만 남고, 결과적으로 **PDF 전체가 1페이지**(현재 active slide의 반복)가 된다.

2. **페이지마다 goto를 반복해도 여전히 1페이지만 나온다**: 직관적 해법인 「`#slide-N`마다 navigate한 뒤 `page.pdf({pageRanges:'1'})`」도 실패한다 — shadow DOM 밖의 print CSS에 있는 `deck-stage > section { display: block }` 규칙이 override된 뒤 최종 렌더링은 언제나 section 목록의 첫 번째가 되기 때문이다(navigate한 그 페이지가 아니다). 결과는 17번 순회해서 P01 표지 17장.

3. **absolute 자식 요소가 다음 페이지로 넘어간다**: 모든 section을 렌더링시키는 데 성공했더라도, section 자체가 `position: static`이면 그 안의 absolute로 배치된 `cover-footer`/`slide-footer`는 initial containing block을 기준으로 배치된다 — section이 print에서 1080px 높이로 강제되면 absolute footer가 다음 페이지로 밀릴 수 있다(PDF가 section 수보다 1페이지 많고, 그 여분 페이지에는 footer만 외로이 있는 형태로 나타난다).

**수정 전략**(스크립트에 이미 구현돼 있다):

```js
// HTML을 열고 나서 page.evaluate로 section을 deck-stage slot에서 끄집어내
// body 아래 일반 div에 바로 붙이고, 인라인 style로 position:relative + 고정 크기를 보장한다
await page.evaluate(() => {
  const stage = document.querySelector('deck-stage');
  const sections = Array.from(stage.querySelectorAll(':scope > section'));
  document.head.appendChild(Object.assign(document.createElement('style'), {
    textContent: `
      @page { size: 1920px 1080px; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; }
      deck-stage { display: none !important; }
    `,
  }));
  const container = document.createElement('div');
  sections.forEach(s => {
    s.style.cssText = 'width:1920px!important;height:1080px!important;display:block!important;position:relative!important;overflow:hidden!important;page-break-after:always!important;break-after:page!important;background:#F7F4EF;margin:0!important;padding:0!important;';
    container.appendChild(s);
  });
  // 마지막 페이지는 페이지 나눔을 끊어서 꼬리 빈 페이지를 막는다
  sections[sections.length - 1].style.pageBreakAfter = 'auto';
  sections[sections.length - 1].style.breakAfter = 'auto';
  document.body.appendChild(container);
});

await page.pdf({ width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
```

**이게 왜 작동하나**:
- section을 shadow DOM slot에서 light DOM의 일반 div로 뽑아내 `::slotted(section) { display: none }` 규칙을 완전히 우회한다
- 인라인 `position: relative`로 absolute 자식이 section을 기준으로 배치되어 넘치지 않는다
- `page-break-after: always`로 브라우저가 인쇄할 때 section마다 독립 페이지가 된다
- `:last-child`는 페이지를 나누지 않아 꼬리 빈 페이지를 막는다

**`mdls -name kMDItemNumberOfPages`로 확인할 때 주의**: macOS의 Spotlight metadata에는 캐시가 있어서 PDF를 다시 쓴 뒤에는 `mdimport file.pdf`로 강제 갱신해야 한다. 안 그러면 옛 페이지 수가 보인다. `pdfinfo`를 쓰거나 `pdftoppm`으로 파일 개수를 세는 것이 진짜 값이다.

---

### `export_deck_pptx.mjs` — 편집 가능한 PPTX 내보내기

```bash
# 유일한 모드: 텍스트 박스가 네이티브로 편집 가능(글꼴은 시스템 글꼴로 되돌아간다)
node scripts/export_deck_pptx.mjs --slides <dir> --out deck.pptx
```

작동 원리: `html2pptx`가 요소마다 computedStyle을 읽어 DOM을 PowerPoint 객체(text frame / shape / picture)로 번역한다. 텍스트는 진짜 텍스트 박스가 되고, PPT에서 더블클릭하면 바로 편집된다.

**하드 제약**(HTML이 만족해야 한다. 아니면 그 페이지는 skip된다. 자세한 설명은 `references/editable-pptx.md`):
- 모든 텍스트는 `<p>`/`<h1>`-`<h6>`/`<ul>`/`<ol>` 안에 있어야 한다(맨 텍스트 div 금지)
- `<p>`/`<h*>` 태그 자체에 background/border/shadow를 걸 수 없다(바깥 div에)
- `::before`/`::after`로 장식 텍스트를 넣지 않는다(가상 요소는 뽑아낼 수 없다)
- inline 요소(span/em/strong)에 margin을 걸 수 없다
- CSS gradient를 쓰지 않는다(렌더링 불가)
- div에 `background-image`를 쓰지 않는다(`<img>`를 쓴다)

스크립트에는 **자동 전처리기**가 들어 있다 — 「말단 div 안의 맨 텍스트」를 자동으로 `<p>`로 감싼다(class는 보존). 이것으로 가장 흔한 위반(맨 텍스트)은 해결된다. 다만 다른 위반(p에 border, span에 margin 등)은 여전히 HTML 원본에서 규격을 맞춰야 한다.

**글꼴 되돌림 caveat**:
- Playwright는 webfont로 text-box 크기를 측정하고, PowerPoint/Keynote는 로컬 글꼴로 렌더링한다
- 둘이 다르면 **넘침이나 어긋남**이 생긴다 — 페이지마다 눈으로 확인해야 한다
- 대상 기기에 HTML에서 쓴 글꼴을 설치하거나 `system-ui`로 fallback하는 것을 권한다

**시각 우선 장면에서는 이 경로로 가지 말 것** → `export_deck_pdf.mjs`로 PDF를 뽑는다. PDF는 시각 100% 충실, 벡터, 크로스플랫폼, 텍스트 검색 가능 — 시각 우선 deck의 진짜 종착지이고, 「편집할 수 없는 타협」 같은 게 아니다.

### 처음부터 HTML을 내보내기 친화적으로 쓴다

성능이 가장 안정적인 deck: **HTML을 쓰는 시점부터 editable의 4개 하드 제약에 맞춰 쓴다.** 그러면 `export_deck_pptx.mjs`가 전부 그대로 pass한다. 추가 비용은 크지 않다.

```html
<!-- ❌ 나쁨 -->
<div class="title">핵심 발견</div>

<!-- ✅ 좋음(p로 감싸고 class를 그대로 계승) -->
<p class="title">핵심 발견</p>

<!-- ❌ 나쁨(border가 p에 있다) -->
<p class="stat" style="border-left: 3px solid red;">41%</p>

<!-- ✅ 좋음(border가 바깥 div에) -->
<div class="stat-wrap" style="border-left: 3px solid red;">
  <p class="stat">41%</p>
</div>
```

### 언제 어느 쪽을 고르나

| 장면 | 권장 |
|------|------|
| 주최 측 제출 / 기록 보관 | **PDF**(범용, 고충실, 텍스트 검색 가능) |
| 협업자에게 보내 문구를 다듬게 함 | **PPTX editable**(글꼴 되돌림을 수용) |
| 현장 발표용, 내용 수정 없음 | **PDF**(벡터 충실, 크로스플랫폼) |
| HTML이 1순위 표현 매체 | 브라우저로 바로 재생. 내보내기는 백업일 뿐 |

## 편집 가능한 PPTX 심화 경로 (장기 프로젝트만)

deck을 오래 유지하고 반복 수정하고 팀으로 협업할 것이라면 — **처음부터 html2pptx 제약에 맞춰 HTML을 쓰는 것**을 권한다. 그러면 `export_deck_pptx.mjs`가 전부 그대로 pass한다. 자세히는 `references/editable-pptx.md`(4개 하드 제약 + HTML 템플릿 + 흔한 오류 속견표 + 시각 원고가 이미 있을 때의 fallback 절차).

---

## 자주 나오는 문제

**다중 파일: iframe 안의 페이지가 열리지 않는다 / 백지다**
→ `MANIFEST`의 `file` 경로가 `index.html` 기준으로 맞는지 확인한다. 브라우저 DevTools에서 iframe의 src에 직접 접근되는지 본다.

**다중 파일: 어떤 페이지 스타일이 다른 페이지와 충돌한다**
→ 불가능하다(iframe 격리). 충돌처럼 느껴지면 캐시다 — Cmd+Shift+R로 강제 새로고침.

**단일 파일: 여러 slide가 동시에 겹쳐 렌더링된다**
→ CSS 특이도 문제다. 위의 「단일 파일 아키텍처의 CSS 함정」 절을 보세요.

**단일 파일: 확대·축소가 이상하다**
→ 모든 slide가 `<deck-stage>` 바로 아래 `<section>`으로 달려 있는지 확인한다. 중간에 `<div>`가 끼면 안 된다.

**단일 파일: 특정 slide로 이동하고 싶다**
→ URL에 hash를 붙인다: `index.html#slide-5`로 5번째 장으로 간다.

**두 아키텍처 공통: 화면마다 글자 위치가 달라진다**
→ 고정 크기(1920×1080)와 `px` 단위를 쓴다. `vw`/`vh`나 `%`를 쓰지 않는다. 확대·축소는 한 곳에서 처리한다.

---

## 검증 체크리스트 (deck을 끝내면 반드시 통과)

1. [ ] 브라우저에서 `index.html`(또는 주 HTML)을 직접 열어 첫 페이지에 깨진 이미지가 없고 글꼴이 로드됐는지 확인
2. [ ] → 키로 모든 페이지를 넘겨 빈 페이지와 레이아웃 어긋남이 없는지 확인
3. [ ] P 키로 인쇄 미리보기, 페이지마다 정확히 A4 한 장(또는 1920×1080)이고 잘림이 없는지 확인
4. [ ] 무작위로 3페이지를 골라 Cmd+Shift+R 강제 새로고침, localStorage 기억이 정상 작동하는지 확인
5. [ ] Playwright로 일괄 스크린샷(단일 페이지 아키텍처: `slides/*.html` 순회. 단일 파일 아키텍처: goTo로 전환) 후 사람이 눈으로 한 번 훑기
6. [ ] `TODO` / `placeholder` 잔재를 검색해 전부 정리됐는지 확인
