# Launch Film 워크플로: 만 자 분량 director's notes를 먼저 쓰고 그다음 애니메이션

> 고규격 시각 작품(20초 이상, 브랜드 서사 포함, slogan reveal 포함, X / 위챗 공식계정 / 빌리빌리 홍보 가능성 있음)의 표준 워크플로다.
>
> 발동 조건: 작업이 「제품 업그레이드 홍보 영상 / 브랜드 launch film / launch trailer / superbowl-tier ad / brand campaign / hero animation video」이고, **사용자가 품질에 대한 기대를 명확히 밝힌 경우**(예: 「슈퍼볼 급 완성도」「10x 디테일」「Apple 급」).
>
> 역발동: 「애니메이션 demo 하나 빨리」「간단한 motion graphic」「아이콘 하나 애니메이션」에는 이 절차를 쓰지 말 것 — 과잉 엔지니어링이 된다.

---

## 1. 왜 director's notes를 먼저 쓰나

실전 교훈(2026-05-11 Design-md-html v2.0 프로젝트):

1라운드에서 곧바로 HTML을 쓰기 시작했더니 나온 건 「프로그래머 시점의 애니메이션」이었다 — capability마다 힘이 균등하고, 리듬이 등속이고, slogan이 서로 부딪히고, 서사 아크가 없었다.
2라운드에서 사용자로부터 「멈춰라. 애플 감독 시점으로 1만 자 분량 콘티 스크립트를 먼저 써라」는 지시를 받고 v5-director-notes.md(11500자, 13컷 shot-by-shot spec)를 썼고, 그 스크립트대로 구현했다 — 한 번에 통과했고, 어느 프레임에서 pause해도 볼 만했고, 리듬에 기복과 climax가 있었다.

**핵심 차이**: 스크립트를 쓰는 것은 think이고 HTML을 쓰는 것은 execute다. think를 먼저 끝내 놓으면 execute는 기계적 번역이 된다. execute를 먼저 하면 shot마다 즉석 판단이 되고, 반드시 흐트러진다.

director's notes를 쓰는 건 「멋 부리기」가 아니다. 모든 시각적 판단을 **손대기 전에** 문서로 침전시키는 일이다 — 컷마다 이미 머릿속에서 visualize하고 reasoning하고 맥락과 trace해 둔 상태다. HTML 구현 시점에는 창작 판단을 다시 할 필요가 없고, 충실히 번역만 하면 된다.

---

## 2. 발동 판단 (먼저 스스로에게 3가지를 묻는다)

launch film 워크플로를 시작하기 전에 묻는다.

1. **이 영상이 브랜드 서사를 짊어지나?**(thesis / slogan reveal / 업그레이드의 의례감이 있는가) — 그렇다 → director's notes 절차로 간다
2. **관객이 멈춰서 볼까?**(스크린샷을 찍고, X 포스터를 만들고, 표지를 만들고, 느리게 review할 가능성) — 그렇다 → 모든 프레임이 볼 만해야 한다
3. **고객/사용자가 「XXX처럼 해주세요」라는 참조를 갖고 있나?**(Apple / Anthropic / Nike / Penguin / 특정 감독) — 그렇다 → 시각적 맥락을 반드시 명확히 해야 한다

하나라도 「그렇다」면 절차로 간다. 셋 다 「아니다」면 건너뛰고 [animations.md](animations.md)의 표준 절차를 쓴다.

> 🔴 **선행 게이트(이 절차보다 먼저)**: launch film도 SKILL.md의 삼방향 하드 게이트를 먼저 통과해야 한다 — 방향마다 「방향 보드」 한 장(hero 키프레임의 실제 정지 이미지 + 색판 + 기질 문장 + 참조)을 만들고, 사용자가 방향을 정한 다음에야 만 자 분량 director's notes를 그 방향을 중심으로 펼친다. 「Apple 급」 같은 스타일 단어를 지정했다고 면제되지 않는다(2026-07-18 HuaStudio 실증).

---

## 3. Director's Notes의 5대 부분 구조

만 자(중문 10000-12000자 / 같은 분량의 영문) director's notes에는 이 5대 부분이 반드시 들어간다. **어느 부분이 빠져도 불완전이고 품질이 영향을 받는다.**

### Part I · Director's Statement (창작론, 약 1500-2000자)

5가지 질문에 답한다.

