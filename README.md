# Neo Design Studio

AI 기반 비주얼 디자인·애니메이션 제작 운영 시스템입니다. 기획된 콘텐츠를 구조화하고 문서, 화이트보드 영상, 시각 자료와 검수 결과를 하나의 재현 가능한 작업 흐름으로 관리합니다.

**2026.11.1 · 2026년 11월 버전**은 로컬 참조 영상의 컷·자막 영역 변화를 분석하고, 원본과 렌더의 화면·시간·오디오 차이를 대조합니다. 분석 결과에서 편집용 OpenFilm 샷 초안도 생성합니다. [11월 참조 영상 사용법](references/reference-video.md) · [10월 OpenFilm 사용법](docs/OCTOBER_2026_KO.md)

## 주요 기능
| 영역 | 기능 |
|---|---|
| 콘텐츠 제작 | HTML, 문서, 화이트보드 영상, 시각 자료 |
| 작업 운영 | 생성·조회·상태 변경·취소·재시도 |
| 증분 처리 | 입력·IR·자산·산출물 해시와 stale 관리 |
| 검수 | 접근성·조판·보안·스키마 검증과 수정 제안 |
| 변경 관리 | 체크포인트·차이 비교·복구 |
| 연동 | CLI·REST API·MCP. film·handoff 보조 명령은 CLI 전용 |
| 영상 편집 연결 | OpenFilm Studio 선택형 타임라인, locked·overrides·size 보호, 샷 표본 진단 |
| 참조 영상 검수 | 전체 프레임 PTS 기록, 컷·플래시·자막 영역 후보, 원본/렌더 대조, SRT를 연결한 편집용 샷 초안 |
| 프로젝트 전달 | 정적 참조 누락 점검, SHA-256 목록과 재개 안내를 담는 납품 폴더 |
| 디자인 시스템 | 스타일 레지스트리·팔레트·레이아웃 규칙 |

## 선화 애니메이션 선택 기능

펜으로 그린 듯한 SVG 인물·동물과 낮밤 장면은 [선화 스킬](skills/line-art-animation/SKILL.md)을 선택합니다. 일반 영상의 HyperFrames 기본 경로와 OpenFilm 편집 경로는 유지합니다.

- 웹에서는 마우스 상호작용, 단독 MP4에서는 고정 해상도 영상을 제공합니다.
- Windows Chrome 탐색·새 프로젝트 초기화·프레임 캡처·MP4 검증 도우미를 포함합니다.
- Node 22.18 이상과 Chrome을 사용하며, MP4 출력에는 FFmpeg·FFprobe도 필요합니다. 캡처는 15·30·60fps를 지원합니다.
- 원본 MIT 라이브러리의 커밋·해시·라이선스를 함께 보관합니다.

코덱스 대화창에서 다음처럼 요청합니다. PowerShell 명령이 아닙니다.

```text
네오디자인스튜디오 선화 기능으로 새벽 빵집을 만들어줘.
쟁반을 든 제빵사와 창가 고양이. 먼저 인물 한 명을 검토하고,
선정한 뒤 상호작용 웹페이지와 30초 1080p MP4로 확장해줘.
```

환경 점검: `node skills/line-art-animation/scripts/line-art.mjs doctor`.
[실행·캡처 안내](skills/line-art-animation/references/runtime.md)

Codex 수동 설치 예: `git clone https://github.com/Neosiki/neo-design-studio.git ~/.agents/skills/design-studio`.

## 저장소 구조
`자산`은 제작 자산, `문서`는 설계·운영 문서, `예시`는 샘플, `스키마`는 데이터 계약을 담습니다. `스크립트`에는 CLI·REST·MCP·렌더링 코드가 있으며 `스타일`과 `테스트`에는 디자인 규칙과 자동 검증 자료가 있습니다. `.github/워크플로우`는 GitHub Actions 설정을 담습니다.

## 시작하기
```bash
npm install
npm test
npm run design -- --help
npm run test:reference
npm run serve
```

서버 기본 주소는 `http://127.0.0.1:7801`입니다.

```bash
curl http://127.0.0.1:7801/health
curl http://127.0.0.1:7801/ops
```

## 검증 결과
2026.11.0에서 기존 회귀 315개, 참조 영상 검사 18개, 기존 브라우저 검사 8개, 참조 보고서·샷 초안 브라우저 검사 3개가 통과했습니다. 참조 영상 검사는 `npm run test:reference`로 실행하며 FFmpeg·FFprobe가 필요합니다. 이어서 `npm run test:reference-browser`로 보고서 이미지, 자막 표시와 샷의 시간 이동을 확인합니다. 기존 OpenFilm 검수는 `npm run test:film-browser`로 실행합니다. 브라우저 검사에는 Playwright·Sharp와 Chromium이 필요합니다.

2026.11.1 선화 기능: 별도 단위 테스트 11개, 기존 회귀 315개, 브라우저 확인 7항목을 통과했습니다. Windows에서 원본 예제의 1920×1080·30fps·1초 H.264 MP4를 실제 출력했습니다. 이는 30초 신규 장면의 제작·전수 검수 완료를 뜻하지 않습니다. 반복 스크린샷은 SVG 상태가 같아도 미세한 픽셀 차이가 있어 픽셀 단위 동일성을 보장하지 않습니다.

## 작업 원칙
프로젝트 초기화 → 작업 계획 → 승인 게이트 → 산출물 생성 → 자동 검수 → 수정 제안 및 미리보기 → 승인·반영 → stale 재검증 순서로 운영합니다. 승인되지 않은 수정은 원본을 변경하지 않고 반영 전 체크포인트를 남깁니다.

## 보안
`.env.example`은 환경변수 형식만 안내합니다. 실제 비밀키는 저장소에 커밋하지 말고 로컬 환경변수 또는 GitHub Actions Secrets에 등록해야 합니다. 자세한 내용은 [`보안.md`](보안.md)를 확인하세요.


<!-- 파일 역할: 프로젝트 전체 개요와 실행 안내 -->


## GitHub 자동화 스킬

자동화 트리거, 품질 게이트, 실제 영상·이미지·실행 샘플은 [GitHub 자동화 README](.github/README.md)에서 확인할 수 있습니다.


## 미디어 바로 보기

GIF·PNG 미리보기와 MP4 원본은 [GitHub 자동화 README](.github/README.md)에서 바로 확인할 수 있습니다.
