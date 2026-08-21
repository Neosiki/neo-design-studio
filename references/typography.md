# Typography — 조판 추론 시스템

> **이것은 글꼴 목록이 아니라 배합과 조판의 추론 규칙이다.** `design-styles.md`가 이미 60종 스타일별 글꼴 이름을 줬다. 이 문서가 답하는 것은 「왜 이렇게 배합하는가」와 「임의의 내용을 받았을 때 글자 크기·행장·굵기를 어떻게 추론하는가」다. 목표는 같은 스타일 이름이 서로 다른 내용에 얹혔을 때 서로 다른 조판 결과가 나오게 하는 것이다. 매번 같은 글자 크기 세트를 베끼는 것이 아니다.
>
> 앞선 규율은 그대로다. design context가 있으면 사용자 자신의 글꼴을 먼저 lift한다(`design-context.md` 참고). 이 문서의 모든 내용은 「사용자에게 글꼴 규범이 없을 때」에만 발동한다.

## 0. 조판 결정 순서

내용을 받으면 이 순서로 추론한다. 각 단계는 앞 단계가 정하며, 「그냥 예쁜 글꼴 하나 고르기」로 건너뛰는 것은 허용하지 않는다.

1. **내용 유형** → 긴 글 읽기 / 데이터 밀집 / 마케팅 대자 / UI 화면. 음계 비율과 본문 글자 크기가 여기서 정해진다
2. **언어 구성** → 순 중문 / 중서 혼합 / 순 서문. fallback 사슬을 쓰는 법과 행간 기준이 여기서 정해진다
3. **스타일 온도**(`design-styles.md`의 차분/중성/대담 세 단계에 맞춘다) → 글꼴 배합의 대비를 어디서 끌어올지가 정해진다
4. **글꼴 이름은 맨 마지막** → 아래 3장 배합표에서 고르거나, 스타일 라이브러리의 해당 항목에서 가져온다

왜 그런가: 글꼴 이름을 먼저 고르는 방식은 「내용이 무엇인가」가 조판에 아무 영향도 주지 못하게 만든다. 이것이 천 편이 한 얼굴인 병의 뿌리다.

## 1. 글자 크기 음계(modular scale)

글자 크기는 즉흥적으로 정하는 것이 아니라, 본문 글자 크기에 고정 비율을 곱해 단계별로 추론해 내는 것이다. 비율이 페이지의 「극적인 정도」를 정한다.

| 비율 | 이름 | 성격 | 쓰는 곳 |
|------|------|------|------|
| 1.2 | 단3도 | 완만하고, 층위가 많아도 시끄럽지 않다 | dashboard, 문서 사이트, 정보 밀집 UI |
| 1.25 | 장3도 | 범용적이고 안전하다 | 대부분의 웹페이지, 제품 랜딩 페이지 |
| 1.333 | 완전4도 | 표제가 뚜렷하게 튀어나온다 | editorial 장문, 마케팅 페이지, 보고서 |
| 1.5 | 완전5도 | 극적이고, 층위가 극히 적다 | 대자 포스터, slides, 한 화면 한 문장 hero |

**추론 규칙**: 본문을 16-18px로 정한다(한글·한자 본문은 17-18px를 권한다. 획이 촘촘해 같은 크기에서 서문보다 빽빽해 보인다). 그다음 비율대로 표제를 위로 올리고 caption을 아래로 내린다. 층위가 5단을 넘으면 통제를 잃은 것이니 잘라낸다.

| 단계 | 1.25 비율에서의 참고값 | 용도 |
|------|--------------------|------|
| caption | 12-13px | 그림 설명, meta 정보, EXIF 식 잔글씨 |
| small | 14px | 보조 설명, 표 |
| body | 16-18px | 본문, 모든 것의 기준 |
| h3 | ≈1.25x | 소절 표제 |
| h2 | ≈1.56x | 장 표제 |
| h1 | ≈1.95x | 페이지 표제 |
| display | 3x-8x, 음계를 벗어나 자유롭게 | hero 거대 글자. 음계가 아니라 판면이 정한다 |