1. **이 영상은 무엇이 아닌가?**(명확한 배제 — 예: 「이건 기능 소개 영상이 아니다」「demo가 아니다」)
2. **핵심 thesis 한 줄** — 관객이 다 보고 나서 문장 하나만 기억한다면 그건 어느 문장인가?
3. **누구의 맥락과 대화하는가?** — 시각 참조 5-8개를 나열하고(감독 / 디자이너 / 브랜드 / 사진가 / 작품명 + 연도), 각 참조에서 무엇을 배웠는지 밝힌다
4. **관객 세 유형 + 각 유형에 대한 약속**: 주 수용자 / 부 수용자 / 외부 수용자, 각각에 한 단락씩
5. **리듬 철학** — 느린 박자 / 가속 / 정점 / 완만한 수습의 곡선 설명 + emotional climax가 몇 초에 오는지(**반드시 마지막 초일 필요는 없다**)

마지막에 anti-slop checklist를 한 단락 붙인다: **이 영상이 하지 않는 일**(구체적으로 나열, 모호하게 쓰지 말 것).

### Part II · Visual System (시각 시스템 전체 스펙트럼, 약 1500-2500자)

엔지니어링된 시각 spec이다. 완성되면 어느 실행자가 받아도 일관된 시각을 만들 수 있다.

반드시 포함할 하위 절:

- **완전한 색판**: 최소 8-10색, 색마다 HEX + 기능 정의 + 화면 점유 비율 상한
- **글꼴 시스템**: 최소 6개 자크기 층위, 층위마다 글꼴명 + weight + size + letter-spacing + 용도
- **그리드 시스템**: 캔버스 크기 + 외부 여백 + column grid + baseline grid + 핵심 안전영역 + 황금분할 앵커
- **애니메이션 시스템**: easing 라이브러리(4개 이내) + duration 사전 + stagger 법칙 + scene 전환 규칙
- **Chrome 요소**: 영상 전체를 관통하는 작은 디테일(counter / chip / ticker / watermark / texture), 각각 위치 + 등장·퇴장 타이밍 포함
- **오디오 시스템**: BGM 30초 흐름 곡선(레이어별) + SFX 사전(10개 이상 cue, 타임코드 + 음량 + 주파수대 분리 포함)
- **반 AI slop checklist**: per-shot 자기점검표(10-15항목)

철칙: **모든 시각 판단은 Visual System에서 도출한다. shot list에서 새 값을 즉석으로 발명하지 말 것.**

### Part III · Story Arc (스토리 아크, 약 500-800자)

3막 구조 + 감정 곡선:

- **Act I · SETUP**(0 → 전체 길이의 1/5, 예: 30초 영상이면 0-6s): 관객이 진입하고 문제가 제시된다
- **Act II · ESCALATION**(중간 2/3): 답이 펼쳐지고 주제가 깔린다
- **Act III · PAYOFF**(마지막 1/4): 승화, slogan reveal, 브랜드 인장

ASCII 감정 곡선 그림 + emotional climax 시점 표시를 포함한다.

**핵심 판단**: climax가 반드시 끝에 오는 건 아니다. 30초 영상의 climax는 보통 22-25s다(29s가 아니다) — 마지막 몇 초는 resolution / decay이고 peak가 아니다. 이 규칙을 위반하면 작품은 반드시 「용두사미」가 된다.

### Part IV · Shot-by-Shot Storyboard (콘티 스크립트, 약 5000-7000자 · 분량의 60%)

컷마다 11개 필드가 들어간다(하나도 빠질 수 없다).

```
SHOT NN · NAME
[TIMECODE]    시작·종료 시간 + 길이
[FUNCTION]    이 컷이 스토리 아크에서 갖는 기능(한 문장)
[VISUAL]      화면 구도 + 요소 위치 + 운동 방향
[CAMERA]      샷 사이즈(원경/전경/중경/근경/클로즈업, zoom 단계에 대응) + 카메라 동작 + 동기 한 문장. 「정지」도 왜 정지인지 쓴다. push-in은 반드시 구체적 앵커를 쓴다(어휘와 예산은 camera-language.md, 샷 사이즈 체계는 storyboard-basics.md §3 참조)
[TYPE]        조판 spec(글꼴 / 자크기 / 자간 / 행간 / 색 / 정렬)
[ANIM]        요소별 in/out 타이밍 + easing + duration + stagger + delay
[AUDIO]       music beat + SFX cue(컷마다 대응하는 BGM 리듬 + SFX 시간표 필수)
[CHROME]      네 모서리 요소 상태(어떤 chrome이 남아 있고 / 어떤 게 fade in/out하고 / 어떤 게 pulse하는지)
[ANTI-SLOP]   이 컷이 통과한 자기점검 항목 + 어떤 120% 디테일 서명이 있는지
[WHY]         앞 컷을 이어받는 논리 + 다음 컷으로 밀어주는 고리
```

