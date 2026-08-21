# Design Studio 벤치마크 및 고도화 로드맵

> 디자인 스튜디오 기반 Design Studio 프로젝트의 경쟁 저장소 비교와 제품 고도화 방향

- 작성일: 2026-08-16
- 조사 범위: GitHub 공개 저장소 11개와 현재 디자인 스튜디오 코드·문서
- 목적: 기능을 무작정 추가하기보다, Design Studio를 재사용 가능하고 지속적으로 편집할 수 있는 제품으로 발전시키기 위한 우선순위 결정

## 1. 요약

현재 디자인 스튜디오은 다음 영역에서 경쟁력이 높다.

- 브랜드 자산을 먼저 확인하는 강한 제작 게이트
- 약 60개 디자인 방향과 anti-AI-slop 규칙
- HTML, PPTX, PDF, PNG, SVG, MP4, GIF 다중 산출물
- 결정론적 프레임 렌더링
- 음향, BGM, 영상 품질검사
- Codex, Claude Code, Cursor 등 특정 에이전트에 종속되지 않는 스킬 구조

그러나 저장소의 현재 성격은 완성된 제품보다는 전문 제작 지침과 실행 스크립트를 모은 툴킷에 가깝다. 경쟁 프로젝트들은 다음 영역에서 더 앞서 있다.

1. 중단 후 다시 이어갈 수 있는 지속 프로젝트 상태
2. Git에서 비교하고 편집할 수 있는 구조화된 디자인 데이터
3. 생성 결과와 실제 코드가 연결된 시각 편집 화면
4. 출처, 승인, 검수 결과의 기계적 추적
5. CLI, API, MCP 기반 자동화
6. 캐시, 병렬 및 분산 렌더링

따라서 Design Studio의 다음 목표는 스타일 수를 늘리는 것이 아니라 다음과 같이 정의하는 것이 적절하다.

> 하나의 브랜드, 자료, 스토리로 웹, 발표자료, 인포그래픽, 제품 영상을 일관되게 제작하고 검증하는 에이전트 기반 디자인 운영체제

## 2. 비교 대상 선정 기준

디자인 스튜디오과 완전히 동일한 공개 프로젝트는 찾기 어렵다. 따라서 다음 축 가운데 최소 두 개 이상이 겹치는 저장소를 비교 대상으로 선정했다.

- 에이전트 스킬 또는 MCP 기반 제작
- 브랜드·레퍼런스 기반 디자인
- HTML·웹·슬라이드·영상 산출물
- 코드 기반 시각 편집
- 재현 가능한 렌더링과 자동 검수
- 프로젝트 저장, 재개, 버전 관리

별 개수는 2026-08-16 조회값이며, 프로젝트 품질의 절대 순위가 아니라 생태계 관심도를 파악하기 위한 참고 지표다.

## 3. GitHub 유사 프로젝트 11개 비교