**유동 글자 크기 쓰는 법**(display 단계는 필수. 큰 화면에서 딱딱해지고 작은 화면에서 넘치는 것을 막는다):

```css
/* clamp(최솟값, 선호값, 최댓값): 선호값 = 기본 rem + 뷰포트 계수 */
h1 { font-size: clamp(2rem, 1.2rem + 3.5vw, 4.5rem); }
.display { font-size: clamp(3rem, 1rem + 9vw, 9rem); }
/* 본문은 clamp으로 크게 흔들지 않는다. 16→18의 좁은 구간이면 된다 */
body { font-size: clamp(1rem, 0.95rem + 0.3vw, 1.125rem); }
```

왜 display는 음계를 벗어나는가: hero 거대 글자는 텍스트 층위가 아니라 판면 요소다. 그 크기는 「뷰포트의 몇 할을 차지하는가」가 정하므로, 음계보다 vw로 추론하는 편이 더 합리적이다.

## 2. 행장과 행간

### 행장(글꼴 선택보다 가독성에 더 크게 작용한다)

| 언어 | 편한 구간 | CSS 구현 |
|------|--------|----------|
| 서문 본문 | 45-75자, 최적은 66 | `max-width: 65ch` |
| 한글·한자 본문 | 한 줄 22-38자, 최적은 28-32자 | `max-width: 36em`(em은 글자 크기에 따라 함께 늘어난다) |
| 그림 설명·사이드바 | 더 짧게, 한글·한자 15-20자 | 좁은 컨테이너가 저절로 제한한다 |

왜 한글·한자가 더 짧은가: 한자는 낱말 사이 공백이 없는 촘촘한 네모틀 글자이고, 한글도 네모틀을 획으로 채운다. 같은 폭에 담기는 정보량이 서문보다 뚜렷하게 많고, 같은 횟수의 눈 도약으로 더 많은 내용을 읽어 들인다. 행이 너무 길면 줄을 바꿀 때 다음 줄 첫머리를 찾지 못한다.

### 행간은 행장에 연동된다

행간은 상수가 아니라 행장의 함수다. 행이 길수록 눈이 되돌아오는 거리가 멀어지므로, 더 큰 줄 사이 간격이 「선로」 노릇을 해 줘야 한다.

| 장면 | 서문 | 한글·한자 |
|------|------|------|
| display 대자(1-2행) | 0.95-1.1 | 1.1-1.25 |
| 표제(h1-h3) | 1.1-1.3 | 1.3-1.4 |
| 짧은 행 본문(<30자/행) | 1.4-1.5 | 1.6-1.7 |
| 긴 행 본문(상한에 가까움) | 1.6 | 1.8-2.0 |

한글·한자는 전 구간에서 서문보다 0.2 정도 높다: 네모틀 글자는 자면이 꽉 차 있어 서문 소문자 사이에 있는 천연 공백이 없고, 행간이 부족하면 한 덩어리로 뭉개진다.

### text-wrap(2024+ 브라우저는 전부 지원한다. 공짜로 얻는 조판 품질)

```css
h1, h2, h3 { text-wrap: balance; }  /* 표제가 여러 행일 때 각 행 길이를 고르게 맞춰 외자 행을 없앤다 */
p { text-wrap: pretty; }            /* 본문의 행 끝 외톨이 낱말을 없앤다(서문에서 효과가 뚜렷하고 한글·한자에서는 미미하다) */
```

balance는 ≤4행 표제에만 쓴다(알고리즘이 6행으로 제한하고 성능 비용도 있다). pretty는 본문에 전역으로 줘도 부작용이 없다.

## 3. 오픈소스 글꼴 배합 열 조(서문)

배합의 대비는 세 곳에서 나온다. 배합하기 전에 어느 쪽을 쓸지 먼저 정한다.