**필드마다 평균 30-80자 → 컷마다 400-700자 → 12-15컷 → 5000-7000자.**

실전 경험: storyboard를 다 쓴 뒤 **직접 한 번 읽는다** — 어느 컷 하나를 지워도 영상 전체가 성립하는가? 지울 수 있다면 그 컷은 잉여이니 지운다.

### Part V · Production Manifest (제작 목록, 약 800-1200자)

엔지니어링 납품 목록:

- 글꼴 로드 URL(preconnect 포함)
- CSS 변수(그대로 붙여넣을 수 있게)
- BGM 출처 선정 기준 + Suno/Udio prompt 키워드 + 대체 라이브러리
- SFX 사전(타임코드 순으로 cue마다 파일 경로 + 음량)
- **키프레임 검증 계획**: pause-and-check 키프레임 12-15장의 타임코드, 프레임마다 검증 항목 나열(fonts / positions / chrome state)
- 녹화 파라미터(fps / codec / bitrate / preset)
- ffmpeg 오디오 믹스 명령(audio stream 검증 포함)
- 납품물 목록(mp4 / mp4-60fps / gif / poster.png / silent.mp4 / shot-list.csv)
- 전 구간 시간 추정(시간 단위 정밀도)

---

## 4. director's notes를 쓸 때의 5가지 조언

**4.1 PM의 말투가 아니라 감독의 말투로 쓴다**

❌「This shot displays the product features.」
✅「This is the hero shot — if the audience pauses anywhere, I want it to be here.」

감독 노트는 실행자가 읽는 것이지만 미래의 자신도 읽는다. 1인칭 + judgment 표현이 description 표현보다 판단의 실마리를 더 많이 남긴다.

**4.2 구체적 작품을 인용한다(연도 포함). 유파 이름만 대지 않는다**

❌「Apple-inspired」
✅「Apple 'Designed by Apple in California' (2013, dir. Mark Romanek) — 배운 것은 느린 박자 + 세리프 + 큰 흰 바닥」

구체적 작품을 인용하는 이점: (a) 누구나 검색해서 대조할 수 있다 (b) 무엇을 배웠는지 구체적 기법으로 스스로 명확히 하게 된다 (c) 「영감이 모호한」 상태를 막는다.

**4.3 모든 판단을 first principle까지 trace한다**

영상 전체에 first principle 한 문장이 있다(예: "Markdown is the new typewriter."). 구체적 판단 하나하나 — 배색 / 글꼴 / 리듬 / chrome — 가 그 문장까지 trace돼야 한다.

trace되지 않는 판단은 장식이니 지운다.

**4.4 do-this를 쓰는 것보다 anti-slop을 쓰는 것이 더 중요하다**

「이 영상이 하지 않는 일」 목록(자주색 그라디언트 / 이모지 / Lorem ipsum / Inter display / SVG로 그린 인물 / 라운드 카드 + 왼쪽 border accent)이 「이 영상이 하는 일」 목록보다 품질을 더 잘 지킨다.

긍정 판단은 무한히 많지만 부정 checklist는 유한하다 — 그리고 부정 checklist는 한 번 위반하면 곧 slop이다.

**4.5 다 쓰고 바로 구현하지 말 것 — 30분 지난 뒤 다시 읽는다**

쓰는 동안 뇌는 「생산 모드」라서 inconsistency가 보이지 않는다. 30분 지나 자기가 쓴 storyboard를 읽으면 이런 게 보인다.

- 어떤 두 컷의 기능이 중복된다(하나 삭제)
- 어떤 컷의 서사 도약이 너무 크다(전환 추가)
- emotional climax 위치가 틀렸다(이동)
- chrome 요소와 shot 수가 맞지 않는다(다시 정렬)

