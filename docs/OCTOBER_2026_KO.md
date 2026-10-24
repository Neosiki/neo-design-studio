# NeoDesign Studio 2026.10.0 · 10월 고도화

이번 버전은 **실제 미디어를 샷별로 편집하고, 사람의 수정 사항을 보존하며, 프로젝트를 새 납품 폴더로 전달하는 흐름**을 보강한다. HyperFrames 기본 경로와 기존 웹·슬라이드·인포그래픽은 유지한다. OpenFilm은 선택형이며, 새 Studio·내보내기 큐·NLE writer를 중복 구현하지 않는다.

공식 조사 기준은 OpenFilm 커밋 `42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25`(확인일 2026-10-25), 해당 소스 패키지는 0.2.5다. 외부 엔진 전체의 내장·설치·렌더 실행을 보장하는 버전 표기가 아니다.

이번 검증: 회귀 315개, 실제 브라우저 8개, 스킬 형식 검사 통과. 샘플을 납품 폴더로 옮긴 뒤 샷 브라우저 검수도 통과했다. 외부 OpenFilm 렌더와 NLE 앱 가져오기는 미실행이다.

## 작업 흐름

| 항목 | 운용 |
|---|---|
| 선택형 OpenFilm | 실제 촬영·화면 녹화·이미지·소리를 타임라인에서 배치하고 수동 편집할 때 선택 |
| 작업 계획 | `film-plan.json`에 샷·자산·생성 시도·출처·검수 상태 기록. 캐릭터 기준은 필요한 작업만 선택적으로 기록 |
| 편집 보존 | locked 트랙 내용·순서, `overrides`·`size`를 수정 전 snapshot과 비교 |
| 진단 보강 | 정적 check와 샷별 sample. 기존 진단에 연결하며 별도 QA 시스템으로 늘리지 않음 |
| 프로젝트 납품 | 정적으로 참조한 로컬 파일·SHA-256·재개 안내를 새 폴더에 포장 |
| 출력 선택 | 실제 요청한 형식만 외부 OpenFilm CLI 또는 Studio에서 실행 |

## 만들고 고치기

아래는 스킬 폴더의 CLI 예시다. 초기화된 계획의 예제 값은 실제 자료와 출처로 바꾼다. 방향·사실·브랜드·개인정보·가독성에 관한 기존 규칙과 승인 기록을 유지한다.

```bash
node scripts/design/cli.mjs film init --dir ./film-project
node scripts/design/cli.mjs film check --dir ./film-project
node scripts/design/cli.mjs film sample --dir ./film-project --out ./film-review
```

`sample`은 OpenFilm `look`가 아니라 자체 Playwright 표본 검사다. 샷별 12개 시각을 두 셔플 순서에서 그려 PNG 접촉시트와 페이지 오류를 확인하며 외부 요청을 차단한다. 전체 타임라인·오디오·MP4까지 검증하지 않는다. 시각 검수 `pending`은 완료가 아니다.

사람이 편집한 파일은 바로 다시 읽고 필요한 부분만 고친다.

```bash
node scripts/design/cli.mjs film snapshot --dir ./film-project --out ./snapshot.json
# 요청받은 부분만 수정한 뒤
node scripts/design/cli.mjs film check --dir ./film-project --baseline ./snapshot.json
```

잠금·순서·override 보호 비교는 전체 백업이나 자동 복구가 아니다. 원본·기존 체크포인트·안정적인 DOM 식별자를 보존한다. `.film`·`.git`을 직접 고치지 않는다.

## 납품하고 다시 열기

```bash
node scripts/design/cli.mjs handoff check --dir ./film-project
node scripts/design/cli.mjs handoff pack --dir ./film-project --out ./delivery-new
```

`pack`은 **ZIP이 아닌 새 폴더**를 만든다. 참조 파일·SHA-256 목록·재개 안내를 모으며 `.git`·`.film`·`.design`·`.env`를 제외한다. 원본 프로젝트나 외부 OpenFilm의 project export를 대체하지 않는다.

