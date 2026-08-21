# Design CLI · 프로젝트 매니페스트 가이드

> 로드맵 7장 「1차 고도화 제안」의 P0 기반 구조 구현. 대상 문서: [`BENCHMARK_AND_ENHANCEMENT_ROADMAP_KO.md`](./BENCHMARK_AND_ENHANCEMENT_ROADMAP_KO.md)

## 무엇이 달라지나

전까지 Design Studio는 뛰어난 제작 지침과 실행 스크립트의 모음이었다. 결과물은 좋지만 **작업 상태가 어디에도 남지 않았다.** 대화를 닫으면 어떤 방향으로 합의했는지, 그 숫자를 어디서 가져왔는지, 어떤 자산이 공식인지 사라졌다.

`design-project.json`은 그 상태를 파일로 만든다. 브랜드 토큰, 자산 출처, 레퍼런스 잠금, 승인 기록, 산출물 목록, 검수 결과가 한 파일에 모인다. 산출물별 고유 구조는 IR(`ir/*.json`)로 분리한다.

```text
design-project.json          공통 — 브랜드 토큰 · 자산 출처 · 승인 · 검수 상태
├─ ir/site.json              HTML IR — 페이지 · 섹션 · 블록
├─ ir/deck.json              덱 IR — 슬라이드 · 레이아웃 · 발표자 노트
└─ ir/teaser.json            영상 IR — 장면 · 레이어 · 타임라인 · 오디오
```

## 설치 없이 시작

핵심 명령은 **외부 npm 패키지 없이** Node만으로 돈다. 무거운 포맷(pptx/pdf/mp4)만 기존 `scripts/`에 위임한다.

```bash
node scripts/design/cli.mjs help

# 편하게 쓰려면
alias design='node /path/to/design-studio/scripts/design/cli.mjs'
```

## 기본 흐름

```bash
design init --name "제품 소개" --deliverables deck,video   # 매니페스트 생성
design plan                                                # IR 골격 생성
# ── 여기서 세 방향 초안을 만들어 사용자에게 보여준다 ──
design approve direction --evidence a.html,b.html,c.html --note "사용자: B안으로"
design build                                               # 자산 해시 · IR 검증 · 캐시 갱신
design approve outline --note "구성 확정"
design render                                              # IR → HTML
design check --strict                                      # 품질 게이트
design approve draft --note "시안 확인"
design export --format pptx                                # HTML → PPTX
```

작업을 중단했다가 돌아왔다면:

```bash
design resume     # 승인 상태 · 산출물 · 캐시 · 검수 결과 · 다음에 할 일
```

## 승인 게이트

명령이 게이트를 넘지 못하면 **시작하지 않는다.** 렌더 비용이 큰 작업이 합의 없이 굴러가는 것을 막는 장치다.