이 30분이 후반의 2시간 재작업을 아껴 준다.

---

## 5. Director's Notes → HTML 구현 절차

director's notes를 다 쓴 뒤의 HTML 구현 단계:

1. **starter components를 재사용한다**(`assets/animations.jsx`의 Stage/Sprite/Easing/interpolate) — 다시 발명하지 않는다
2. **CSS 변수는 Visual System Part II에서 그대로 붙여넣는다** — HTML에서 색을 즉석으로 고치지 않는다
3. **Sprite start/end 타임라인을 Part IV 타임코드와 대조한다** — 임의로 컷을 추가하지 않는다
4. **chrome 요소는 독립 컴포넌트로 뽑는다**(ChromeA/B/C/D). useTime()으로 상태 전환을 구동한다
5. **destination cards 내용은 반드시 실제로 읽을 수 있어야 한다**(fake bar lines가 아니다) — v5 프로젝트에서 가장 반복적으로 언급된 120% 디테일 서명이다
6. **한 컷을 다 쓰면 바로 키프레임을 캡처해 검증한다**(`?t=NN` URL 파라미터 + Playwright). 영상을 다 만든 뒤 한꺼번에 검증하지 말 것

---

## 6. 키프레임 검증 절차

URL 파라미터 구현(Stage 컴포넌트에 반드시 넣는다):

```js
const urlMatch = window.location.search.match(/[?&]t=([\d.]+)/);
const frozenTime = urlMatch ? parseFloat(urlMatch[1]) : null;
const [time, setTime] = useState(frozenTime != null ? frozenTime : 0);
const [playing, setPlaying] = useState(frozenTime == null);
```

→ 이렇게 하면 `file:///path/animation.html?t=14.5`가 14.5초에서 바로 freeze된다.

일괄 스크린샷:

```bash
for t in 0.5 2.5 4.9 7.0 10.5 13.5 16.5 19.0 21.5 23.4 25.5 28.0 29.9; do
  npx -y playwright screenshot \
    "file://$PWD/animation.html?t=$t" \
    "keyframes/t-$t.png" \
    --viewport-size=1920,1136 \
    --wait-for-timeout=2500
done
```

스크린샷마다 반드시 검증한다:
- [ ] 요소가 1920×1080 canvas를 넘치지 않는다
- [ ] 자간, 행간이 visually correct하다(끼거나 흩어지지 않는다)
- [ ] 핵심 typography 디테일(마침표 색 / em-dash / italic / small caps)이 식별된다
- [ ] chrome 요소 위치 + 상태가 정확하다
- [ ] 반 AI slop checklist를 통과한다
- [ ] 「pause했을 때 볼 만한」 120% 디테일이 존재한다

---

## 7. 다중 시점 병렬 전략 (advanced)

복잡한 프로젝트(launch film의 방향이 정해지지 않았거나, 여러 미학적 차이를 보고 싶거나, 고객이 스타일을 결정하지 못한 경우)에서는 **여러 subagent를 띄워 서로 다른 감독 시점의 버전을 병렬로 만들 수 있다.**

실전 구성(2026-05-11 Design-md-html 프로젝트, 6개 버전 병렬):

```
v5  · 기준선(Anthropic / Penguin Classics 출판사 품위)
v5a · Wes Anderson(대칭 + 레트로 + 챕터 카드)
v5b · Saul Bass(종이 오리기 + 60s 큰 글자 + 기하 절단)
v5c · 왕가위(중문 세리프 + 슬로모션 + 노스탤지어)
v5d · Massimo Vignelli(모더니즘 grid + 빨강·검정)
v5e · 하라 켄야 Kenya Hara(극단적 미니멀 일본풍 + 여백)
v5f · 쿠사마 야요이 Yayoi Kusama(물방울 + 반복 + 단일 강색)
```