- **형식 대비**: 세리프 display x 산세리프 body(가장 고전적이지만 x-height가 맞물려야 한다. 그러지 않으면 시각적 글자 크기가 튄다)
- **같은 집안 맞물림**: superfamily의 같은 설계 골격(위험은 0, 대가는 평범함)
- **시대 대비**: 고전 자형 x 현대 자형(계보가 200년 이상 벌어져야 장력이 생긴다. 50년 차이는 어수선해 보일 뿐이다)

| # | 배합(display + body) | 배합 논리 | 온도 | 구하는 곳 |
|---|------------------------|----------|------|------|
| 1 | Newsreader + Geist | 형식 대비: 화면 표시에 최적화된 과도기 세리프. x-height가 높아 Geist와 잘 맞물린다. **Fraunces의 정통 대안** | 차분 | Google Fonts / Vercel 공식 저장소 |
| 2 | Source Serif 4 + Source Sans 3 | 같은 집안 맞물림: Adobe의 같은 설계 시스템이라 글자 높이와 굵기 리듬이 완전히 정렬된다. 보고서와 문서에서 사고가 없다 | 차분 | Google Fonts |
| 3 | EB Garamond + IBM Plex Sans | 시대 대비: 16세기 프랑스 올드 세리프 x 2017년 이성적 grotesque, 400년 차이의 장력. 단 Garamond는 x-height가 낮아 같은 행에 섞어 쓰면 글자 크기 보정이 필요하다(+8%가 경험적 출발점이고, 체계적 해법은 `font-size-adjust`. 4장 참고) | 차분·문기 | Google Fonts |
| 4 | Lora + Hanken Grotesk | 형식 대비: Lora는 붓 느낌 세리프에 중간 반차로 화면에서 오래 봐도 괜찮다. Hanken은 Söhne 기질의 오픈소스 근친 | 중성 | Google Fonts |
| 5 | Instrument Serif + Geist | 형식 대비: 굵기가 400 한 단계뿐이라 태생이 display-only, 본문은 반드시 sans에 맡긴다. ⚠️ AI 도구가 닳도록 쓰는 길에 올라섰으니 2026년에 「독특해 보이고 싶은」 자리에는 신중하게 | 중성 | Google Fonts |
| 6 | Schibsted Grotesk + Source Serif 4 | 뒤집은 구조: grotesque를 display로, 세리프를 본문으로 써서 매체 느낌을 낸다. **Space Grotesk 범람 이후의 대안**(노르웨이 Schibsted 신문사 전용으로 만들어 오픈소스로 풀렸고 뉴스 혈통이 있다) | 중성 | Google Fonts |
| 7 | Bricolage Grotesque + Newsreader | 형식 대비: Bricolage의 ink trap과 불규칙한 디테일은 큰 글자에서만 드러나니 태생이 display다. 차분한 세리프 본문과 붙으면 거친 x 우아한 대비가 생긴다 | 대담 | Google Fonts |
| 8 | Archivo(Expanded/Black) + Inter | 대자 포스터 구조: Archivo 광폭 검은 굵기가 판을 누르고, Inter는 14-16px 본문 일벌만 맡는다(이것이 Inter의 올바른 용법이다. 반패턴 참고) | 대담 | Google Fonts |
| 9 | Cormorant Garamond + Work Sans | 고반차 사치감: Cormorant는 획이 극도로 얇아 **반드시 ≥40px에서만 성립하고** 작은 크기에서는 획이 끊긴다. 패션·우주 도록 풍에 맞는다 | 대담 | Google Fonts |
| 10 | Geist Mono / JetBrains Mono + Geist | 고정폭을 주역으로: 명령줄 느낌, 엔지니어링 느낌. 고정폭은 레이블·번호·코드에만 쓴다. 본문 전체를 고정폭으로 짜는 것은 재난이다(행장이 30% 팽창한다) | 중성·기술 | Vercel / JetBrains 공식, 둘 다 OFL |

**너무 많이 쓰여 버린 목록**(AI 생성 페이지의 지문이다. 쓰는 순간 스스로 폭로하는 셈이다):