| 게이트 | 뜻 | 요구하는 명령 |
|---|---|---|
| `facts` | 제품·버전·규격 단언을 검색으로 확인 (핵심 원칙 #0) | — |
| `assets` | 브랜드 자산의 출처·라이선스 확인 | — |
| `direction` | **삼방향 하드 게이트** — 실제 초안 3개를 보여주고 사용자가 선택 | `build` |
| `outline` | 슬라이드·장면·섹션 구성 확인 | `render` |
| `draft` | 시안 확인 | `export` |
| `final` | 배포 전 최종 확인 | — |

`direction` 승인은 증거 3개를 요구한다. 사용자가 명시적으로 건너뛰기를 요청했다면 `--waive`를 쓰되 **사용자 원문을 `--note`로 남겨야 한다.** 사유 없는 면제는 거부된다.

```bash
design approve direction --evidence dir-a.html,dir-b.html,dir-c.html --note "사용자: B가 좋네요"
design approve assets --waive --note "사용자: 로고 없이 타이포만으로 갑시다"
```

## 품질 게이트 (`design check`)

브라우저 없이 IR과 파일만 보고 판단한다. 결과는 `qa.json`(기계용)과 `qa-report.html`(사람용)로 남는다.

| 그룹 | 잡는 것 |
|---|---|
| 구조 | 매니페스트·IR 스키마 위반, 산출물 id 중복, 없는 `assetId`·`sourceId` 참조 |
| 출처 | 자산 파일·해시 불일치, `origin: unknown`, 라이선스 공란, 레퍼런스 미잠금, 삼방향 증거 부족, **수치에 출처가 연결되지 않음**, 인용문과 원문 불일치 |
| 디자인 | 색상 대비(WCAG AA), 폰트 폴백 누락, 본문 최소 크기, 텍스트 넘침, 요소 겹침, 캔버스·안전영역 이탈, 이미지 alt 누락 |
| 조판 | 폴백 사슬 순서·CJK 누락, 남용 글꼴, 음계 단수·비율, 싣지 않은 굵기, 행장·행간·자간, 발표 제목 크기, 곧은 따옴표 |
| 접근성 | 선언 언어와 실제 글자 불일치, 대체 텍스트 품질, 제목 층위, 읽는 순서, 자막 유무·속도, 움직임 강도 |
| 미디어 | 장면 공백·겹침, 장면 길이, 레이어 타이밍, 보호 영역, BGM/보이스오버 균형, 오디오·자막 파일 누락, 산출물 파일 유실, **PPTX zip 구조** |
| 보안 | 매니페스트·IR·산출물 안의 API 키·개인 키, `.env` 자산 등록, 개인 절대 경로, 내부 주소 |

```bash
design check                          # 오류가 있으면 종료 코드 4
design check --strict                 # 경고도 실패로 처리
design check --only typography,a11y   # 일부만
```

그룹 id는 `structure` · `provenance` · `design` · `typography` · `a11y` · `media` · `security`.

### 왜 이 검사들인가

로드맵이 지목한 두 가지 구멍을 메운다. `slides_maker`의 출처 추적은 여기서 `source.unlinked`가 됐다 — 본문에 퍼센트·배수·통화·4자리 수가 있는데 `claims[]`가 비어 있으면 경고한다. `Refero`의 레퍼런스 잠금은 `style.candidates`가 됐다 — 방향이 승인됐는데 초안 3개의 기록이 없으면 오류다.

조판·접근성·보안 세 그룹은 판정 기준을 스스로 정하지 않는다. 조판은 `references/typography.md`, 크기 규범은 `references/content-guidelines.md`가 정한 것만 검사하고 판정문에 몇 장 몇 절인지 함께 적는다. 검사기가 자기 미감을 주장하기 시작하면 아무도 보고서를 읽지 않는다. 항목별 근거와 검사하지 않기로 한 것들은 [`QUALITY_GATES_KO.md`](./QUALITY_GATES_KO.md).

## 종료 코드

| 코드 | 뜻 |
|---:|---|
| 0 | 성공 |
| 1 | 사용법 오류 |
| 2 | 스키마 위반 |
| 3 | 승인 게이트 미통과 |
| 4 | 검수 실패 |
| 5 | 의존성 없음 (pptx/pdf/mp4 내보내기) |
| 6 | 대상 없음 |

CI와 훅은 이 코드만 보면 된다. **검수에 실패한 명령이 0으로 끝나는 경로는 없다.**

## 렌더 캐시

`design render`는 입력 해시(에셋·IR·레퍼런스 파일)와 산출물 해시를 비교해 변하지 않은 산출물을 건너뛴다. 강제로 다시 만들려면 `--force`.

```bash
design render                 # 변경된 것만
design render --artifact deck # 특정 산출물만
design render --force         # 전부 다시
```

## HTML이 중간 산출물인 이유

`design render`는 IR을 단일 파일 HTML로 만든다. PPTX는 그 HTML을 `html2pptx`로, PDF·PNG는 Playwright로, MP4는 `render-video-seek.js`로 넘긴다. **렌더러가 결정론적이면 아래 모든 포맷이 결정론적이 된다.** 회귀 테스트가 같은 IR에서 두 번 렌더해 바이트 단위로 같은지 확인한다.

영상 HTML은 `window.seek(초)` 계약을 노출한다. 시간만 넣으면 화면 상태가 결정되므로, 프레임 단위 시크 렌더링이 재현 가능하다.

## 예제

```bash
cd examples/design-studio-intro
node ../../scripts/design/cli.mjs build
node ../../scripts/design/cli.mjs check --strict
node ../../scripts/design/cli.mjs render
open out/deck/deck.html
```

하나의 매니페스트가 웹페이지·5장 덱·12초 티저를 함께 만든다. 실행하면 `out/`, `qa.json`, `qa-report.html`이 생기고 매니페스트에 해시·이력이 기록된다. 이 생성물들은 `.gitignore`에 있으니 커밋 전에 `git checkout examples/`로 매니페스트를 되돌리면 된다.

## Studio 편집기

```bash
design studio                      # out/studio.html 생성 (서버 불필요)
design studio --apply <패치.json>  # 편집 결과 반영 (검사 통과해야 반영)
```

브라우저에서 미리보기를 보며 요소를 클릭해 텍스트·크기·굵기·색·정렬·좌표를 고치고, 브랜드 토큰을 바꾸고, 슬라이드·장면 순서를 옮기고, 영상 타임라인을 스크럽한다. 자산은 파일 안에 인라인되므로 오프라인에서도 그림이 보인다.

### 편집 대상은 DOM이 아니라 IR이다

편집기가 화면의 DOM을 고치면 그 변경이 어떻게 코드로 돌아갈지가 늘 문제가 된다. 여기서는 반대로 간다 — **IR을 고치고, CLI와 똑같은 렌더 코드로 미리보기를 다시 그린다.** 그래서 미리보기와 산출물이 갈라질 수 없다. 골든 테스트가 편집기가 만든 HTML과 CLI가 쓴 HTML을 바이트 단위로 비교해 이 등식을 지킨다.

렌더 코어(`scripts/design/lib/render/core.mjs`)가 Node API를 쓰지 않는 이유가 이것이다. 파일 쓰기는 `render/html.mjs`가, 브라우저용 묶음은 `studio/bundle.mjs`가 맡는다.

### 저장은 항상 명시적이다

편집기는 파일을 직접 덮어쓰지 않는다. 「패치 내려받기」로 JSON을 받고 `--apply`가 반영한다. 반영 전에

1. 체크포인트를 자동으로 찍고
2. 매니페스트·IR 스키마를 검증하고
3. 영상이면 선노출까지 검사한 뒤

통과했을 때만 디스크에 쓴다. 하나라도 걸리면 **원본은 그대로**다. 반영된 산출물은 `stale`로 표시돼 다시 렌더해야 한다는 게 드러난다.

### 수정 요청 큐

편집기는 LLM을 직접 부르지 않는다. 오프라인 HTML이기도 하지만, 더 중요한 이유는 수정이 프로젝트 전체 맥락(브랜드·출처·승인)을 아는 쪽에서 이뤄져야 하기 때문이다. 대신 고칠 곳을 요소나 영역으로 표시하고 지시를 적어 큐에 넣는다.

```bash
design revise            # 대기 중인 요청 목록
design revise --json     # 에이전트가 읽는 형식
design revise --done <id>
```

## 체크포인트

```bash
design checkpoint create --label "방향 확정 직후"
design checkpoint list
design checkpoint diff last       # 무엇이 달라졌는지 (줄 diff 아님)
design checkpoint restore last
```

담는 것은 **상태를 결정하는 파일만** — 매니페스트와 IR이다. 산출물은 다시 만들 수 있으므로 담지 않는다. 그래서 스냅샷이 가볍고 복구가 "다시 렌더하면 된다"로 끝난다.

승인(`design approve`), studio 패치 반영, whiteboard 주석 반영 직전에 자동으로 찍힌다. **복구할 때도 복구 직전 상태를 남긴다** — 복구가 되돌릴 수 없는 새 행동이 되면 안 되기 때문이다.

`diff`는 JSON 줄 비교가 아니라 구조 비교다. 배열은 `id`로 짝을 맞추고, 순서가 바뀌면 `⇅`로 따로 표시한다(화이트보드에서 순서는 의미를 바꾼다). `updatedAt`·`history`·`qa`처럼 매번 바뀌는 항목은 무시한다.

## 스타일 고르기

```bash
design styles suggest                  # 삼방향 후보 (온도가 겹치지 않는 세 개)
design styles list --supports deck --temperature bold --minFidelity 90
design styles show <id>
design styles apply <id> --rationale "왜 이 방향인지"
```

`references/design-styles.md`의 60종을 색인한 레지스트리다. 자세히는 `docs/STYLE_REGISTRY_KO.md`.

## 에이전트·서버로 쓰기

```bash
node scripts/design/mcp.mjs --tools        # MCP 도구 12개
node scripts/design/serve.mjs --port 7801  # REST API
```

CLI·MCP·REST가 `lib/api/operations.mjs` 한 곳의 작업 정의를 공유한다. 자세히는 `docs/MCP_API_KO.md`.

## 선택형 플러그인 · whiteboard

SRT 자막에서 화이트보드 필기 영상을 만든다. 기본 영상 엔진에 섞이지 않고 영상 IR의 `layers[].render.plugin === "whiteboard"` 한 지점으로만 붙는다.

```bash
design whiteboard plan narration.srt --hand hand
design whiteboard annotate               # 브라우저 편집기
design whiteboard verify                 # 선노출·자막·오디오 검증
design whiteboard render
```

자세히는 `skills/whiteboard-video/SKILL.md`. 예제는 `examples/whiteboard-intro/`.

## 재현성 계약

생성 HTML은 두 가지를 노출한다.

```js
await window.READY;    // 글꼴·이미지 로드 + 타임라인 워밍업 완료
window.seek(12.5);     // 시간만 넣으면 화면 상태가 결정된다
```

`READY`를 기다리지 않고 캡처하면 처음 등장하는 요소의 래스터화 비용 때문에 **그 프레임만** 다르게 나온다. 골든 프레임 검사가 실제로 잡아낸 사고라 계약으로 못박았다. 프레임 단위 렌더러는 반드시 기다린다.

```js
await page.waitForFunction(() => document.body.dataset.ready === '1');
```

## 테스트

```bash
node tests/run.mjs        # 238개 · 의존성 없음
node tests/golden.mjs     # 11개 · Playwright 필요 (없으면 건너뜀)
```

`run.mjs`는 스키마 검증기, 실패 픽스처(`tests/fixtures/failing-project`)가 `MUST_CATCH`의 검사 항목을 모두 잡아내는지, 예제가 경고 0으로 통과하는지, 렌더가 재현되는지, 게이트와 종료 코드가 규약대로인지, whiteboard 계획·마스크·오디오·CLI가 규약대로인지 확인한다.

`golden.mjs`는 브라우저를 띄워 **픽셀**을 본다. 여섯 개 검사 프레임(첫·획 진행·겹침·색 채우기·쓸어내기·마지막)이 같은 시각에 같은 그림을 내는지, 등장 전 요소의 자리가 정말 비어 있는지, 그리고 **편집기 미리보기가 CLI 렌더와 바이트 단위로 같은지**. 브라우저 버전이 바뀌어 해시가 달라지면 스크린샷을 눈으로 확인한 뒤 `--update`.

새 검사를 추가하면 실패 픽스처에 그 검사를 트리거하는 사례를 넣고 `MUST_CATCH`에 등록한다. 그리고 `tests/quality.mjs`에 **잘못 잡지 않는다**는 쪽도 함께 적는다 — 놓치는 검사보다 오탐하는 검사가 훨씬 빨리 죽는다. 경고가 늘 켜져 있으면 사람은 보고서를 통째로 무시하고, 그때 진짜 오류도 같이 묻힌다.

## 다음 단계 (로드맵 6장)

1. ~~`whiteboard-video` 수직형 플러그인~~ — 완료. 매니페스트·영상 IR·에셋 출처·브라우저 편집·오디오 합성·품질 게이트가 하나의 흐름으로 이어지는지 검증하는 파일럿이었다
2. ~~Design Studio 웹 편집기~~ — 완료. `design studio`가 산출물 세 종류를 한 편집기에서 다루고, 미리보기는 CLI와 같은 렌더 코드를 쓴다
3. ~~MCP·API 계층~~ — 완료. 도구 12개 · REST · Docker → `MCP_API_KO.md`
4. ~~스타일·컴포넌트 레지스트리~~ — 완료. 60종 색인 · 삼방향 온도 강제 → `STYLE_REGISTRY_KO.md`
5. P2: 렌더 캐시 확장 · 장면 병렬 렌더링 · 팀 워크스페이스 · Figma 가져오기 · 접근성 자동화
