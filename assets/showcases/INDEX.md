# Design Philosophy Showcases — 샘플 에셋 인덱스

> 8가지 시나리오 × 3가지 스타일 = 24개 프리셋 디자인 샘플
> Phase 3 디자인 방향 추천 시, 「이 스타일로 제작하면 어떤 모습인지」 직접 보여주기 위해 사용

## 스타일 설명

| 코드 | 유파 | 스타일 이름 | 비주얼 분위기 |
|------|------|---------|---------|
| **Pentagram** | 정보 건축파 | Pentagram / Michael Bierut | 흑백의 절제, 스위스 그리드, 강한 폰트 계층, #E63946 레드 강조 |
| **Build** | 미니멀리즘파 | Build Studio | 럭셔리급 여백(70%+), 미묘한 폰트 두께(200-600), #D4A574 웜 골드, 정교함 |
| **Takram** | 동양 철학파 | Takram | 부드러운 테크 감성, 자연색(베이지/그레이/그린), 라운드 코너, 예술 같은 차트 |

## 시나리오 빠른 참조표

### 콘텐츠 디자인 시나리오

| # | 시나리오 | 규격 | Pentagram | Build | Takram |
|---|------|------|-----------|-------|--------|
| 1 | 공식 계정 커버 | 1200×510 | `cover/cover-pentagram` | `cover/cover-build` | `cover/cover-takram` |
| 2 | PPT 데이터 페이지 | 1920×1080 | `ppt/ppt-pentagram` | `ppt/ppt-build` | `ppt/ppt-takram` |
| 3 | 세로형 인포그래픽 | 1080×1920 | `infographic/infographic-pentagram` | `infographic/infographic-build` | `infographic/infographic-takram` |

### 웹사이트 디자인 시나리오

| # | 시나리오 | 규격 | Pentagram | Build | Takram |
|---|------|------|-----------|-------|--------|
| 4 | 개인 홈페이지 | 1440×900 | `website-homepage/homepage-pentagram` | `website-homepage/homepage-build` | `website-homepage/homepage-takram` |
| 5 | AI 내비게이션 사이트 | 1440×900 | `website-ai-nav/ainav-pentagram` | `website-ai-nav/ainav-build` | `website-ai-nav/ainav-takram` |
| 6 | AI 글쓰기 도구 | 1440×900 | `website-ai-writing/aiwriting-pentagram` | `website-ai-writing/aiwriting-build` | `website-ai-writing/aiwriting-takram` |
| 7 | SaaS 랜딩 페이지 | 1440×900 | `website-saas/saas-pentagram` | `website-saas/saas-build` | `website-saas/saas-takram` |
| 8 | 개발자 문서 | 1440×900 | `website-devdocs/devdocs-pentagram` | `website-devdocs/devdocs-build` | `website-devdocs/devdocs-takram` |

> 각 항목에는 동시에 `.html`(소스 코드)과 `.png`(스크린샷) 두 개의 파일이 있습니다

## 사용 설명

### Phase 3 추천 시 인용
디자인 방향을 추천한 후, 해당 시나리오의 사전 제작된 스크린샷을 보여줄 수 있습니다:
```
「이것은 Pentagram 스타일로 만든 공식 계정 커버 효과입니다 → [표시 cover/cover-pentagram.png]」
「Takram 스타일로 만든 PPT 데이터 페이지는 이런 느낌입니다 → [표시 ppt/ppt-takram.png]」
```

### 시나리오 매칭 우선순위
1. 사용자가 요구하는 시나리오에 정확한 매칭이 있는 경우 → 해당 시나리오를 직접 표시
2. 정확한 매칭은 없으나 유형이 유사한 경우 → 가장 유사한 시나리오를 표시 (예: 「제품 공식 홈페이지」 → SaaS 랜딩 페이지 표시)
3. 완전히 일치하지 않는 경우 → 사전 제작된 샘플을 건너뛰고 바로 Phase 3.5 실시간 생성으로 진행

### 가로 대비 표시
동일한 시나리오의 3가지 스타일은 나란히 표시하기에 적합하며, 사용자가 직관적으로 비교할 수 있도록 돕습니다:
- 「이것은 동일한 공식 계정 커버이며, 각각 3가지 스타일로 구현된 효과입니다」
- 표시 순서: Pentagram(이성적 절제) → Build(럭셔리 미니멀리즘) → Takram(부드럽고 따뜻함)