| 흔해진 것 | 왜 나쁜가 | 대안 |
|--------|----------|------|
| Fraunces를 display로 | 2023-2025년 모든 AI 디자인 도구의 기본 「고급스러운」 선택지였다 | Newsreader, Libre Caslon Text |
| Inter를 display로 | Inter는 UI 작은 글자용으로 설계돼 큰 글자에서는 균질하고 표정이 없다```css
/* 서문이 앞, 중문이 뒤, 시스템 중문이 받침, 총칭 계열로 마무리 */
font-family: "Geist", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
/* 세리프도 같은 이치 */
font-family: "Newsreader", "Noto Serif SC", "Songti SC", serif;
```

왜 이 순서인가: font-family는 글자 단위로 맞춰 나가고, 서문 글꼴에는 CJK 코드 포인트가 없으므로 한글·한자는 자연히 CJK 글꼴로 투과된다. 거꾸로 쓰면(CJK가 앞) 서문 글자를 CJK 글꼴이 전부 먹어 버려 배합이 헛일이 된다.

**글자 크기 보정**: 같은 글자 크기에서 서문 소문자는 시각적으로 작아 보인다(x-height가 글자 몸의 절반만 차지하는데, 한자는 꽉 채운다). 해법은 두 가지다.

```css
/* 해법 1: font-size-adjust로 fallback 글꼴을 x-height 기준으로 정규화(Chrome 127+/FF/Safari 17+) */
:root { font-size-adjust: from-font; }
/* 해법 2: x-height가 높은 서문체를 고른다(Geist/Inter/Source Sans 모두 높다). 혼합이 저절로 맞는다 */
```

**baseline 정렬**: 중문과 서문의 baseline이 어긋나면 영어 낱말이 중문 행 안에서 「가라앉는」 증상이 나온다. x-height가 더 높은 서문체로 바꾸는 것을 먼저 시도한다. 개별 display 장면에서는 `vertical-align: -0.02em~-0.06em`으로 서문 span을 미세 조정하되, 본문은 이렇게 고치지 않는다(유지 비용이 이득보다 크다).

**숫자 규칙**: 숫자는 예외 없이 서문 글꼴로 간다(fallback 사슬이 이미 보장한다). 데이터 표에는 반드시 `font-variant-numeric: tabular-nums`를 넣는다. 그렇지 않으면 1과 8의 너비가 달라 열이 어긋난다.

**중문과 영문 사이에는 공백을 넣지 않는다**: 이는 이 저장소의 중문 작성 규범이다(Neo(Neo)가 「반고지백」을 사용하지 않기로 명확히 규정했다). 여백은 fallback 체인에 포함된 글꼴 자체가 생성하도록 하며, 수동으로 공백를 입력하지 않는다.

### 4.3 한글·한자에는 이탤릭이 없다

한글·한자 자형에는 italic 전통이 없으므로, 브라우저가`font-style: italic`을 만나면 글자를 기계적으로 기울인다(faux italic). 획이 변형되고 몹시 추하다. 강조 수단 대체표는 이렇다.

| 서문 관습 | 한글·한자 대체 | CSS |
|----------|----------|-----|
| italic 강조 | 굵기를 바꾼다 | `font-weight: 600`(전제: 글꼴에 그 굵기가 실제로 있어야 한다) |
| italic 책 제목·인용 | 배경색 하이라이트 | `background: linear-gradient(transparent 60%, #FFE9A8 60%)` 형광펜 식 |
| italic 인용문 블록 | 글꼴을 바꾼다 | 인용문 문단 전체를 하무문개로 바꾼다. 해서체 자체가 중문의 「인용 어조」다 |
| italic 고유명사 | 색·방점 |`text-emphasis: dot`(방점. CJK 원생 강조이고 지원도 쓸 만해졌다) |

퓨즈: `font-synthesis: none;`으로 합성 이탤릭과 합성 굵기를 전역에서 막는다. 강조를 못 하는 편이 변형된 글자를 받아들이는 것보다 낫다.

### 4.4 표점 규범