subagent마다 독립된 brief를 받는다.
- 프로젝트 배경(모두 같은 문서)
- 필독 참고(방법론 템플릿으로서 동일한 v5-director-notes.md)
- **지정된 아티스트 DNA**(색판 / 글꼴 / 시각 언어 / 리듬 / 시그니처 요소 / 반 slop 강화판, 항목마다 30-50자)
- 통일된 작업 목록(director-notes.md + animation.html + keyframes/ + README.md)
- 통일된 제약(30s / 1920×1080 / file:// / Google Fonts)

병렬로 띄워 백그라운드로 돌리면 약 30-60분에 완결된 6세트가 나온다.

완료 후 검토·비교:
1. 버전별 핵심 미학 판단 표
2. 키프레임 나란히 비교(버전마다 같은 시점의 한 프레임)
3. 투표: 어느 것이 사용자의 실제 요구에 가장 잘 맞는가

**핵심**: subagent끼리 서로 참고하게 하지 말 것 — 반드시 독립적으로 산출해야 한다. 아니면 「평균값」에 부딪힌다. subagent 지시문에 「v5의 미학을 반복하지 말 것」을 명시한다.

---

## 8. 발동되는 전형적 장면들

| 사용자 장면 | 발동 여부 | 비고 |
|---------|---------|------|
| 「SaaS 업그레이드 홍보 영상 만들어줘」 | ✅ 발동 | 기본으로 전체 절차 |
| 「Apple 급 / 슈퍼볼 급 완성도의 영상」 | ✅ 발동 + 승격 | 다중 시점 병렬을 강력 권장 |
| 「30초 브랜드 launch film」 | ✅ 발동 | |
| 「이 프로젝트는 1만 자 스크립트를 쓰고 애니메이션을 만들자」 | ✅ 발동 | 사용자가 명시했다 |
| 「간단한 motion graphic, logo만 한 번 돌려줘」 | ❌ 미발동 | animations.md 표준 절차 |
| 「onboarding 애니메이션 demo 하나」 | ❌ 미발동 | animations.md |
| 「내레이션 들어간 튜토리얼 영상」 | ❌ 미발동 | voiceover-pipeline.md로 간다 |
| 「hero animation 하나」 | ⚠️ 복잡도에 따라 | 고규격 hero면 발동. 일반 hero는 hero-animation-case-study.md |

---

## 9. 참고 샘플

완결된 director's notes 참고 샘플(self-contained, 이 skill 안에 있다):

`assets/director-notes-samples/launch-film-30s-sample.md`(약 78KB · 11500자 · 13컷 · 5대 부분 완비)

원래 프로젝트 위치(대응 구현 HTML + 키프레임 포함):

- v5-director-notes.md(director's notes, 저자 로컬. 저장소에 함께 배포되지 않음)
- v5-six-forms.html(HTML 구현, 저자 로컬. 저장소에 함께 배포되지 않음)
- v5-keyframes/(키프레임 검증 스크린샷, 저자 로컬. 저장소에 함께 배포되지 않음)

새 프로젝트를 시작할 때는 **이 샘플을 먼저 Read하기를** 강력히 권한다. 작업량과 디테일 밀도를 이해한 뒤에 전체 절차를 밟을지 결정한다.

---

## 10. 안티패턴 (이렇게 하지 말 것)

❌ **1000자짜리 축약판 director's notes를 쓰고 바로 착수**
→ 축약판은 반드시 Visual System의 하위 항목 하나를 빠뜨리고, 결국 HTML 구현 중에 계속 되돌아가 spec을 보완하게 된다. 할 거면 만 자급으로, 아낄 거면 아예 건너뛴다.

❌ **storyboard를 5-8컷만 쓴다**
→ 30초 영상은 최소 12-15컷이다(컷마다 2-3초). 컷이 적다 = 리듬이 등속이다 = climax가 없다.

❌ **director's notes만 쓰고 납품, 구현은 안 한다**
→ 문서는 납품물이 아니고 애니메이션이 납품물이다. 문서 + 애니메이션을 함께 납품하고, 문서는 「설계 근거」 부록으로 붙인다.

❌ **다중 시점 병렬에서 subagent에게 다른 버전을 보여준다**
→ subagent는 반드시 독립적이어야 한다. 아니면 수렴한다. 비교는 검토 단계에서만 한다.

❌ **키프레임 검증을 건너뛰고 곧바로 MP4 녹화**
→ 반드시 재작업한다. 키프레임 검증은 가장 값싼 quality gate다.

❌ **애니메이션 디테일 판단을 「녹화할 때 생각하자」로 미룬다**
→ 녹화 단계는 기계적 실행이고 창작 판단을 하는 자리가 아니다. 모든 판단은 director's notes에서 못 박아 둔다.

---

*최종 수정: 2026-05-11*
*실제 사례: Design-md-html v2.0 launch film(v5-director-notes.md)*
