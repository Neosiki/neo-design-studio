# 편집 가능한 PPTX 내보내기: HTML 하드 제약 사항 + 크기 결정 + 일반적인 오류

이 문서는 **사용하여`scripts/html2pptx.js` + `pptxgenjs`HTML을 요소별로 진짜 편집 가능한 PowerPoint 텍스트 상자로 변환하는** 경로이자,`export_deck_pptx.mjs`유일하게 지원되는 경로.

> **핵심 전제**: 이 경로를 따르려면 HTML은 첫 줄부터 아래 4가지 제약 사항을 준수하여 작성해야 합니다. **작성 후 변환하는 것이 아님** — 사후 수정 시 2~3시간의 재작업이 발생합니다(2026-04-20 옵션 프라이빗 자문회 프로젝트 실측 사례).
>
> 시각적 자유도가 우선시되는 시나리오(애니메이션 / web component / CSS 그라데이션 / 복잡한 SVG)의 경우 PDF 경로로 변경하십시오 (`export_deck_pdf.mjs` / `export_deck_stage_pdf.mjs`), pptx 내보내기가 시각적 충실도와 편집 가능성을 모두 충족할 것이라고 **기대하지 마세요**. 이는 PPTX 파일 형식 자체의 물리적 제약입니다(문서 끝의 「왜 4가지 제약 조건이 버그가 아닌 물리적 제약인가」 참조).

---

## 캔버스 크기: 960×540pt(LAYOUT_WIDE) 사용