정적 참조 추적에는 한계가 있다. 동적 경로·런타임 fetch·외부 서비스·프로젝트 밖 파일까지 모두 포장했다고 말하지 않는다. 제외·누락·외부 의존을 검토하고 수신 환경에서 다시 연다. 해시 일치는 권리·작동·비밀정보 부재의 보증이 아니다.

동명·언어별 WebVTT 파일은 미디어와 함께 포함한다. 외부 JS의 문서 상대 fetch·DOM 주소는 기준 문서를 추정하지 않고 경고한다. 필요한 파일은 `--include scenes/data.json,assets/extra.png`로 명시하고 새 납품 폴더에 다시 포장한다.

## 외부 OpenFilm의 내보내기 범위

아래는 공식 소스에서 확인한 9종이며 **NeoDesign 자체 내장 출력 목록이 아니다**. 폭넓은 출력은 외부 Studio export 서비스에서 선택한다.

| 종류 | 지원과 주요 차이 |
|---|---|
| 영상 | MP4(H.264·HEVC), WebM(VP9), MOV(ProRes·HEVC+Alpha), PNG 시퀀스 ZIP. 실제 인코더 필요 |
| GIF | 반복·무음·팔레트 변환 |
| 오디오 | WAV·M4A·MP3, mix와 voice/music/sfx/footage 네 역할별 stems. 원본 트랙별 분리는 아님 |
| 장면 이미지 | PNG·JPG, 여러 장이면 ZIP |
| 포스터 | 지정 시각의 PNG·JPG 한 장 |
| 자막 | SRT·VTT·TXT. 별도 파일과 화면에 굽기는 구분 |
| 슬라이드 | PPTX·PDF는 장면 JPEG를 페이지마다 넣은 래스터 문서. 개별 글자·도형 편집형 아님 |
| NLE | Premiere·DaVinci용 xmeml XML, Final Cut용 FCPXML, CapCut·剪映 draft. HTML·복잡한 효과는 미디어로 베이크 |
| 프로젝트 | 외부 OpenFilm의 ZIP/폴더, 선택적 history/chat/logs. NeoDesign handoff 폴더와 별개 |

투명 출력은 VP9·ProRes 4444·HEVC+Alpha·PNG이며 MP4는 지원하지 않는다. HEVC+Alpha는 macOS 인코더가 필요하다. NLE는 사용자가 요청할 때만 외부 Studio에서 선택하고 대상 앱에서 확인한다. DOM·코드·원래 자막 스타일 전체가 편집 가능한 채 옮겨지는 것은 아니다.

설치된 OpenFilm의 버전·매뉴얼·도움말을 확인한 뒤 필요한 경우에만 아래를 실행한다.

```bash
openfilm open ./film-project
# film-project 폴더에서
openfilm look
openfilm render
```

`render` 기본은 30fps MP4다. 파일을 요청받고 검수한 경우 실행하며 시작·끝·전환·한글 가독성과 소리를 확인한다. sample만 실행하고 OpenFilm 렌더 완료로 쓰지 않는다.

## 기록·호환·권리

- 기존 Stage의 `window.seek`·`READY`, HyperFrames 계약, OpenFilm `window.film.frame(t)`·`ready`를 섞지 않는다.
- 생성 시도·검수·출력의 수행 여부와 파일을 기록한다. 테스트 수·속도·성공률은 확정된 실행 기록만 발표한다.
- 실제 화면·발화·수치·부정·조건을 보존한다. 키·메일·고객 정보·알림을 확인하고 가리거나 다시 촬영한다.
- 편집·렌더와 외부 생성 비용·자료 전송은 구분한다. 비밀키를 HTML·계획·납품 폴더·로그에 넣지 않는다.
- OpenFilm MIT 저작권·허가문과 별도 상표 조건을 지킨다. 외부 영상·음악·폰트·음성의 이용 권리는 따로 기록한다.

계약·출력별 한계·고정 공식 근거는 [OpenFilm 선택형 백엔드](../references/openfilm-backend.md), 기존 경로는 [HyperFrames 백엔드](../references/hyperframes-backend.md), 공통 상태·검수는 [Design CLI](./DESIGN_CLI_KO.md)를 참조한다.