## 콘텐츠 상세 정보

### 공식 계정 커버(cover/)
- 콘텐츠: Claude Code Agent 워크플로우 — 8개 병렬 Agent 아키텍처
- Pentagram: 거대한 빨간색 「8」 + 스위스 그리드 라인 + 데이터 바
- Build: 매우 얇은 폰트 두께 「Agent」가 70% 여백 속에 부유함 + 따뜻한 금색 가는 선
- Takram: 예술 작품으로서의 8개 노드 방사형 순서도 + 베이지색 배경

### PPT 데이터 페이지 (ppt/)
- 내용: GLM-4.7 오픈 소스 모델 Coding 능력 돌파 (AIME 95.7 / SWE-bench 73.8% / τ²-Bench 87.4)
- Pentagram: 260px 「95.7」 앵커 포인트 + 빨강/회색/연회색 대비 막대 그래프
- Build: 세 그룹의 120px 초미세 숫자 플로팅 + 웜 골드 그라데이션 대비 막대
- Takram: SVG 레이더 차트 + 3색 중첩 + 둥근 모서리 데이터 카드

### 세로형 인포그래픽 (infographic/)
- 내용: AI 메모리 시스템 CLAUDE.md 93KB에서 22KB로 최적화
- Pentagram: 거대한 「93→22」 숫자 + 번호 매겨진 블록 + CSS 데이터 막대
- Build: 극도의 여백 + 부드러운 그림자 카드 + 웜 골드 연결선
- Takram: SVG 링 차트 + 유기적 곡선 순서도 + 프로스테드 글래스 카드

### 개인 홈페이지 (website-homepage/)
- 내용: 독립 개발자 Alex Chen의 포트폴리오 홈페이지
- Pentagram: 112px 이름 + 스위스 그리드 레이아웃 + 편집 숫자
- Build: 글래스모피즘 내비게이션 + 플로팅 통계 카드 + 초미세 폰트 두께
- Takram: 종이 질감 + 작은 원형 아바타 + 머리카락 굵기의 구분선 + 비대칭 레이아웃

### AI 내비게이션 사이트 (website-ai-nav/)
- 내용: AI Compass — 500개 이상의 AI 도구 디렉토리
- Pentagram: 각진 검색창 + 번호 매겨진 도구 목록 + 대문자 카테고리 태그
- Build: 둥근 모서리 검색창 + 정교한 흰색 도구 카드 + 알약 모양 태그
- Takram: 유기적인 어긋난 카드 레이아웃 + 부드러운 카테고리 태그 + 도표식 연결

### AI 글쓰기 도구 (website-ai-writing/)
- 내용: Inkwell — AI 글쓰기 도우미
- Pentagram: 86px 대형 제목 + 와이어프레임 에디터 모델 + 그리드 특성 열
- Build: 플로팅 에디터 카드 + 웜 골드 CTA + 럭셔리한 글쓰기 경험
- Takram: 시적인 세리프 제목 + 유기적인 에디터 + 플로우차트

### SaaS 랜딩 페이지 (website-saas/)
- 내용: Meridian — 비즈니스 인텔리전스 분석 플랫폼
- Pentagram: 흑백 분할 열 + 구조화된 대시보드 + 140px 「3x」 앵커
- Build: 플로팅 대시보드 카드 + SVG 영역 차트 + 웜 골드 그라데이션
- Takram: 둥근 모서리 막대 그래프 + 프로세스 노드 + 부드러운 어스 톤

### 개발자 문서 (website-devdocs/)
- 내용: Nexus API — 통합 AI 모델 게이트웨이
- Pentagram: 왼쪽 내비게이션 바 + 각진 코드 블록 + 빨간색 문자열 하이라이트
- Build: 중앙 플로팅 코드 카드 + 부드러운 그림자 + 웜 골드 아이콘
- Takram: 베이지색 코드 블록 + 플로우차트 연결 + 점선 특성 카드

## 파일 통계

- HTML 소스 파일: 24개
- PNG 스크린샷: 24개
- 총 자산: 48개 파일

---

**버전**: v1.0
**생성일**: 2026-02-13
**적용 대상**: design-philosophy skill Phase 3 추천 단계