| 프로젝트 | 규모·라이선스 | 핵심 강점 | Design Studio에 적용할 요소 |
|---|---:|---|---|
| [Anthropic Skills](https://github.com/anthropics/skills) | 약 169.6k★ · 라이선스 혼합 | `SKILL.md`, 명세, 템플릿, 리소스를 독립 패키지로 구성 | 스킬 계약, 버전 호환성, 설치·릴리스 검증, 플랫폼별 패키징 |
| [Refero Skill](https://github.com/referodesign/refero_skill) | 약 190★ · MIT | 구현 전에 레퍼런스 조사를 강제하고 선택 근거를 잠금 | 레퍼런스 잠금, 디자인 결정 원장, 근거 기반 검수 |
| [OpenPencil](https://github.com/ZSeven-W/openpencil) | 약 5.0k★ · MIT | JSON Design-as-Code, 라이브 캔버스, CLI·MCP, Figma 가져오기, 코드 내보내기 | Design IR, 레이어 편집, Git diff, 헤드리스 편집, 코드 왕복 |
| [Presenton](https://github.com/presenton/presenton) | 약 9.6k★ · Apache-2.0 | 편집 가능한 PPTX, 드래그 편집, 다중 모델, Docker, API·MCP, 다중 사용자 | 모델 공급자 계층, 서비스 API, 로컬·서버 제품화 |
| [Codex Slides](https://github.com/nexu-io/codex-slides) | 약 818★ · MIT | 지속 프로젝트, 승인 단계, 중단 후 재개, 스타일·시나리오 라이브러리, 병렬 렌더링 | 프로젝트 상태, 재개, 시나리오형 워크플로, 페이지 병렬화 |
| [slides_maker](https://github.com/addsumtech/slides_maker) | 약 441★ · MIT | 출처 추적, 네이티브 PPTX, 독립 critic·arbiter 검수, 취향 프로필 | 주장·수치 출처, 제작자·검수자 분리, 파일·레이아웃 자동 검사 |
| [HyperFrames](https://github.com/heygen-com/hyperframes) | 약 41.1k★ · Apache-2.0 | HTML 기반 결정론적 MP4, CLI·린터·카탈로그·Studio·Lambda | 영상 컴포넌트 레지스트리, 골든 테스트, 렌더 캐시, 분산 렌더링 |
| [Remotion](https://github.com/remotion-dev/remotion) | 약 56.4k★ · 특수 라이선스 | React를 영상 원본으로 사용, 대량 렌더링, Player·Editor 생태계 | 데이터 기반 컴포지션, 재사용 영상 컴포넌트, 렌더 확장 구조 |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | 약 18.9k★ · MIT | 제너레이터 기반 벡터 애니메이션, 실시간 미리보기, 음성 동기화 | 타임라인 스크러빙, 큐·마커, 보이스오버 동기화 UX |
| [SRT Whiteboard Animation](https://github.com/geeklee/srt-whiteboard-animation) | 약 754★ · MIT | SRT 장면 분할, 의미 기반 영역 주석, 보호 마스크, 연속 필기와 로컬 주석 편집기 | 선택형 화이트보드 영상 스킬, 장면 스키마, 자막 기반 타임라인, 누출 방지 마스크 |
| [Onlook](https://github.com/onlook-dev/onlook) | 약 26.5k★ · Apache-2.0 | DOM과 코드를 연결한 시각 편집, 토큰, 분기, 체크포인트 | 생성 HTML의 직접 선택·수정, 코드 반영, 버전 비교 |

## 4. 프로젝트별 시사점

### 4.1 Anthropic Skills: 지침을 제품 계약으로 바꾸기

Design Studio는 이미 스킬 구조를 사용하지만, 기능이 추가될수록 문서 간 규칙 충돌과 설치 환경 차이가 커질 수 있다. 스킬마다 입력, 출력, 필요한 도구, 실패 조건, 검증 명령을 선언하는 계약이 필요하다.

권장 항목:

- 스킬별 입력·출력 스키마
- 지원 에이전트와 최소 버전
- 필수·선택 의존성 구분
- 깨끗한 환경 설치 테스트
- 샘플 프롬프트와 기대 산출물 테스트

### 4.2 Refero: 스타일 선택에 근거 남기기

60개 스타일이 있어도 에이전트가 왜 특정 스타일을 선택했는지 기록하지 않으면 결과의 일관성이 낮아진다. 제작 전에 레퍼런스를 선택하고 변경하지 못하도록 잠그는 과정이 필요하다.

예상 파일:

```text
project/references.json
project/design-decisions.md
project/approvals.json
```

### 4.3 OpenPencil: 구조화된 디자인 원본 만들기

가장 큰 차이는 디자인 결과가 단순 HTML이나 이미지가 아니라 JSON 기반의 편집 가능한 원본이라는 점이다. Design Studio도 모든 산출물을 하나의 포맷으로 억지로 통일하기보다, 공통 프로젝트 매니페스트 아래 산출물별 IR을 두는 방식이 적절하다.

```text
project manifest
├─ brand tokens
├─ assets and provenance
├─ HTML page IR
├─ deck/page IR
└─ video/track IR
```

### 4.4 Presenton: 스킬을 서비스로 제품화하기

Presenton의 핵심은 슬라이드 생성 기능보다 모델 공급자 추상화, 로컬 앱, Docker 서버, API, MCP, 사용자 워크스페이스를 한 제품으로 묶었다는 점이다. Design Studio도 내부 렌더링 로직과 에이전트 프롬프트를 분리해야 한다.

### 4.5 Codex Slides: 결과물이 아니라 프로젝트를 저장하기

작업 단계가 디스크에 지속적으로 저장되기 때문에 사용자가 브리프, 아웃라인, 스타일을 승인한 뒤 중단해도 이어서 작업할 수 있다. Design Studio에 가장 먼저 필요한 사용성 개선이다.

주의점은 Codex Slides의 PPTX가 이미지 기반이라는 것이다. Design Studio는 이미지 기반 빠른 출력과 네이티브 편집 출력 모드를 분리하는 편이 좋다.

### 4.6 slides_maker: 출처와 독립 검수를 강제하기

검수자가 제작자와 분리되어 있고, 수치와 주장에 출처가 연결된다. 현재 Design Studio의 전문가 리뷰 규칙을 실제 실행 가능한 품질 게이트로 발전시키는 데 가장 직접적인 참고 대상이다.

### 4.7 HyperFrames: 영상 파이프라인을 플랫폼으로 만들기

Design Studio는 이미 결정론적 영상 렌더링과 HyperFrames 관련 흐름을 갖고 있다. 다음 단계는 컴포넌트 카탈로그, 린터, 미리보기 Studio, 골든 회귀 테스트, 분산 렌더링을 추가하는 것이다.

### 4.8 Remotion: 영상 구성 요소의 재사용성 확보

영상 코드가 원본이므로 데이터만 바꿔 여러 영상을 생성하거나, 조직의 영상 디자인 시스템을 라이브러리로 유지하기 쉽다. 아키텍처는 참고할 가치가 높지만 특수 라이선스이므로 코드 도입 전 별도 검토가 필요하다.

### 4.9 Motion Canvas: 타임라인 제작 경험 개선

실시간 프리뷰와 음성 동기화가 강점이다. Design Studio 영상 결과물을 수정할 때 코드만 직접 편집하게 하지 않고, 장면·큐·마커 단위로 탐색할 수 있는 인터페이스가 필요하다.

### 4.10 Onlook: 시각 편집과 코드의 왕복

브라우저에서 선택한 DOM 요소를 실제 코드 위치와 연결한다. 향후 Design Studio의 HTML 편집기도 생성된 페이지를 iframe에서 열고 요소 선택, 토큰 수정, 코드 패치가 연결되는 구조로 발전시킬 수 있다.

### 4.11 SRT Whiteboard Animation: 자막을 영상 타임라인의 의미 구조로 사용하기

이 저장소는 SRT를 단순히 화면에 표시하는 대신 영상의 장면, 요소 순서, 시작 시간과 그리기 진행을 결정하는 입력으로 사용한다. 기본 흐름은 `SRT 파싱 → 25~35초 단위 장면 제안 → 선화 생성 → 의미 기반 영역 주석 → 브라우저 미리보기·수정 → MP4 렌더 → 장면 합치기`다.

주요 근거 파일: [SKILL.md](https://github.com/geeklee/srt-whiteboard-animation/blob/main/SKILL.md), [parse_srt.py](https://github.com/geeklee/srt-whiteboard-animation/blob/main/scripts/parse_srt.py), [render_stream_whiteboard.py](https://github.com/geeklee/srt-whiteboard-animation/blob/main/scripts/render_stream_whiteboard.py), [preview.html](https://github.com/geeklee/srt-whiteboard-animation/blob/main/assets/preview.html)

도입 가치가 높은 요소는 다음과 같다.

1. **단계별 승인 게이트**: 전략, 선화, 주석, 검사 이미지, 최종 주석, 단일 장면 영상, 합본을 각각 승인받는다. 렌더 비용이 큰 작업을 승인 전에 진행하지 않는 구조다.
2. **자막 연결 장면 데이터**: `annotation.json`에서 `sequence`, `subtitle`, `narrativeRole`, `region`, `startMs`, `durationMs`를 함께 관리한다.
3. **보호 마스크**: 현재 요소의 허용 영역에서 이후 요소와 `protectedRegions`를 빼 후속 객체가 미리 드러나는 문제를 막는다.
4. **두 가지 필기 경로**: 안정적인 `grid`와 선화에 밀착하는 `skeleton` 모드를 제공한다.
5. **ink → color 단계**: 선을 먼저 그리고 색을 나중에 채워 실제 화이트보드 제작과 유사한 시각 리듬을 만든다.
6. **로컬 주석 편집기**: 브라우저에서 영역, 순서, 시작·종료 시간, 자막을 수정하고 JSON에 다시 저장한다.
7. **독립 실행 환경**: 프로젝트 내부 가상환경을 만들고 FFmpeg가 없으면 PyAV로 H.264 출력을 시도한다.

다만 저장소 전체를 그대로 병합하는 것은 권장하지 않는다. 조사 시점 기준 한 개 커밋으로 구성되어 있고 릴리스, 테스트 디렉터리, CI, JSON Schema, 고정된 의존성 잠금이 없다. 또한 다음 한계가 있다.

- 장면 분할은 문장 의미가 아니라 목표·최소·최대 시간에 따라 자막 묶음을 자르는 방식이다.
- 결과 MP4에는 원본 음성, BGM, 실제 자막 트랙을 합치지 않는다. SRT는 장면과 타이밍을 정하는 데만 사용된다.
- 사용자 메시지와 UI가 중국어로 고정되고, 미색 종이와 제한된 강조색이라는 단일 스타일을 강제한다.
- 주석 편집기의 원본 파일 저장은 Chrome·Edge의 File System Access API에 의존한다.
- 포함된 손 이미지의 출처와 재배포 범위가 파일 단위로 정리되어 있지 않다.

따라서 채택 방식은 **전체 포크가 아니라 선택적 재구현**이 적절하다.

| 도입 대상 | 판단 | 적용 방식 |
|---|---|---|
| `annotation.json` 개념 | 즉시 도입 | Design Studio 영상 IR의 `whiteboardScene` 타입으로 일반화하고 JSON Schema 추가 |
| SRT 파서와 장면 계획 | 조건부 도입 | 시간 기반 1차 분할 후 LLM·문장 경계 기반 의미 보정 추가 |
| `protectedRegions` 마스크 | 즉시 도입 | 공통 reveal-mask 모듈로 분리해 화이트보드 외 장면에도 재사용 |
| grid·skeleton 필기 | 도입 | Python 렌더 플러그인으로 격리하고 골든 프레임 테스트 추가 |
| ink → color 표현 | 도입 | 화이트보드 스타일의 기본 모션 프리셋으로 등록 |
| 로컬 주석 편집기 | 재설계 후 도입 | Design Studio 웹 편집기의 장면·타임라인 패널로 흡수 |
| 가상환경 자동 준비 | 개선 후 도입 | 버전이 고정된 lock 파일, 해시 검증, 오프라인 검사 추가 |
| 고정 중국어·고정 미색 스타일 | 그대로 도입하지 않음 | 언어, 종이색, 선색, 손 이미지, 필기 속도를 테마 토큰으로 전환 |
| 무음 영상 출력 | 그대로 도입하지 않음 | 기존 Design 음성·BGM·자막 믹싱과 연결 |

이 기능은 Design Studio의 공통 프로젝트 매니페스트와 영상 IR을 실제로 검증하는 첫 번째 수직형 플러그인으로 적합하다.

## 5. 고도화 우선순위

### P0. 기반 구조

#### 5.1 프로젝트 매니페스트와 통합 CLI

`design-project.json`에 다음을 저장한다.

- 제작 목적, 대상, 언어, 화면 비율
- 브랜드 자산과 디자인 토큰
- 선택한 스타일과 레퍼런스
- 원본 문서와 출처
- 장면·슬라이드 구성
- 사용자 승인 상태
- 생성 산출물, 파일 해시, 렌더링 결과
- 검수 상태와 오류

통합 명령 예시:

```text
design init
design plan
design build
design check
design render
design export
design resume
```

#### 5.2 공통 매니페스트와 산출물별 IR

공통 데이터와 산출물 고유 데이터를 분리한다.

- 공통: 브랜드 토큰, 에셋, 출처, 승인, 스타일
- HTML: DOM 구조, 반응형 규칙, 인터랙션
- PPTX: 슬라이드, 레이아웃, 편집 객체, 발표자 노트
- 영상: 장면, 트랙, 타임라인, 오디오, 자막

#### 5.3 자동 품질 게이트와 출처 추적

- 텍스트 넘침, 요소 겹침, 안전영역 검사
- 색상 대비와 폰트 누락 검사
- PPTX 파일 구조와 열림 여부 검사
- 영상 주요 프레임 시각 회귀 테스트
- 음량 피크, 무음, 길이 검사
- 주장·수치와 원본 출처 연결
- 독립 critic 검수
- 실패 시 명확한 종료 코드 반환

검수 결과는 `qa.json`과 `qa-report.html`로 저장한다.

### P1. 제품 경험

#### 5.4 Design Studio 웹 편집기

- 결과물 실시간 미리보기
- DOM·슬라이드 요소 선택
- 색상, 폰트, 간격, 텍스트 수정
- 장면·슬라이드 순서 변경
- 영상 타임라인 스크러빙
- 표시한 영역을 대상으로 AI 수정 요청
- 변경 전후 비교와 체크포인트 복구

첫 버전은 범용 Figma 대체제가 아니라 Design Studio가 생성한 결과물만 안정적으로 수정하는 범위로 제한한다.

#### 5.5 MCP·API·모델 공급자 계층

- `generate`, `inspect`, `revise`, `verify`, `export` MCP 도구
- OpenAI, Anthropic, Gemini, 로컬 모델 교체
- 로컬 REST API
- Codex, Claude Code, Cursor용 패키지
- Docker 기반 로컬 서버

#### 5.6 스타일·컴포넌트 레지스트리

각 스타일을 기계가 검색하고 선택할 수 있도록 메타데이터를 부여한다.

```json
{
  "id": "editorial-serif",
  "supports": ["html", "deck", "video"],
  "audiences": ["report", "education"],
  "contrast": "light",
  "motionLevel": "subtle",
  "preview": "preview.webp",
  "tokens": {},
  "components": []
}
```

#### 5.7 선택형 `whiteboard-video` 스킬

화이트보드 기능은 기본 영상 엔진에 직접 섞지 않고 선택형 스킬과 렌더 플러그인으로 구성한다.

```text
skills/whiteboard-video/SKILL.md
schemas/whiteboard-scene.schema.json
scripts/whiteboard/parse_srt.py
scripts/whiteboard/plan_scenes.py
scripts/whiteboard/render.py
studio/whiteboard/
tests/fixtures/whiteboard/
```

권장 명령 인터페이스:

```text
design whiteboard plan narration.srt
design whiteboard annotate <project>
design whiteboard preview <project>
design whiteboard render <project>
design whiteboard verify <project>
```

필수 개선 조건:

- 한국어·영어·중국어 SRT와 UTF-8 BOM 지원
- 의미 경계를 고려한 장면 분할
- 테마 토큰으로 배경·선·포인트 색상 교체
- 음성, BGM, 자막 트랙 합성
- 주석 스키마 검증과 화면 밖 영역 자동 차단
- 첫 프레임, 겹침 중간 프레임, 마지막 프레임 골든 테스트
- 손 이미지 교체와 에셋 출처 기록

### P2. 확장

- 변경 파일만 다시 만드는 렌더 캐시
- 장면·페이지 병렬 렌더링
- 작업 분기, 체크포인트, 버전 비교
- Figma 가져오기와 제한적 양방향 변환
- 한국어 타이포그래피 및 다국어 레이아웃 검증
- 접근성 검사, 자막, 대체 텍스트 자동화
- 플러그인 SDK
- 팀 워크스페이스와 공유 링크
- SBOM, 의존성, 라이선스, 비밀정보 검사

## 6. 권장 구현 순서

```text
프로젝트 매니페스트·통합 CLI
→ 산출물별 구조화 IR
→ 자동 검수·출처 추적
→ SRT 화이트보드 스킬로 영상 IR 수직 검증
→ Design Studio 웹 편집기
→ MCP·API
→ 협업·분산 렌더링
```

시각 편집기를 먼저 만들면 화면 상태와 생성 코드가 서로 어긋날 가능성이 높다. 프로젝트 상태와 IR을 먼저 정의한 뒤 편집기를 그 위에 올려야 한다.

## 7. 1차 고도화 제안

첫 번째 마일스톤은 다음 범위로 제한한다.

### 산출물

1. `schemas/project.schema.json`
2. `schemas/artifact.schema.json`
3. 통합 `design` CLI 골격
4. HTML, PPTX, MP4 예제 프로젝트 각 1개
5. `qa.json` 및 HTML 검수 보고서
6. GitHub Actions 기본 검증 워크플로

### 완료 조건

- 동일한 프로젝트 매니페스트로 HTML, PPTX, MP4 작업을 시작할 수 있다.
- 중단된 작업을 `design resume`으로 이어갈 수 있다.
- 변경되지 않은 에셋은 다시 처리하지 않는다.
- 검수 실패 시 명령이 성공으로 종료되지 않는다.
- 결과물이 사용한 입력, 브랜드 자산, 레퍼런스를 추적할 수 있다.
- 샘플 프로젝트가 Windows, macOS, Linux에서 동일한 절차로 실행된다.

### 후속 검증 파일럿: SRT 화이트보드 영상

P0 기반 구조가 완성되면 `whiteboard-video`를 첫 산출물별 플러그인으로 구현한다. 이 파일럿은 프로젝트 매니페스트, 영상 IR, 에셋 출처, 브라우저 편집, Python 렌더, 오디오 합성, 자동 품질 게이트가 하나의 흐름에서 연결되는지 검증한다.

파일럿 완료 조건:

- SRT 입력만으로 장면 계획 초안을 만들고 사용자가 장면 경계를 수정할 수 있다.
- 각 요소가 자막 구간과 연결되고, 주석 JSON이 스키마 검사를 통과한다.
- 겹친 요소가 `protectedRegions` 밖에서 미리 노출되지 않는다.
- `grid`와 `skeleton` 렌더 결과를 프로젝트 설정으로 전환할 수 있다.
- 음성·BGM·자막이 포함된 최종 MP4와 무음 작업용 MP4를 모두 출력한다.
- 동일한 입력과 설정에서 주요 검사 프레임이 재현된다.

## 8. 라이선스 주의사항

- MIT와 Apache-2.0 프로젝트는 해당 라이선스와 고지 의무를 준수해 참고하거나 도입한다.
- Anthropic Skills 저장소는 하위 디렉터리별 라이선스가 다를 수 있으므로 파일 단위 확인이 필요하다.
- Remotion은 일반적인 MIT·Apache 라이선스가 아니므로 구현 아이디어만 우선 참고하고 코드 도입 전 사용 조건을 검토한다.
- SRT Whiteboard Animation은 MIT이지만 포함된 손 이미지 등 개별 에셋의 출처와 재배포 조건을 별도로 확인한 뒤 도입한다.
- 벤치마크 프로젝트의 프롬프트, 문서, 디자인 자산을 그대로 복사하지 않고 구조와 방법론을 중심으로 재설계한다.

## 9. 최종 판단

Design Studio의 핵심 경쟁력은 범용 벡터 편집기나 단일 영상 엔진을 만드는 데 있지 않다. 브랜드와 출처를 유지하면서 하나의 콘텐츠를 여러 시각 산출물로 변환하는 현재 능력을 제품화하는 데 있다.

따라서 가장 높은 투자 대비 효과를 기대할 수 있는 순서는 다음 세 가지다.

1. 프로젝트 매니페스트와 통합 CLI
2. 공통 매니페스트 아래의 산출물별 IR
3. 자동 품질 게이트와 출처 추적

이 세 가지가 갖춰지면 기존 기능을 거의 버리지 않고도 디자인 스튜디오을 전문 제작 스킬에서 지속적으로 사용할 수 있는 Design Studio 제품으로 전환할 수 있다.
