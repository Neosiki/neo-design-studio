# GitHub 자동화와 품질 검증

이 폴더는 Neo Design Studio의 커밋·Pull Request 검증을 자동화하는 GitHub Actions 설정과 운영 안내를 담습니다. 현재 워크플로우는 `.github/workflows/design-verify.yml`에서 관리하며, 검수 실패를 성공으로 처리하지 않는 것을 기본 계약으로 합니다.

## 자동화 흐름

| 단계 | 실행 내용 | 확인 기준 |
|---|---|---|
| 1. 트리거 | `push`와 Pull Request에서 실행 | 변경 사항이 검증 파이프라인에 진입 |
| 2. 환경 준비 | Ubuntu와 Node.js 환경 구성 | 의존성과 실행 환경 고정 |
| 3. 기본 검증 | CLI·프로젝트 구조·스키마 확인 | 잘못된 입력과 누락된 계약 차단 |
| 4. 렌더 검증 | HTML·덱·화이트보드 산출물 확인 | 골든 프레임과 선노출 픽셀 검수 |
| 5. 품질 게이트 | 접근성·조판·보안·스타일 검사 | 실패 시 비정상 종료 |
| 6. 결과 보관 | 실패 시 검수 산출물 업로드 | 원인 분석과 재현 지원 |

## 로컬에서 동일하게 실행하기

저장소 루트에서 다음 명령을 실행하면 CI와 같은 핵심 검증을 재현할 수 있습니다.

```bash
npm install
npm test
npm run design -- --help
```

REST 서버와 작업 목록은 다음 명령으로 확인합니다.

```bash
npm run serve
curl http://127.0.0.1:7801/health
curl http://127.0.0.1:7801/ops
```

서버 상태가 정상이라면 `/health`에서 `ok: true`를 반환하고 `/ops`에서 등록된 작업 목록과 스키마를 반환합니다.

## 실제 제작 결과 미리보기

### 제작 운영 시스템 소개

![Neo Design Studio 기능 개요](../assets/feature-overview/design_studio_feature_overview.png)

움직이는 버전: [기능 개요 GIF 보기](../assets/feature-overview/design_studio_feature_overview.gif) · [MP4 영상 다운로드](../assets/feature-overview/design_studio_feature_overview.mp4)

### 3D 영어 학습 앱 사례

![3D 영어 학습 앱 사례](../assets/readme/korean-3d-learning-app.png)

이 이미지는 저장소의 실제 제작 사례를 보여주는 참고 자산입니다. 상세 설명은 [`docs/examples/3d-learning-app-korean.md`](../docs/examples/3d-learning-app-korean.md)에서 확인할 수 있습니다.

### 결과물 쇼케이스

| 결과물 | 샘플 이미지 |
|---|---|
| 인포그래픽 | [Build](../assets/showcases/infographic/infographic-build.png) · [Pentagram](../assets/showcases/infographic/infographic-pentagram.png) · [Takram](../assets/showcases/infographic/infographic-takram.png) |
| 웹사이트 | [AI 내비게이션](../assets/showcases/website-ai-nav/ainav-build.png) · [AI 글쓰기](../assets/showcases/website-ai-writing/aiwriting-build.png) · [홈페이지](../assets/showcases/website-homepage/homepage-build.png) |
| 프레젠테이션 | [Build](../assets/showcases/ppt/ppt-build.png) · [Pentagram](../assets/showcases/ppt/ppt-pentagram.png) · [Takram](../assets/showcases/ppt/ppt-takram.png) |

## 실행 가능한 샘플

| 샘플 | 구성 | 실행·확인 문서 |
|---|---|---|
| `examples/design-studio-intro` | 프로젝트 매니페스트, IR, 방향안과 로드맵 | [`examples/README.md`](../examples/README.md) |
| `examples/whiteboard-intro` | 화이트보드 IR, 자산과 SRT 내레이션 | [`skills/whiteboard-video/SKILL.md`](../skills/whiteboard-video/SKILL.md) |
| `demos/c1`~`c6` | iOS 프로토타입, 슬라이드, 모션, 인포그래픽, 전문가 검토 | [`demos/README.md`](../demos/README.md) |
| `docs/examples` | 3D 학습 앱과 데이터저널리즘 사례 | [`docs/examples/README.md`](../docs/examples/README.md) |

## 실패 시 확인할 위치

검증이 실패하면 GitHub Actions 실행 화면의 로그와 업로드된 `golden-failure`, `qa-report.html`, `tests/fixtures/whiteboard/out` 산출물을 먼저 확인합니다. 로컬에서는 실패한 명령을 단독 실행해 입력·IR·자산·산출물 중 어느 단계에서 문제가 발생했는지 확인합니다.