| 규칙 | 방법 | 왜 |
|------|------|--------|
| 따옴표 | 직각 따옴표 「」『』를 쓰고 굽은 따옴표 "" 는 쓰지 않는다 | 굽은 따옴표는 중문 글꼴 안에서 전각 자리를 차지하지만 모양이 서문이라 시각적으로 붕 뜬다. 「」는 이 저장소의 중문 하드 규범이다 |
| 금칙 처리 | `line-break: strict;` | 마침표·쉼표가 줄 첫머리에, 여는 따옴표가 줄 끝에 오는 것을 금지한다. 한글·한자 조판의 최저선이다 |
| 표점 매달기 | `hanging-punctuation: first allow-end;`(Safari만) / 브라우저를 가로지를 때는 `text-indent: -0.5em`으로 문단 첫머리의 여는 따옴표를 처리한다 | 문단 첫머리의 여는 따옴표가 매달리지 않으면 첫 행이 반 칸 들여쓴 것처럼 보여 시각적 왼쪽 변이 맞지 않는다 |
| 잇단 표점 압축 | `font-feature-settings: "halt";`(행 끝 압축) 또는 `"palt"`(전 비례 폭. letter-spacing과 함께 써야 한다) | 중문 전각 표점이 잇달아 놓이면(예: 「）。」) 한 글자 반 폭의 빈 구멍이 생긴다. halt가 그것을 좁힌다 |

### 4.5 한글·한자 letter-spacing 구간

| 장면 | 구간 | 왜 |
|------|------|--------|
| 본문 | 0에서 0.05em까지 | 자간을 살짝 더하면 숨통이 트인다. 0.05em을 넘으면 낱말의 완형이 흩어져 읽는 속도가 떨어진다 |
| 표제(24-48px) | 0 | 네모틀 글자는 자간이 본래 고르므로 서문식 tracking 조정이 필요 없다 |
| display 거대 글자(>60px) | -0.02em에서 0까지 | 큰 글자에서는 자면 사이 공백이 확대되니 살짝 조이면 더 단단해진다. 더 음수로 가면 획이 부딪힌다 |
| 전부 대문자인 서문 잔레이블 | 0.08-0.15em | 자간을 크게 벌려야 하는 유일한 장면이고, 서문 대문자에만 유효하다 |

**한글·한자에는 서문의 저 「display는 -0.05em으로 조인다」를 절대 쓰지 않는다**: 네모틀 글자는 자면이 꽉 차게 설계돼 있어 음수 자간이 곧 획 충돌이다.

### 4.6 중문 display 대자

중문에는 서문의 Ultra Thin부터 Black까지 같은 display 글꼴 생태가 없다. 대자의 극적인 효과는 추론으로 만들어 내야 한다.

- **굵기 대비가 주`writing-mode: vertical-rl`로 책등식 표제, 시, 목차를 만든다. 서문은 못 하는 일이다. 세로쓰기 안의 서문과 숫자는 `text-orientation: upright` 또는 `text-combine-upright: all`(두 자리 숫자를 합쳐 곧게 세운다)을 쓴다

## 5. 반패턴 목록

