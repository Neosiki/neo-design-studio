# 실제 사례 샘플

이 디렉터리는 Neo Design Studio의 자동화 스킬을 실제 교육·데이터 콘텐츠에 적용한 사례를 설명합니다. 각 사례는 입력 자료, 구조화된 IR 또는 프로젝트 정의, 시각 결과물, 검수 기준과 재현 경로를 함께 제시합니다.

## 사례 비교

| 사례 | 목적 | 핵심 산출물 | 연결 문서 |
|---|---|---|---|
| 3D 생활영어 학습 앱 | 관찰·조작·질문·피드백을 연결하는 체험형 학습 | 3D 장면, 학습 팝업, 단계별 콘텐츠 | [`3d-learning-app-korean.md`](./3d-learning-app-korean.md) |
| 지진 디지털저널리즘 | 지역·기간별 지진 데이터를 검증 가능한 기사형 콘텐츠로 전환 | 데이터 설명, 시각화 기준, 출처·한계 안내 | [`data-journalism-korean-earthquake.md`](./data-journalism-korean-earthquake.md) |

## 3D 생활영어 학습 앱

![3D 영어 학습 앱](../../assets/readme/korean-3d-learning-app.png)

저장소의 3D 학습 앱 사례는 3D 모델을 장식으로만 보여주는 것이 아니라 학습자가 장면을 관찰하고 사물을 선택하며 영어 표현과 피드백을 확인하는 흐름으로 구성합니다. 프로젝트 구조화, 화면·자산 관리, 접근성·조판 검수와 결과물 설명을 하나의 제작 흐름으로 연결하는 예시입니다.

- 사례 문서: [`3d-learning-app-korean.md`](./3d-learning-app-korean.md)
- 온라인 학습 앱: [English Explorer](https://neosiki.github.io/english-explorer/)
- 홈페이지 사례 소개: [3D 영어 학습](https://neosiki.github.io/english-learning.html)
- 기능 영상: [`design_studio_feature_overview.mp4`](../../assets/feature-overview/design_studio_feature_overview.mp4)

## 지진 디지털저널리즘

지진 사례는 공공 데이터를 기사형 시각 콘텐츠로 전환하는 작업입니다. 지역·기간·단위·갱신 시점을 명시하고, 지도·차트·본문 서술이 같은 범위와 정의를 사용하도록 검증합니다. 상관관계를 인과관계로 과장하지 않으며 결측값, 집계 기준과 해석의 한계를 함께 제시하는 것이 핵심입니다.

- 사례 문서: [`data-journalism-korean-earthquake.md`](./data-journalism-korean-earthquake.md)
- 관련 저장소: [korean-earthquake-data-journalism](https://github.com/Neosiki/korean-earthquake-data-journalism)
- 데이터저널리즘 사례 페이지: [홈페이지 프로젝트 아카이브](https://neosiki.github.io/index.html#all-projects)

## 스킬 적용 순서

| 순서 | 3D 학습 앱 적용 | 지진 디지털저널리즘 적용 |
|---|---|---|
| 입력 | 학습 장면·오브젝트·표현 정의 | 원본 데이터·기간·지역·단위 |
| 구조화 | 장면·상호작용·학습 피드백 IR | 데이터 정의·기사 구조·시각화 명세 |
| 제작 | 화면·3D 자산·학습 팝업 | 차트·지도·기사형 콘텐츠 |
| 검수 | 화면 순서·텍스트·접근성·산출물 상태 | 출처·범위·단위·범례·해석 한계 |
| 결과 | 조작 가능한 학습 경험 | 재현 가능한 데이터 콘텐츠 |

## 재현성 체크

두 사례를 새로 만들 때는 입력 자료와 출처를 먼저 고정하고, 프로젝트 정의와 산출물의 관계를 남겨야 합니다. 숫자를 사용하는 지진 콘텐츠는 원본 출처·조회 기간·단위·결측 처리·반올림 방식을 기록해야 하며, 교육용 3D 콘텐츠는 장면별 목표·상호작용·피드백·대체 설명을 기록해야 합니다.



## 미디어 미리보기

### 영어 학습 앱

![영어 학습 앱 실행 GIF](../../assets/case-studies/english-learning/english-explorer-product-video-A.gif)

[실행 영상 MP4](../../assets/case-studies/english-learning/english-explorer-product-video-A.mp4) · [포스터](../../assets/case-studies/english-learning/english-explorer-product-video-A-poster.jpg)

### 지진 디지털저널리즘

![지진 데이터 개요](../../assets/case-studies/earthquake-journalism/01_overview.png)

[연도별 추이](../../assets/case-studies/earthquake-journalism/02_yearly_trend.png) · [지역별 분포](../../assets/case-studies/earthquake-journalism/04_regional_distribution.png) · [세로형 MP4](../../assets/case-studies/earthquake-journalism/korean_earthquake_data_journalism_vertical_extended.mp4)