## 관련 문서

- [`README.md`](../README.md) — 전체 프로젝트 개요와 실행 방법
- [`QUALITY_GATES_KO.md`](../docs/QUALITY_GATES_KO.md) — 품질 게이트 기준
- [`DESIGN_CLI_KO.md`](../docs/DESIGN_CLI_KO.md) — CLI 사용법
- [`MCP_API_KO.md`](../docs/MCP_API_KO.md) — MCP·REST 연동
- [`SECURITY.md`](../SECURITY.md) — 보안 원칙과 데이터 흐름


## 교육·공공 데이터 사례

자동화 스킬은 제작형 교육 콘텐츠와 공공 데이터 콘텐츠에도 적용됩니다. [실제 사례 샘플 안내](../docs/examples/README.md)에서 영어 학습 앱과 지진 디지털저널리즘의 입력·구조화·제작·검수·산출물을 비교할 수 있습니다.

- [3D 생활영어 학습 앱 사례](../docs/examples/3d-learning-app-korean.md)
- [지진 디지털저널리즘 사례](../docs/examples/data-journalism-korean-earthquake.md)
- [English Explorer 온라인 데모](https://neosiki.github.io/english-explorer/)
- [3D 영어 학습 소개 페이지](https://neosiki.github.io/english-learning.html)

![3D 영어 학습 앱 미리보기](../assets/readme/korean-3d-learning-app.png)

지진 데이터 콘텐츠는 지역·기간·단위·출처·해석 한계를 명시하고 지도·차트·기사 서술의 범위를 일치시키는 방식으로 검수합니다.

## 바로 보는 이미지와 영상

### 기능 개요 애니메이션

![Neo Design Studio 기능 개요 애니메이션](../assets/feature-overview/design_studio_feature_overview.gif)

위 GIF는 GitHub 페이지에서 별도 조작 없이 자동 재생되는 미리보기입니다. 고화질 영상은 [MP4 원본 바로 열기](https://github.com/Neosiki/neo-design-studio/raw/refs/heads/master/assets/feature-overview/design_studio_feature_overview.mp4)를 선택하면 GitHub 영상 플레이어에서 확인할 수 있습니다.

### 3D 영어 학습 앱 이미지

![3D 영어 학습 앱 미리보기](../assets/readme/korean-3d-learning-app.png)

관련 온라인 데모: [English Explorer](https://neosiki.github.io/english-explorer/) · [3D 영어 학습 소개](https://neosiki.github.io/english-learning.html)


## 실제 실행 화면과 데이터저널리즘 미디어

### 3D 영어 학습 앱 실행 화면

![영어 학습 앱 실행 화면](../assets/case-studies/english-learning/english-explorer-product-video-A.gif)

위 GIF는 English Explorer의 실제 실행 장면을 연속 화면으로 보여주는 미리보기입니다. 정지 포스터와 고화질 영상도 함께 제공합니다.

- [영어 학습 앱 포스터 이미지](../assets/case-studies/english-learning/english-explorer-product-video-A-poster.jpg)
- [영어 학습 앱 MP4 실행 영상](../assets/case-studies/english-learning/english-explorer-product-video-A.mp4)
- [3D 영어 앱 데모 MP4](../assets/case-studies/english-learning/3d-english-app-demo.mp4)
- [English Explorer 온라인 데모](https://neosiki.github.io/english-explorer/)

### 지진 디지털저널리즘 이미지

지정된 `korean-earthquake-data-journalism` 저장소의 실제 시각화 이미지를 복사해 바로 볼 수 있도록 구성했습니다.

![지진 데이터 개요](../assets/case-studies/earthquake-journalism/01_overview.png)

![연도별 지진 추이](../assets/case-studies/earthquake-journalism/02_yearly_trend.png)

![규모 분포](../assets/case-studies/earthquake-journalism/03_magnitude_distribution.png)

![지역별 분포](../assets/case-studies/earthquake-journalism/04_regional_distribution.png)

추가 시각화: [주요 사건](../assets/case-studies/earthquake-journalism/05_key_events.png) · [데이터 범위](../assets/case-studies/earthquake-journalism/06_data_coverage.png) · [주요 사건 타임라인](../assets/case-studies/earthquake-journalism/07_major_event_timeline.png) · [좌표 산점도](../assets/case-studies/earthquake-journalism/08_coordinate_scatter.png)

- [지진 디지털저널리즘 세로형 MP4 영상](../assets/case-studies/earthquake-journalism/korean_earthquake_data_journalism_vertical_extended.mp4)
- [원본 저장소](https://github.com/Neosiki/korean-earthquake-data-journalism)
- [사례 설명 문서](../docs/examples/data-journalism-korean-earthquake.md)