| ❌ 반패턴 | 왜 틀렸나 |
|-----------|----------|
| 전 구간 Inter(display+body를 한 방에) | Inter는 UI 잔글씨용 도구라 display로 쓰면 균질하고 표정이 없다. 이것이 「AI 생성 페이지」의 첫 번째 지문이다 |
| 한글·한자를 `sans-serif`| 시스템 기본값에 맡기기 | 중문은 Windows에서 중이송체/아흑으로, macOS에서 평방으로 폴백(fallback)된다. 동일한 페이지가 기기마다 전혀 다른 모습으로 보이게 되어 디자인을 하지 않은 것과 다름없다. |
| faux italic / faux bold | 브라우저의 합성 변형이다. 이탤릭은 글자를 뒤틀고, 합성 굵기는 획을 뭉쳐 뭉갠다.`font-synthesis: none`서구 문자\" (서문).
    If the original Chinese was \"\u897F\u6587\", and the Korean says \"서문\", it's a \"transliteration\" of the Hanja.
    The prompt says "Translate only Chinese natural-language prose... Keep existing Korean... unchanged".
    If "서문" is Korean, I don't touch it.
    If "서문" is "Chinese natural-language prose" (written in Hangeul?), that doesn't make sense.
    So I don't touch it.

    Final check on "득의흑·경화노송체".
    The dot `·` is the Chinese middle dot `·` (U+00B7) or `・` (U+30FB)?
    In the input, it's `·` (U+00B7). I will keep it.

    I will output the text.

    Wait, I just noticed the first line again.
    `으로 뿌리를 끊는다 |`
    It's missing the opening `|`.
    I will keep it exactly as is.

    Wait, I just noticed "서문 display" and "서문체".
    If I were to translate \"\u897F\u6587\" from Chinese, I would use \"라틴 문자\".
    Since the user provided Korean "서문", and told me to keep Korean unchanged, I will keep "서문".

    One more check: "AI는 흔히 거꾸로 +0.05em을 더한다".
    "AI commonly adds +0.05em in reverse".
    This is good Korean.

    "표제가 헐렁해져 임시 자리표처럼 보인다".
    "The heading becomes loose and looks like a placeholder".
    "임시 자리표" is a good translation for "placeholder```css
:root {
  /* 1. fallback 사슬: 서문 → 중문 → 시스템 중문 → 총칭 계열(순서가 곧 규칙이다. 4.2 참고) */
  --font-body: "Geist", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-display: "Newsreader", "Noto Serif SC", "Songti SC", serif;

  /* 2. 합성 금지: 브라우저가 위조한 이탤릭·굵기를 받지 않는다(CJK 장면에서는 반드시 켠다) */
  font-synthesis: none;

  /* 3. 한글·한자 줄바꿈 최저선 */
  line-break: strict;        /* 금칙 처리 */
  overflow-wrap: break-word; /* 긴 URL이나 영문 문자열이 컨테이너를 밀어 터뜨리지 않게 */
}

body {
  font-family: var(--font-body);
  font-size: 17px;           /* 한글·한자 본문 기준, 1장 참고 */
  line-height: 1.8;          /* 한글·한자 행간 기준, 2장 참고 */
  /* 본문은 표준 합자만 켜고 화려한 기능은 끈다 */
  font-feature-settings: "liga" 1, "calt" 1;
}

/* 데이터 장면: 고정폭 숫자 + 사선 0(0과 O를 혼동하지 않게) */
.data, table { font-variant-numeric: tabular-nums slashed-zero; }

/* 서문 잔레이블: 전부 대문자 + 넓은 자간이 허용되는 유일한 장면 */
.label { text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px; }

/* 표점 압축: 중문 display 대자에서 전각 표점이 만드는 빈 구멍을 좁힌다 */
.display-cjk { font-feature-settings: "halt" 1; }
```
**중문 글꼴 로딩**(단일 파일 5-15MB. 전체를 그대로 불러오면 첫 화면이 망가진다):

- Google Fonts의 Noto SC 계열을 먼저 고른다(이미 unicode-range로 수백 개 조각으로 잘려 있어 브라우저가 쓰는 글자만 내려받는다)
- 개성 있는 글꼴을 self-host할 때(하무 계열·득의흑 등)는 먼저 서브셋을 떠야 한다.`cn-font-split` 또는 fonttools의 `pyftsubset`을 쓴다. 본문 글꼴은 상용 3500자로 자르고, display 글꼴은 실제로 나오는 글자만 자른다(포스터 한 장에 글자가 20개뿐인 경우가 흔하니, 서브셋으로 50KB 안쪽까지 눌러 넣을 수 있다)
- `font-display: swap`으로 최소한을 지킨다. 중문 글꼴은 내려받는 데 오래 걸리고, 흰 화면으로 글꼴을 기다리게 하는 것이 가장 나쁜 경험이다