PPTX 단위는 px가 아니라 **inch**(물리적 크기)입니다. 결정 원칙: body의 computedStyle 크기는 **presentation layout의 inch 크기와 일치**해야 합니다(±0.1", 에 의해`html2pptx.js`의`validateDimensions` 강제 검사).

### 3가지 후보 크기 비교

| HTML body | 물리적 크기 | 대응하는 PPT 레이아웃 | 선택 시점 |
|---|---|---|---|
| **`960pt × 540pt`** | **13.333″ × 7.5″** | **pptxgenjs `LAYOUT_WIDE`** | ✅ **기본 권장** (최신 PowerPoint 16:9 표준 사양) |`720pt × 405pt`| 10″ × 5.625″ | 사용자 지정 | 사용자가 「이전 버전 PowerPoint Widescreen」 템플릿을 지정한 경우에만 |
|`1920px × 1080px`| 20″ × 11.25″ | 사용자 정의 | ❌ 비표준 크기, 투사 후 글꼴이 비정상적으로 작게 보임 |

**HTML 크기를 해상도로 생각하지 마세요.** PPTX는 벡터 문서이며, body 크기는 선명도가 아닌 **물리적 크기**를 결정합니다. 초대형 body(20″×11.25″)는 텍스트를 더 선명하게 만들지 않습니다. 오히려 캔버스 대비 글자 크기(pt)가 작아져 투사/인쇄 시 가독성이 떨어집니다.

### body 작성법 세 가지 중 선택 (동일함)```css
body { width: 960pt;  height: 540pt; }    /* 가장 선명함, 권장 */
body { width: 1280px; height: 720px; }    /* 동일, px 사용에 익숙한 경우 */
body { width: 13.333in; height: 7.5in; }  /* 동일, 인치 단위에 익숙한 경우 */
```
관련된 pptxgenjs 코드:```js
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';  // 13.333 × 7.5 inch, 사용자 지정 불필요
```
## 4가지 하드 제약 사항 (위반 시 즉시 에러 발생)`html2pptx.js`HTML의 DOM을 요소별로 PowerPoint 객체로 변환합니다. PowerPoint의 서식 제약 조건을 HTML에 투영하면 다음과 같은 4가지 규칙이 적용됩니다.

### 규칙 1: DIV 내부에 텍스트를 직접 작성할 수 없음 — 반드시 사용해야 함`<p>` 또는 `<h1>`-`<h6>`감싸기```html
<!-- ❌ 오류: 텍스트가 div 안에 직접 있음 -->
<div class=\\"title\\">Q3 매출이 23% 증가</div>

<!-- ✅ 올바름: 텍스트는 <p> 또는 <h1>-<h6> 안에 있어야 함 -->
<div class=\"title\"><h1>Q3 매출 23% 증가</h1></div>
<div class=\"body\"><p>신규 사용자가 주요 동력입니다</p></div>
```
**이유**: PowerPoint 텍스트는 반드시 text frame 내에 존재해야 하며, text frame은 HTML의 단락 수준 요소(p/h*/li)에 대응합니다. Bare`<div>`PPTX에는 대응하는 텍스트 컨테이너가 없습니다.

**또한 사용할 수 없습니다`<span>`메인 텍스트를 담는 역할**——span은 인라인 요소이므로, 텍스트 박스로 독립적인 정렬이 불가능합니다. span은** p/h\* 안에 포함되어** 부분적인 스타일(굵게, 색상 변경)을 적용할 때만 사용합니다.

### 규칙 2: CSS 그라데이션 미지원 — 단색만 사용 가능```css
/* ❌ 오류 */
background: linear-gradient(to right, #FF6B6B, #4ECDC4);

/* ✅ 올바름：단색 */
background: #FF6B6B;

/* ✅ 만약 여러 색 줄무늬가 필요하다면, flex 자식 요소를 각자 단색으로 사용 */
.stripe-bar { display: flex; }
.stripe-bar div { flex: 1; }
.red   { background: #FF6B6B; }
.teal  { background: #4ECDC4; }
```
**이유**: PowerPoint의 shape fill은 solid/gradient-fill 두 가지만 지원하지만, pptxgenjs의`fill: { color: ... }`solid만 매핑합니다. 그라데이션은 PowerPoint 네이티브 gradient를 사용하며 별도의 구조 작성이 필요합니다. 현재 툴체인에서는 지원하지 않습니다.

### 규칙 3: 배경/테두리/그림자는 DIV에만 적용할 수 있으며, 텍스트 태그에는 적용할 수 없습니다.```html
<!-- ❌ 잘못됨：<p> 배경색이 있음 -->
<p style=\"background: #FFD700; border-radius: 4px;\">중요 내용</p>

<!-- ✅ 올바른 예：외부 div가 배경/테두리를 담당하고，<p>는 텍스트만 담당합니다 -->
<div style="background: #FFD700; border-radius: 4px; padding: 8pt 12pt;">
  <p>중요 내용</p>
</div>
```
**이유**: PowerPoint에서 shape(사각형/둥근 모서리 사각형)와 text frame은 두 개의 객체입니다. HTML의`<p>`text frame으로만 번역하며, 배경/테두리/그림자는 shape에 속합니다. 반드시 **text를 감싸는 div**에 작성해야 합니다.

### 규칙 4: DIV는 사용할 수 없습니다`background-image` — 사용`<img>`태그```html
<!-- ❌ 오류 -->
<div style="background-image: url('chart.png')"></div>

<!-- ✅ 올바름 -->
<img src="chart.png" style="position: absolute; left: 50%; top: 20%; width: 300pt; height: 200pt;" />
```
**이유**:`html2pptx.js`오직 ~에서만`<img>`CSS를 파싱하지 않고 요소에서 이미지 경로 추출`background-image` URL.

---

## 텍스트 상자 병합(`data-pptx-merge`)

**기본 동작**: HTML 내의 각`<p>`/`<h1>`-`<h6>`PPTX 내에서는 모두 **독립된 텍스트 상자**입니다. 카드에는 3개를 작성합니다.`<p>`→ PPT 내 텍스트 상자 3개가 겹쳐 있어, 편집 시 전체 문단에 엔터로 줄바꿈이나 단락을 추가할 수 없고 글자 크기나 정렬을 일일이 수정해야 합니다.

**해결 방법**: 외곽 div에`data-pptx-merge="true"`, 컨테이너 내의 모든  `<p>/<h*>`**하나의 편집 가능한 텍스트 상자**로 병합되며, 각 단락 사이는 단락 구분 기호로 구분되어 PPT 내에서 단락별로 연속해서 편집할 수 있습니다.```html
<!-- ✅ 병합 방식：4단락을 모두 하나의 텍스트 상자에 넣음 -->
<div class="card" data-pptx-merge="true"
     style="position: absolute; top: 60pt; left: 60pt; width: 420pt;
            background: #1A4A8A; border-radius: 8pt; padding: 20pt 24pt;">
  <h2 style=\"font-size: 24pt; color: #FFFFFF;\">제목</h2>
  <p  style=\"font-size: 14pt; color: #DDEEFF;\">첫 번째 단락 본문입니다.</p>
  <p  style="font-size: 14pt; color: #FFD166;">두 번째 단락: 색을 바꿔 강조합니다.</p>
  <p  style="font-size: 14pt; color: #DDEEFF;">세 번째 단락: 같은 텍스트 상자 안에서 계속 씁니다.</p>
</div>
```
**유지되는 스타일**(per-paragraph를 run options로 작성):`font-size`、`color`、`font-family`、`font-weight`（bold）、`font-style`（italic）、`text-decoration: underline`、`<b>/<i>/<u>/<strong>/<em>/<span>`인라인 스타일.

**첫 번째 단락에서 가져옴, 전체 프레임 통일**:`text-align`、`line-height`. PowerPoint의 정렬과 행간은 paragraph/textbox 레벨이므로, 한 텍스트 박스 안에는 한 가지 정렬만 가능합니다. 여러 단락의 정렬이 다르다면 merge를 사용하지 말고 각각 독립적으로 유지해 주세요.

**컨테이너 자체의`background`/`border`/`box-shadow`/`border-radius`** 평소와 같이 shape로 렌더링되며, 동작은 일반 div와 완전히 동일합니다. ——즉, 파란색 카드 배경 + 텍스트는 여전히 「shape + text frame」 두 개의 레이어로 유지되지만, 텍스트 레이어가 3-4개의 텍스트 박스에서 1개로 축소됩니다.

**제한 사항**:
- 중첩 불가`data-pptx-merge`(오류가 발생합니다).
- 컨테이너를 사용할 수 없습니다`background-image`(4가지 하드 제약 규칙 중 규칙 4와 동일).
- 컨테이너 내부에 더 이상`background`/`border`의 하위 div — 이들은 여전히 독립된 shape로 렌더링되지만, 내부 텍스트가 이미 병합되어 시각적 어긋남이 발생할 수 있습니다.

**사용 시점**: 내용을 반복적으로 수정하거나 PPT에서 계속 편집해야 하는 시나리오에서 사용합니다. 일회성으로 내보내어 아카이빙하는 경우에는 추가할 필요가 없으며, 동작은 동일합니다.

---

## Path A HTML 템플릿 골격

슬라이드당 하나의 독립된 HTML 파일을 사용하며, 서로의 스코프가 격리됩니다(단일 파일 deck의 CSS 오염 방지).```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 960pt; height: 540pt;           /* ⚠️ LAYOUT_WIDE와 일치 */
    font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
    background: #FEFEF9;                    /* 단색, 그라데이션 불가 */
    overflow: hidden;
  }
  /* DIV 레이아웃/배경/테두리를 담당 */
  .card {
    position: absolute;
    background: #1A4A8A;                    /* 배경은 DIV에 있음 */
    border-radius: 4pt;
    padding: 12pt 16pt;
  }
  /* 텍스트 태그는 글꼴 스타일만 담당하며 배경/테두리는 추가하지 않음 */
  .card h2 { font-size: 24pt; color: #FFFFFF; font-weight: 700; }
  .card p  { font-size: 14pt; color: rgba(255,255,255,0.85); }
</style>
</head>
<body>

  <!-- 제목 영역：바깥 div 위치 지정，내부 텍스트 태그 -->
  <div style="position: absolute; top: 40pt; left: 60pt; right: 60pt;">
    <h1 style="font-size: 36pt; color: #1A1A1A; font-weight: 700;">제목은 단언문으로, 주제어가 아닙니다</h1>
    <p style="font-size: 16pt; color: #555555; margin-top: 10pt;">부제 보충 설명</p>
  </div>

  <!-- 내용 카드：div가 배경을 담당하고，h2/p가 텍스트를 담당함 -->
  <div class="card" style="top: 130pt; left: 60pt; width: 240pt; height: 160pt;">
    <h2>요점 1</h2>
    <p>간단 설명 문구</p>
  </div>

  <!-- 목록: ul/li 사용, 수동 • 기호 사용 금지 -->
  <div style="position: absolute; top: 320pt; left: 60pt; width: 540pt;">
    <ul style="font-size: 16pt; color: #1A1A1A; padding-left: 24pt; list-style: disc;">
      <li>첫 번째 요점</li>
      <li>두 번째 요점</li>
      <li>세 번째 요점</li>
    </ul>
  </div>

  <!-- 삽화: <img> 태그를 사용하고 background-image는 사용하지 마세요 -->
  <img src="illustration.png" style="position: absolute; right: 60pt; top: 110pt; width: 320pt; height: 240pt;" />

</body>
</html>
```
## 자주 발생하는 오류 해결

| 오류 메시지 | 원인 | 해결 방법 |
|---------|------|---------|`DIV element contains unwrapped text "XXX"` | div 내에 일반 텍스트가 있음 | 텍스트를 감싸기 `<p>` 또는  `<h1>`-`<h6>` |
| `CSS gradients are not supported`| linear/radial-gradient 사용 | 단색으로 변경하거나 flex 자식 요소를 사용하여 분할 |`Text element <p> has background` | `<p>`태그 배경색 추가 | 아우터`<div>` 배경을 수용하며,`<p>`| 텍스트만 작성 |`Background images on DIV elements are not supported`| div에 background-image 사용 | 변경 ️|`<img>`| 태그 |`HTML content overflows body by Xpt vertically` | 콘텐츠 540pt 초과 | 콘텐츠를 줄이거나 글자 크기를 축소, 또는 ️`overflow: hidden` 생략 |`HTML dimensions don't match presentation layout`| body 사이즈와 pres layout이 일치하지 않음 | body 사용 |`960pt × 540pt`매칭`LAYOUT_WIDE`; 또는 defineLayout 사용자 정의 크기 |`Text box "XXX" ends too close to bottom edge` | 큰 글자 
`<p>`body 하단과의 거리 < 0.5 inch | 위로 이동하여 하단 여백을 충분히 확보하세요. PPT 하단은 원래 일부분이 가려집니다. |

---

## 기본 워크플로우 (3단계로 PPTX 생성)

### Step 1: 제약 사항에 맞춰 페이지별 독립 HTML 작성```
내Deck/
├── slides/
│   ├── 01-cover.html    # 각 파일은 완전한 960×540pt HTML입니다
│   ├── 02-agenda.html
│   └── ...
└── illustration/        # 모든 <img> 참조 이미지
    ├── chart1.png
    └── ...
```
### Step 2: build.js 호출 작성 
`html2pptx.js`

```js
const pptxgen = require('pptxgenjs');
const html2pptx = require('../scripts/html2pptx.js');  // 이 스킬 스크립트

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';  // 13.333 × 7.5 inch，HTML의 960×540pt에 맞춤

  const slides = ['01-cover.html', '02-agenda.html', '03-content.html'];
  for (const file of slides) {
    await html2pptx(`./slides/${file}`, pres);
  }

  await pres.writeFile({ fileName: 'deck.pptx' });
})();
```
### Step 3: 검토

- PowerPoint/Keynote에서 내보낸 PPTX 열기
- 임의의 텍스트를 더블 클릭했을 때 직접 편집이 가능해야 함 (이미지로 표시된다면 1번 규칙 위반)
- overflow 검증: 각 페이지는 body 범위 내에 있어야 하며 잘리지 않아야 함

---

## 이 경로 vs 기타 옵션 (상황별 선택 가이드)

| 요구사항 | 선택 |
|------|------|
| 동료가 PPTX의 텍스트를 수정해야 하거나 비기술자에게 전달하여 편집을 계속하는 경우 | **본 문서의 경로** (편집 가능, 처음부터 4가지 제약 조건에 따라 HTML 작성 필요) |
| 발표 전용 / 아카이브용 전달, 더 이상 수정하지 않음 |`export_deck_pdf.mjs`(여러 파일) 또는  `export_deck_stage_pdf.mjs`(단일 파일 deck-stage), 벡터 PDF 출력 |
| 시각적 자유도 우선(애니메이션, web component, CSS 그라데이션, 복잡한 SVG), 편집 불가능 수용 가능 | **PDF**(위와 동일)——PDF는 재현성이 높고 크로스 플랫폼을 지원하므로 '이미지형 PPTX'보다 적합함 |

**시각적 요소 중심으로 작성된 HTML에 html2pptx를 억지로 실행하지 마세요**——실제 테스트 결과, 시각적 중심 HTML의 성공률은 30% 미만이며, 남은 페이지를 하나씩 수정하는 것이 새로 만드는 것보다 느립니다. 이런 상황에서는 PPTX를 억지로 만들기보다 PDF를 출력해야 합니다.

---

## Fallback: 이미 시각 원고가 있지만 사용자가 editable PPTX를 고집하는 경우

가끔 이런 상황이 발생합니다. 개발자나 사용자가 이미 시각적 중심의 HTML(그라데이션, web component, 복잡한 SVG 등이 모두 사용됨)을 작성했고, 원래는 PDF 출력이 가장 적합하지만, 사용자가 "안 됩니다. 반드시 편집 가능한 PPTX여야 합니다"라고 명확하게 요구하는 경우입니다.

**억지로 실행하지 마세요**`html2pptx`그것이 pass되기를 기대하는 것——실측 결과 시각 중심의 HTML은 html2pptx에서 pass율이 30% 미만이며, 나머지 70%는 오류가 발생하거나 레이아웃이 깨집니다. 올바른 fallback은 다음과 같습니다:

### Step 1 · 먼저 한계점 고지(투명한 커뮤니케이션)

한 문장으로 사용자에게 세 가지 사항을 명확히 설명합니다:

> 「현재 HTML에 [구체적 나열: 그라데이션 / web component / 복잡한 SVG / ...]이 사용되어, editable PPTX로 직접 변환 시 fail할 수 있습니다. 두 가지 방안이 있습니다:
> - A. **PDF 출력** (권장) —— 시각적 요소가 100% 보존되며, 수신자가 확인 및 인쇄할 수 있으나 텍스트 수정은 불가능합니다.
> - B. **시각적 시안을 바탕으로 editable HTML 재작성** (색상/레이아웃/카피의 디자인 결정 사항은 유지하되, 4가지 제약 사항에 맞춰 HTML 구조를 재구성하며, 그라데이션, web component, 복잡한 SVG 등의 시각적 기능은 **희생**) → 이후 editable PPTX로 내보내기
>
> 어떤 것을 선택하시겠습니까?」

B 방안을 대수롭지 않게 말하지 마세요. **무엇을 잃게 되는지** 명확히 고지하여 사용자가 선택하게 해야 합니다.

### Step 2 · 사용자가 B를 선택한 경우: AI가 주도적으로 재작성하며, 사용자에게 직접 작성을 요구하지 않음

여기서의 doctrine은 다음과 같습니다: **사용자는 디자인 의도를 제공하고, 당신은 이를 규격에 맞는 구현으로 번역할 책임이 있습니다.** 사용자가 4가지 제약 사항을 학습하여 직접 재작성하게 해서는 안 됩니다.

재작성 시 준수 원칙:
- **유지**: 컬러 시스템(주색/보조색/무채색), 정보 계층(제목/부제목/본문/주석), 핵심 카피, layout 골격(상중하 / 좌우 분할 / 그리드), 페이지 리듬
- **다운그레이드**: CSS 그라데이션 → 단색 또는 flex 세그먼트, web component → 단락 수준의 HTML, 복잡한 SVG → 단순화된`<img>`또는 단색 도형, 그림자 → 삭제 또는 극도로 약화, 사용자 정의 폰트 → 시스템 폰트에 맞춤
- **재작성**: 일반 텍스트 → 감싸기`<p>` / `<h*>`、`background-image` → `<img>`태그,`<p>`상의 배경 테두리 → 외부 div에서 담당

### Step 3 · 대조 리스트 생성 (투명한 인도)

리라이팅이 완료된 후 사용자에게 before/after 대조표를 제공하여, 어떤 시각적 디테일이 간소화되었는지 알 수 있게 합니다:```
원래 디자인 → editable 버전 조정
- 제목 영역 보라색 그라데이션 → 메인 색상 #5B3DE8 단색 배경
- 데이터 카드 그림자 → 삭제（대신 2pt 테두리로 구분）
- 복잡한 SVG 꺾은선 그래프 → <img> PNG로 단순화（HTML에서 스크린샷으로 생성）
- Hero 구역 web component 모션 효과 → 정적 첫 프레임（web component 번역 불가）
```
### Step 4 · 내보내기 & 듀얼 포맷 전달

- 
`editable`버전 HTML → 실행`scripts/export_deck_pptx.mjs`편집 가능한 PPTX 출력
- **원본 시안을 함께 유지하는 것을 권장** → 실행`scripts/export_deck_pdf.mjs`고해상도 PDF 출력
- 사용자에게 두 가지 형식으로 전달: 디자인 시안 PDF + 편집 가능한 PPTX, 각자의 역할 수행

### B 안을 즉시 거절해야 하는 경우

특정 상황에서 재작성 비용이 너무 높을 경우, 사용자에게 편집 가능한(editable) PPTX를 포기하도록 권유해야 함:
- HTML의 핵심 가치가 애니메이션이나 인터랙션인 경우 (재작성 후 정적인 첫 프레임만 남아 정보량이 50% 이상 손실됨)
- 페이지 수 > 30, 재작성 비용이 2시간을 초과하는 경우
- 시각적 디자인이 정교한 SVG / 사용자 정의 필터(filter)에 크게 의존하는 경우 (재작성 후 원본과 거의 무관해짐)

이때 사용자에게 다음과 같이 안내함: "이 데크(deck)는 재작성 비용이 너무 높으므로 PPTX 대신 PDF로 출력하는 것을 권장합니다. 수신 측에서 반드시 PPTX 형식을 원한다면 시각적 요소가 크게 단순화되는 것을 감수해야 합니다. PDF로 변경하시겠습니까?"

---

## 왜 4가지 제약 사항이 버그가 아닌 물리적 제약인가

이 4가지는`html2pptx.js`작성자가 게으름을 피운 것이 아니라 — 이것들은 **PowerPoint 파일 형식(OOXML) 자체의 제약 사항**이 HTML로 투영된 결과입니다:

- PPTX 내의 텍스트는 반드시 text frame(`<a:txBody>`), 단락 수준의 HTML 요소에 대응함
- PPTX의 shape와 text frame은 두 개의 객체이며, 동일한 element 상에서 배경 그리기와 텍스트 작성을 동시에 할 수 없습니다.
- PPTX의 shape fill은 gradient 지원이 제한적입니다(일부 preset gradients만 지원하며, CSS의 임의 각도 그라데이션은 지원하지 않음).
- PPTX의 picture 객체는 반드시 실제 이미지 파일을 참조해야 하며, CSS 속성이 아닙니다.

이 점을 이해했다면, **도구가 똑똑해지기를 기대하지 마세요** —— HTML 작성 방식이 PPTX 형식에 맞춰져야 하는 것이지, 그 반대가 아닙니다.