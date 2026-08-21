---
name: whiteboard-video
description: SRT 자막에서 화이트보드 필기 영상을 만든다. 자막을 화면에 띄우는 게 아니라 장면 경계·요소 순서·타이밍을 정하는 입력으로 쓴다. 선노출 방지 마스크, grid·skeleton 두 필기 경로, ink→color 단계, 음성·BGM·자막 합성까지. 트리거 - 화이트보드 영상, 손글씨 애니메이션, SRT로 영상, 자막 기반 영상, whiteboard animation, 강의 영상 자동화. design-studio의 선택형 플러그인이며 프로젝트 매니페스트(P0 기반 구조)를 전제로 한다.
---

# whiteboard-video

화이트보드 영상은 "설명하는 사람이 옆에서 그려주는" 매체다. 그래서 다른 영상과 다른 제약이 두 개 있다.

1. **말이 화면을 결정한다.** 장면이 바뀌는 자리는 시간이 아니라 문장이 끝나는 자리다.
2. **아직 말하지 않은 것은 보이면 안 된다.** 뒤에 나올 요소가 미리 드러나면 설명의 순서가 무너진다.

이 스킬은 그 두 가지를 기계가 지키게 만든다.

## 이 스킬을 쓰지 않는 경우

- 화이트보드가 아닌 일반 모션 그래픽 → `references/animation-best-practices.md`, `references/gsap-recipes.md`
- 자막이 없는 짧은 영상 → 기본 영상 IR을 직접 쓰는 편이 빠르다
- 손으로 한 컷씩 연출하는 브랜드 필름 → `references/launch-film-director-notes.md`

이 스킬은 **선택형 플러그인**이다. 기본 영상 엔진에 섞이지 않고 영상 IR의
`layers[].render.plugin === "whiteboard"` 한 지점으로만 붙는다. 매니페스트·승인 게이트·검수·캐시·시크 렌더는 P0 기반 구조를 그대로 쓴다.

## 전제

프로젝트 매니페스트가 있어야 한다. 없으면 먼저 만든다.

```bash
node scripts/design/cli.mjs init --name "강의 3화" --deliverables video
```

자세히는 `docs/DESIGN_CLI_KO.md`.

## 흐름

```bash
design whiteboard plan narration.srt --hand hand --target 28
design whiteboard annotate                 # 브라우저 편집기 생성
design whiteboard annotate --apply board-annotation.json
design whiteboard preview                  # 매니페스트를 건드리지 않고 확인
design whiteboard verify                   # 선노출·자막·오디오 검증
design whiteboard render                   # 승인 게이트 통과 후 확정
design export --format mp4                 # 무음 MP4
bash out/board/mix.sh                       # 음성·BGM·자막 합성
```

### 1. plan — 자막이 장면을 정한다

시간만 보고 자르면 문장 한가운데서 장면이 바뀐다. 그래서 두 단계로 판단한다.

- **1차(시간)**: 누적 길이가 `--min`을 넘으면 `--max`까지가 경계 후보 구간
- **2차(의미)**: 후보 중 점수가 가장 높은 자리
  - 문장이 끝난 직후 (+50) — 가장 강한 신호
  - 다음 자막이 전환어로 시작 (+35) — "하지만", "먼저", "However"
  - 자막 사이 공백이 큼 (최대 +20) — 말하는 사람이 숨 쉬는 자리
  - 목표 길이에 가까움 (최대 +25)

한국어·영어·중국어·일본어의 종결 어미와 전환어를 각각 안다. UTF-8/UTF-16 BOM, CRLF, 마침표 타임코드, 인덱스 누락을 모두 받는다.

계획은 **초안**이다. 요소 배치·순서·타이밍은 결정론적으로 계산되고, 다음 단계에서 고친다. 빈 화면에서 시작하는 것보다 고치는 편이 늘 빠르다.

### 2. annotate — 고치는 자리

브라우저 편집기에서 영역을 끌어 옮기고, `↑` `↓`로 순서를 바꾸고, 시각·자막·필기 모드를 고친다. **보호 영역은 순서에서 자동으로 계산된다** — 사람이 손으로 관리할 정보가 아니다. 빗금으로 표시된다.

편집 결과는 JSON으로 내려받아 `--apply`로 반영한다. 반영 전에 스키마·선노출 검사를 다시 통과해야 하고, **통과하지 못하면 원본 IR을 건드리지 않는다.**

### 3. 두 가지 필기 경로

| 모드 | 방식 | 언제 |
|---|---|---|
| `skeleton` | SVG 경로를 따라 선이 자라난다 (`stroke-dashoffset`) | 선화·도형·손글씨 텍스트. 선에 밀착한다 |
| `grid` | 영역을 한 방향으로 쓸어내며 드러낸다 | 래스터 이미지·복잡한 그림. 어떤 내용에도 안정적 |

프로젝트 설정 한 줄(`--mode` 또는 편집기의 드롭다운)로 바꾼다. 한 영상 안에서 섞으면 `verify`가 경고한다.

### 4. ink → color

선을 먼저 다 긋고 색을 나중에 채운다. 실제 화이트보드 제작의 시각 리듬이다.

```json
"phases": [
  { "id": "ink",   "kind": "ink",   "startMs": 0,    "durationMs": 3400 },
  { "id": "color", "kind": "color", "startMs": 3600, "durationMs": 1800 }
]
```

경로마다 `"phase": "color"`와 `"fill"`을 주면 그 단계에서 채워진다. 색 채우기 중에는 손이 기본적으로 숨는다(`hideDuringColor`).

### 5. 선노출 방지

핵심 장치다. 각 요소는 "칠해도 되는 범위"를 갖는다.

```text
허용 영역 = (자기 영역 + 붓 여유) − 보호 영역들 − 캔버스 밖
```

