# OpenFilm 선택형 영상 백엔드

NeoDesign Studio 2026.10.0은 **실제 미디어 타임라인, 사람의 편집 보존, 다시 열 수 있는 프로젝트 납품**에 OpenFilm을 선택적으로 활용한다. 새 애니메이션의 기본 백엔드는 계속 HyperFrames다. 별도 내보내기 큐·Studio·NLE writer를 중복 구현하거나 OpenFilm 전체 엔진을 스킬에 내장하는 변경은 아니다.

공식 조사 기준: [openfilm/openfilm](https://github.com/openfilm/openfilm), 커밋 `42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25`, 확인일 2026-10-25. 해당 소스의 패키지는 0.2.5, 프로토콜은 0.1 draft다. 현재 npm 최신 또는 설치된 버전으로 간주하지 않는다.

## 1. 경로 선택과 계약

| 요구 | 경로 |
|---|---|
| 신규 모션 그래픽, 기존 HyperFrames 작업 | HyperFrames 기본 유지 |
| 촬영·화면 녹화·이미지·소리를 샷별로 자르고 배치, Studio에서 수동 수정 | OpenFilm 선택형 경로 |
| 기존 Stage·긴 해설 영상 | 기존 파이프라인 유지. 이식은 별도 작업 |
| 클릭형 프로토타입·정적 덱·인포그래픽 | 기존 해당 산출물 경로 |

출력 유형·수정 방식·설치 상태·기존 파일을 확인하고 선택 이유를 남긴다. 사실·브랜드 자산·출처·가독성·개인정보와 기존 방향 선택 규칙은 유지한다. 이미 사용자가 승인한 방향을 다시 묻지 않는다.

| 경로 | 시간·준비 계약 |
|---|---|
| NeoDesign 기존 Stage | `window.seek(t)`와 기존 `READY` |
| HyperFrames | 프레임워크의 합성 속성·정지 타임라인·seek |
| OpenFilm | `window.film.frame(t)`와 `window.film.ready`, `film.html` 타임라인 |

필드를 더하는 것만으로 자동 호환되지 않는다. 어댑터를 구현하고 양쪽에서 검증하지 않았다면 자동 호환이라고 쓰지 않는다. OpenFilm 샷은 같은 t에서 이전 호출과 무관하게 전체 화면을 그린다.

```html
<script type="module">
window.film = {
  duration: 4,
  ready: document.fonts.load('700 64px "Noto Sans KR"'),
  frame(t) { /* 위치·색·투명도를 t에서 계산. 이전 상태에 누적하지 않음 */ }
};
</script>
```

실제 글꼴·이미지·데이터는 프로젝트에서 준비하고 사용 권리를 기록한다. 쓰는 글꼴 굵기를 각각 로드하며, 비동기 `frame`은 완료 Promise를 반환한다. 런타임 네트워크 데이터·누적 좌표·wall-clock에 화면을 맡기지 않는다. GSAP도 명시적 시작·끝 값과 seek로 구동한다.

## 2. 실제 미디어와 작업 계획

```text
film-project/
├─ film.html          트랙·클립·길이·배치
├─ film-plan.json     샷·자산·생성 시도·출처·검수 상태
├─ shots/             샷별 HTML
├─ assets/            사용하는 영상·이미지·음성·음악·글꼴
└─ references/        참고 자료: 사용 자산과 구분
```

`film-plan.json`은 NeoDesign 보조 계획이며 OpenFilm 공식 프로토콜이 아니다. 필드는 초기화 결과와 스키마를 따른다. 샷의 목적·시간·배경·자료, 자산의 파일·해시·출처·권리, 생성 시도의 제공사·모델·참조·결과·채택 여부를 기록한다. 필요한 작업만 캐릭터 기준을 선택적으로 기록한다. 시각 검수 `pending`은 경고이며 완료가 아니다.

`film.html`의 `<section>`은 트랙이고 첫 트랙이 화면 위에 놓인다. 같은 트랙의 클립은 겹치지 않는다. `<iframe>`은 샷, `<video>`는 영상, `<img>`는 정지 이미지, `<audio>`는 소리다. `src`의 `#t=in,out`은 원본 사용 구간, `at`은 영화에서 시작하는 초다. 영상·오디오는 `speed`로 속도를 바꾸며 원본을 반복 재인코딩하지 않는다.

원본·중간 결과·출처 자료를 자동 삭제하지 않는다. 사용하지 않는 자료를 분리할 때도 사용자 파일과 다른 프로젝트는 보존한다. 실제 제품 데모는 확인한 화면과 결과를 쓰고 재구성 UI는 표시한다. 성능 주장에 영향을 주는 배속·대기 생략도 알린다.

## 3. 사람의 편집 보존

수정 직전에 `film.html`을 다시 읽고 요청받은 부분만 고친다.

- 잠긴 트랙의 내용과 순서를 보존한다. 아래·위 레이어가 바뀌는 재배치도 변경이다.
- Studio의 `overrides`·`size`와 안정적인 DOM id·선택자를 보존한다.
- 수동 수정과 충돌하면 덮어쓰지 말고 변경 범위를 좁힌다.
- `.film`·`.git`은 도구 소유다. 직접 지우거나 고치지 않는다.

```bash
node scripts/design/cli.mjs film snapshot --dir ./film-project --out ./snapshot.json
# 필요한 부분만 수정한 뒤
node scripts/design/cli.mjs film check --dir ./film-project --baseline ./snapshot.json
```

snapshot 비교는 잠금·순서·수동 override 등 보호 데이터 변경을 점검한다. 전체 백업·자동 복구·사람의 승인·시각 품질을 보장하지 않는다. 원본과 기존 체크포인트도 유지한다.

## 4. 기존 진단 보강과 실제 확인

```bash
node scripts/design/cli.mjs film init --dir ./film-project
node scripts/design/cli.mjs film check --dir ./film-project
node scripts/design/cli.mjs film sample --dir ./film-project --out ./film-review
```

`film check`는 계획·파일·보호 정보를 확인한다. `film sample`은 기존 진단의 보강이며 OpenFilm의 `look`를 호출하지 않는다. 자체 Playwright로 샷별 12개 시간 표본을 두 셔플 순서에서 그려 PNG 접촉시트와 페이지 오류를 확인한다. 외부 요청을 차단하는 로컬 경로다. 전체 타임라인·음성 믹스·MP4는 확인하지 않는다.

기본 check는 계획과 파일 검사이며 `--baseline` 비교에서 편집 문서도 읽는다. sample은 샷 id에 대응하는 iframe의 파일·구간을 대조한다. `filmHost` 표식으로 자율 재생을 막지만 OpenFilm의 시계·난수·미디어 프레임 가상화는 제공하지 않는다. 해당 호스트 동작에 의존하는 샷은 자체 sample을 호환성 판정으로 쓰지 않고 실제 OpenFilm look에서 검증한다. 기존 검사 결과 폴더는 덮어쓰지 않으므로 재검수에는 새 `--out`을 쓴다.

표본 사이의 깜빡임·잘림과 오탈자·내용 오류는 남을 수 있다. 외부 요청 차단도 코드 신뢰성과 모든 기기 보안을 보장하는 샌드박스가 아니다. 도구가 없거나 실행하지 못하면 미실행으로 남긴다. OpenFilm의 `look`도 기본 표본 검사이며 경고가 있어도 `ok`일 수 있다. [구현 범위](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/src/look.mjs#L95)

실제 OpenFilm이 필요한 요청에서 설치 상태·버전·로컬 매뉴얼과 도움말을 확인한다. 문서를 읽었다는 이유로 설치·유료 생성을 시작하지 않는다.

```bash
openfilm open ./film-project
# 이후 film-project 폴더에서
openfilm look
# 사용자가 영상 파일을 요청했고 검수한 경우
openfilm render
```

기본 `render`는 30fps MP4다. `film sample`을 MP4 렌더 완료로 보고하지 않는다. 실제 출력 후 시작·끝·전환·한글 가독성과 소리를 확인한다. 기존 NeoDesign 편집기와 외부 OpenFilm Studio는 서로 다르다.

## 5. 외부 OpenFilm 내보내기 지원표

아래는 기준 커밋의 **외부 OpenFilm 지원**이다. NeoDesign이 모두 내장·실행 보장하는 목록이 아니다. CLI `render`는 영상 중심이고, 아래의 폭넓은 출력은 Studio export 서비스에서 고른다. 새 NeoDesign 큐나 writer를 만들지 않는다.

| 종류(kind) | 지원 형식 | 전달 시 밝힐 한계 |
|---|---|---|
| video | H.264·HEVC MP4, VP9 WebM, ProRes 422 HQ·4444 MOV, HEVC+Alpha MOV, PNG 시퀀스 ZIP | 실제 ffmpeg 인코더 필요. 투명은 VP9·4444·HEVC+Alpha·PNG, MP4 불가. HEVC+Alpha는 macOS 인코더 필요 |
| gif | 반복 GIF, 폭·fps·구간 선택 | 무음·팔레트 변환. 영상과 같은 색·품질 보존을 약속하지 않음 |
| audio | WAV, M4A/AAC, MP3, 전체 mix와 stems | stems는 voice/music/sfx/footage **네 역할별 혼합**. 원본 트랙 각각이 아님. 폴더·파일명으로 분류 |
| stills | PNG·JPG 장면 이미지, 여러 장이면 ZIP | 기본 클립 중간 시각 또는 지정 시각의 정지 화면 |
| poster | PNG·JPG 한 장 | 기본 전체 중간 또는 지정 시각 |
| subtitles | SRT, WebVTT, TXT 대본 | cue 없으면 실패. 별도 파일·영상 자막 굽기는 구분 |
| slides | PPTX·PDF | **장면 JPEG 한 장씩의 래스터 문서**. 개별 텍스트·도형 편집형 변환 아님. 장면명은 발표자 노트 |
| nle | xmeml v4 XML(Premiere·DaVinci), FCPXML 1.10(Final Cut Pro), CapCut·剪映 draft | HTML샷·CSS효과·회전·속도 변경 등은 베이크. 원본 DOM/애니메이션 편집 불가. 원본 앱 프로젝트 형식과 구분 |
| project | 프로젝트 ZIP 또는 폴더, 선택적 history/chat/logs | 외부 OpenFilm 기능. NeoDesign의 아래 납품 pack은 새 폴더만 생성 |

NLE는 사용자가 편집 프로그램으로 넘기길 요청했을 때 외부 OpenFilm Studio에서 선택한다. 가능한 원본 영상·이미지의 트림·기본 배율·위치는 유지하지만 복잡한 효과는 렌더된 미디어로 바뀐다. 프레임 시각은 선택 fps에 반올림한다. `copy`는 미디어 동봉, `link`는 원본 경로에 의존한다. FCPXML 자막은 Basic Title이며 원래 스타일 전체를 보존하지 않는다. 대상 앱에서 가져오기 전에는 호환 검증 완료로 쓰지 않는다.

## 6. 프로젝트 납품 폴더

```bash
node scripts/design/cli.mjs handoff check --dir ./film-project
node scripts/design/cli.mjs handoff pack --dir ./film-project --out ./delivery-new
```

`handoff pack`은 **새 폴더**에 참조 파일·SHA-256 목록·재개 안내를 모으는 NeoDesign 기능이다. ZIP·영상·NLE를 생성하지 않고, 원본 프로젝트를 수정하지 않는다. `.git`·`.film`·`.design`·`.env`는 제외한다. 외부 OpenFilm의 project export와도 별개다.

추적 범위는 정적으로 확인되는 로컬 참조다. 동적으로 조립한 경로·런타임 fetch·외부 서비스·외부 파일까지 완전 포장했다고 주장하지 않는다. 제외·누락·외부 의존을 검토하고 수신 환경에서 다시 열어 확인한다. 해시는 복사 일치 확인이며 이용 권리·작동·비밀정보 부재를 보장하지 않는다. 경로 제외만으로 코드에 하드코딩된 키가 사라지지 않으므로 출처·개인정보 검수도 유지한다.

## 7. 오디오·자막·개인정보

소리는 페이지 안의 재생 대신 `film.html` 클립으로 둔다. 샷을 옮기면 효과음도 재검토한다. 발화는 원본 옆 동명 VTT(`voice.wav` → `voice.vtt`), 번역은 언어별 VTT로 관리한다. 이름·수치·부정·조건과 원본 시각을 보존한다. 단어 시각이 없으면 정밀 정렬 완료로 표시하지 않는다. 발화 없는 BGM에는 가짜 자막이 필요 없다. 음악·음성의 출처·권리·제공사를 기록하고 목소리를 가리지 않는지 청취한다.

다른 발언을 합쳐 새 주장을 만들지 않는다. 실제 사용 프레임에서 키·토큰·비밀번호·고객 정보·알림·다른 탭을 확인하고 가리거나 다시 촬영한다. 비밀키를 HTML·계획·납품 폴더·스크린샷·로그에 넣지 않는다. 로컬 편집과 외부 생성의 자료 전송은 구분한다.

## 8. 환경·비용·라이선스와 근거

공식 CLI 소스는 Node >=22.2, 소스 개발 루트는 Node >=22.18·pnpm 9.15.9다. ffmpeg가 필요하며 최초 사용 과정에 headless Chromium 다운로드가 생길 수 있다. Studio 버전 저장은 git도 필요하다. 편집·렌더와 생성형 미디어 비용은 별개다. 제공사·키·한도·자료 전송·반복 생성 비용은 실제 사용과 승인 범위에 맞게 기록한다.

OpenFilm 코드·문서는 MIT다. 사본 또는 상당 부분을 배포에 포함하면 `Copyright (c) 2026 OpenFilm contributors`와 MIT 허가문을 보존한다. 이름·로고는 별도 상표이며 공식 제휴·지원작처럼 표시하지 않는다. MIT가 외부 영상·음악·글꼴·음성의 이용 권리까지 주지는 않는다.

- [매뉴얼·편집 계약](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/MANUAL.md), [프로토콜 0.1](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/SPEC.md)
- [내보내기 구현](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/studio/server/exports.mjs), [출력 테스트](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/studio/server/exports.test.mjs)
- [PPTX/PDF writer](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/studio/server/slides.mjs), [NLE 변환](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/studio/server/nle.mjs), [FCPXML writer](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/studio/server/fcpxml.mjs)
- [CLI 옵션](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/bin/openfilm.mjs#L74), [패키지 환경](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/packages/openfilm/package.json)
- [MIT](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/LICENSE), [상표](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/TRADEMARK.md), [제3자 고지](https://github.com/openfilm/openfilm/blob/42c46e6ed5cdfafeb1abd4a91f6b61f7c6ddff25/THIRD_PARTY_NOTICES.md)

근거는 소스·테스트의 읽기 확인이다. 실제 제공사 연결·코덱 렌더·대상 편집 앱 가져오기는 실행 증거가 있을 때만 완료로 보고한다. Studio 자체 재배포 시 Inter·React·Lucide·playwright-core 고지도 확인한다.