SVG `clipPath`의 짝수-홀수 규칙으로 "바깥 사각형 + 구멍들"을 만든다. 구현은
`scripts/design/lib/reveal-mask.mjs`에 있고 **화이트보드에 종속되지 않는다** — 리빌 트랜지션, 커서 이동, 마스크 스윕에도 그대로 쓴다.

`verify`가 겹치는데 보호 선언이 없는 요소를 종료 코드 4로 막는다. 그리고 골든 프레임 테스트가 **픽셀로** 확인한다 — 등장 전 요소의 자리가 정말 종이색인지.

### 6. 테마 토큰

종이색·선색·강조색·선 굵기·필기 속도·손 이미지가 전부 토큰이다. 아무것도 지정하지 않으면 **브랜드 토큰을 그대로 상속한다.** 미색 종이를 강요하지 않는다.

```bash
design whiteboard plan n.srt --paper "#f7f3ea" --ink "#241f1a" --accent "#b4451f" --strokeWidth 6
```

손 이미지도 자산으로 등록해 교체한다. 펜촉 위치는 `hand.anchor`(폭 기준 비율)로 맞춘다 — 어떤 비율의 이미지를 넣어도 촉이 선 끝에 온다.

```json
"hand": { "assetId": "hand", "width": 160, "anchor": { "x": 0.07, "y": 0.06 } }
```

> 원본 저장소가 포함한 손 사진은 파일 단위 재배포 조건이 정리되어 있지 않다. 예제는 직접 그린 SVG를 쓰고 `assets[].provenance`에 그 사실을 남긴다.

### 7. 소리와 자막

무음으로 끝내지 않는다. 두 벌을 낸다.

- `board-silent.mp4` — 무음 작업본. 편집·검수·골든 프레임 비교용
- `board.mp4` — 음성 + BGM(자동 더킹) + 자막 트랙, `loudnorm`으로 라우드니스 정규화

BGM은 `sidechaincompress`로 보이스오버 구간에서 자동으로 낮아진다. 자막은 기본이 소프트 서브이고, `captions.burnIn: true`면 화면에 태운다.

`render`는 ffmpeg를 직접 실행하지 않고 `out/<id>/mix.sh`와 `mix-plan.json`을 남긴다. 무엇이 실행될지 먼저 보이는 편이 안전하다.

## 재현성 계약

생성 HTML은 두 가지를 노출한다.

```js
await window.READY;                 // 글꼴·이미지 로드 + 타임라인 워밍업 완료
window.seek(12.5);                  // 시간만 넣으면 화면 상태가 결정된다
```

`READY`를 기다리지 않고 캡처하면 첫 등장 요소의 래스터화 비용 때문에 그 프레임만 다르게 나온다. 프레임 단위 렌더러는 반드시 기다린다.

```js
await page.waitForFunction(() => document.body.dataset.ready === '1');
```

## 검사 항목

`design whiteboard verify`:

| 검사 | 막는 것 |
|---|---|
| 스키마 | 영상 IR + `whiteboard-scene.schema.json` 위반 |
| 선노출 | 겹치는데 보호 영역으로 선언되지 않은 요소 |
| 자막 연결 | 대응 자막이 없는 장면 |
| 모드 일관성 | 한 영상에 skeleton과 grid가 섞임 |
| 오디오 | 음성·BGM·자막 파일 누락 |

`node tests/golden.mjs`: 첫 프레임 · 획 진행 · 겹침 구간 · 색 채우기 · 쓸어내기 · 마지막 프레임의 재현성과 선노출을 픽셀로 확인한다.

## 파일

```text
schemas/whiteboard-scene.schema.json     주석 스펙
scripts/design/lib/srt.mjs               SRT 파서 · 언어 감지 · 문장 경계
scripts/design/lib/reveal-mask.mjs       선노출 방지 (범용)
scripts/design/lib/whiteboard/plan.mjs   장면 계획 · 배치 · 보호 영역 도출
scripts/design/lib/whiteboard/annotate.mjs 브라우저 편집기
scripts/design/lib/whiteboard/audio.mjs  믹싱 계획
scripts/design/lib/whiteboard/cli.mjs    5개 하위 명령
scripts/design/lib/render/whiteboard.mjs SVG 렌더 + seek 런타임
examples/whiteboard-intro/               SRT 한 파일 → 4장면 영상
tests/fixtures/whiteboard/               회귀 픽스처 + 골든 해시
```

## 원본과 무엇이 다른가

이 스킬은 [srt-whiteboard-animation](https://github.com/geeklee/srt-whiteboard-animation)(MIT)의 구조를 참고했지만 코드를 옮겨오지 않았다. 로드맵 4.11절의 판단대로 **선택적 재구현**이다.

| 항목 | 원본 | 여기 |
|---|---|---|
| 장면 분할 | 목표·최소·최대 시간 | 시간으로 후보를 좁히고 문장 경계·전환어로 자리 선택 |
| 렌더 | Python 프레임 직접 그리기 | SVG + `seek(t)` — 기존 시크 렌더·골든 테스트·캐시 재사용 |
| 주석 편집 | File System Access API로 원본 덮어쓰기 | JSON 내려받기 → 검사 통과 후 `--apply` |
| 스타일 | 중국어·미색 종이 고정 | 전부 테마 토큰, 기본은 브랜드 토큰 상속 |
| 소리 | 무음 출력 | 음성·BGM 더킹·자막 합성 + 무음 작업본 |
| 손 이미지 | 동봉, 출처 미정리 | 자산으로 등록·교체 가능, `provenance`에 출처 기록 |
| 검증 | 없음 | 스키마 · 선노출 픽셀 검사 · 골든 프레임 · CI |
