# 다각도 병렬 실험 · Case Study

> Design-md-html v2.0 런칭 필름 프로젝트 · 2026-05-11
> 6인 아티스트 시점의 병렬 director's notes + HTML + 키프레임 실험

---

## 배경

사용자가 「Design-md-html v2.0을 위한 30초 업데이트 홍보 영상을 제작해 달라」고 요청했을 때, 메인 스레드는 먼저 v5 베이스라인(Anthropic / Penguin Classics 출판사 스타일)을 생성했습니다. 하지만 사용자는 더 나은 결과물이 가능하다고 판단하여 다음과 같은 critical instruction을 주었습니다.

> 「서로 다른 subagent를 호출하여 각각 6개의 완전히 다른 표현 방식과 시각적 디자인 버전을 생성하세요. 서로 다른 감독과 아티스트를 기용해 볼 수 있습니다. 모든 작업이 완료된 후, 최종적으로 평가 및 검토를 진행하세요.」

이것은 최초의 체계적인 「다각도 병렬 director's notes」 실험으로, 재사용 가능한 워크플로우를 검증했습니다.

---

## 6가지 시점의 선택 논리

디자이너 6명을 무작위로 선택해서는 안 됩니다. 유사성을 피하기 위해 **시각적 차별성이 매우 높아야** 합니다.

최종 선택된 6가지 시점(선택 이유 포함):

| 시점 | 장르 | 미학적 앵커 | 타 시점과의 차이점 |
|------|------|---------|----------------|
| **v5 베이스라인** | 현대 출판사 | Anthropic 테라코타 오렌지 + Penguin Classics 세리프 + Vignelli grid | 안전한 「취향」의 선택 |
| **v5a Wes Anderson** | 영화 챕터 미학 | The French Dispatch 잡지 감성 + 1960 Olivetti 산업 카탈로그 | 대칭 구도 + 챕터 카드 + 장식 테두리 |
| **v5b Saul Bass** | 60년대 영화 타이틀 아트 | cut-paper + Trajan caps + 유동적 기하학 | 종이 오리기 silhouette + 큰 글자 + 강한 대각선 |
| **v5c 왕가위** | 홍콩 뉴웨이브 | 《화양연화》《2046》 letterboxing + 중국어 세리프 | 슬로우 모션 + 안개 낀 듯한 글로우 + 중국어 위주 |
| **v5d Massimo Vignelli** | 1970 현대주의 | Knoll identity manual + NYC Subway map | 엄격한 grid + 3색 철칙 + 장식 배제 |
| **v5e Kenya Hara** | 미니멀리즘 일본 스타일 | MUJI 포스터 + 《백》 | 여백의 철학 + 무 chrome + ma(간)의 공간 | <!-- i18n:keep \u9593은 일본어 미학 용어 -->
| **v5f Yayoi Kusama** | 설치 미술 | Infinity Mirror Rooms + Polka Dot Obsession | obsessive 반복 + 단일 강렬한 색상 + 도트 |

**선택 원칙**:
1. **3가지 서로 다른 지리적 문화** (서구 영화 / 일본 디자인 / 홍콩식 중문)
2. **3가지 서로 다른 시대** (1960s / 1970s / 2010s+)
3. **3가지 서로 다른 매체** (영화 / 그래픽 디자인 / 설치 미술)
4. **각 시점은 「학습 데이터의 일반적인 SaaS 미학과 완전히 상반되는」 시각적 시그니처를 보유함**

---

## 실행 프로세스

### Step 1 · 각 시점별 독립 brief 작성 (약 15분)

각 brief는 8개의 고정 필드를 포함합니다.```
1. 프로젝트 배경（같은 문서）
2. 필독 참고（같은 문서 v5-director-notes.md를 방법론 템플릿으로 사용）
3. 당신이 해야 할 일（4개 납품 목록）
4. 해당 아티스트 DNA（핵심 필드 6개 항）：
   - 색상 팔레트（구체적인 HEX）
   - 글꼴（구체적인 이름 + 대체안）
   - 시각 언어（핵심 항목들）
   - 시그니처 요소（식별 가능한 시그니처）
   - 리듬（다른 관점과의 차별점）
   - 반 AI slop 강화판（해당 스타일 문맥에서의 금기 영역）
5. 30초 구조 참고（4-6개 shot 초안）
6. destination cards 디자인 요구（실제성 유지 및 가독성 보장）
7. 핵심 제약（30s / 1920×1080 / file:// / Google Fonts CDN）
8. 산출물 검증 체크리스트 + 완료 보고서 형식
```
**핵심**：각 브리프는 반드시 「**v5의 미학을 반복하지 말 것**」을 강조해야 합니다. 그렇지 않으면 subagent가 v5 director-notes의 영향을 받아 결과물이 유사해질 수 있습니다.

### Step 2 · 6개의 subagent 병렬 실행 (동일 메시지 내 6개의 Agent tool call)```js
Agent({ subagent_type: "general-purpose", run_in_background: true, name: "v5a-anderson", ... })
Agent({ subagent_type: "general-purpose", run_in_background: true, name: "v5b-bass", ... })
// ... 6 개
```
백그라운드에서 실행, 예상 소요 시간 30-60분.

### Step 3 · 대기 중 idle work

에이전트 상태를 폴링(polling)하지 마세요. subagent가 완료되면 자동으로 task-notification이 전송됩니다. 대기 기간 동안 다음 작업을 수행하세요:

- 메인 스레드의 v5 베이스라인 버그 수정
- 리뷰 프레임워크(review framework) 작성 (버전별 평가 차원 / Q&A)
- 방법론을 skill에 내재화 (이 케이스 스터디의 출처)
- final summary 문서 골격 준비

### Step 4 · 실패 처리 (약 16% 실패율, 수용 가능)

실전 관측: 6개의 subagent 중 약 1개는 네트워크 또는 토큰 초과로 인해 실패할 수 있습니다 (Bass 첫 라운드 socket error). 처리 방법:

1. completion notification 수신 시 해당 에이전트의 출력 폴더를 **즉시 확인**
2. 주요 결과물 누락 시 → 해당 에이전트 재시작 (동일한 brief 사용, "이전 실행 실패, 재실행 요청" 표시 가능)
3. 부분 완료 (예: HTML은 있으나 스크린샷이 없는 경우) → 메인 스레드에서 Playwright 스크린샷 보충, 에이전트 재시작 안 함

### Step 5 · 6개 버전 완료 후 시스템 검토

검토 프레임워크(5개 차원 + 3개 핵심 질문 + use case 할당):```
5 차원 평가(각 차원 1-10):
- Distinctiveness 시각적 차별성
- Coherence 미학적 일관성
- Anti-slop 반 AI slop 실행
- Story arc 리듬과 이야기 아크
- Pause-and-look 디테일 밀도

3개의 최상위 질문:
- Q1 스크린샷 공유?（소셜 플랫폼에서 멈춰서 보게 할 수 있는가）
- Q2 한 문장으로 요약할 수 있나?（명제급 기억으로 남을 수 있는가）
- Q3 시대를 초월하는가?（5년 후 다시 봐도 싼티가 나지 않는가）

use case 분배（플랫폼 및 대상별）：
- 공식 계정 / X / Bilibili / 위챗 모멘트 / Dribbble / 고객 시연 / 자사 채널 / ...
```
자세한 내용은  `assets/director-notes-samples/launch-film-30s-sample.md`동일 디렉토리의 REVIEW.md.

---

## 실험 결과 (Fact)

### 문서량

- v5 베이스라인 director-notes: 11,500자
- 6개 관점 director-notes 각 4,000~12,000자
- 총 문서량: 약 55,000~70,000자
- 5대 섹션 구조 완비: 6/6 버전

### HTML 구현

- 버전별 독립 animation.html, 30초, 1920×1080
- 파일 크기 28~74KB
- 전체 file:// 로 열기 가능 (서버 의존성 없음)

### 키프레임

- 버전별 10~18장의 PNG, 전체 30초 스토리 아크 커버
- 총 스크린샷 수: 80장 이상
- 평균 PNG 크기: 100~200KB

### 소요 시간

- 6개 subagent 병렬 실행: 약 12~15분 (duration_ms 표시 기준)
- 메인 스레드 병렬 idle work (v5 수정 + 방법론 작성): 동기 완료
- 전체 '6개 관점 시작부터 모든 deliverable 완료까지': 약 60분

---

## 핵심 인사이트 (design-studio의 미래 사용자를 위한 제언)

### 인사이트 1 · '만 자 분량의 director's notes 선작성' 방법론은 **완벽하게 재현 가능(reproducible)**함

6개의 subagent 모두 5대 섹션 구조에 따라 4,000~12,000자 분량의 전체 spec을 생성했으며, HTML 구현 시 marketing-ready 수준의 품질을 달성했습니다. 이는 방법론 자체가 개별 실행자의 재능에 의존하지 않음을 증명합니다. **즉, brief가 명확하다면 다수의 독립적인 실행자가 일관되게 높은 품질의 결과물을 낼 수 있습니다.**

### 인사이트 2 · '관점'은 반드시 '작품 + 연도' 수준으로 구체적이어야 함

각 brief에 구체적인 작품 대조군을 명시:
- Anderson → *The French Dispatch* (2021) + *Moonrise Kingdom* (2012) + Penguin Classics dust jackets + 1960s Olivetti catalogues
- WKW → *In the Mood for Love* (2000) + *2046* (2004)
- Vignelli → 1972 NYC Subway map + Knoll identity manual + *The Vignelli Canon*
- Hara → MUJI brand 1995-2023 + 《백》 + Junya Ishigami transparency
- Kusama → Infinity Mirrored Rooms (2013-2023) + Polka Dot Obsession 설치 미술

**실전 결과**: 모든 subagent가 해당 장르의 '평균값'이 아닌, 해당 작품의 핵심 visual DNA를 정확하게 포착했습니다.

### 인사이트 3 · AI slop(저품질 결과물) 방지를 위한 '스타일 강화 버전'이 핵심

범용 anti-slop(보라색 그라데이션 / 이모지 / SVG 캐릭터)은 모든 버전에 적용됩니다. 하지만 **각 스타일별로 '전용 anti-slop'을 작성해야 합니다.**

- Bass: Helvetica 사용 금지 (너무 깔끔함, Bass는 거친 느낌)
- Vignelli: 라운드 코너 사용 금지 (모든 corner는 90°)
- Hara: 모든 그라데이션 사용 금지 + sans display 사용 금지
- Kusama: 현대적인 SaaS look 사용 금지
- Anderson: 사이버틱한 배색 사용 금지
- WKW: Inter 사용 금지 (WKW는 세리프체 사용)

이러한 제약을 추가한 결과, 6개 버전의 스타일 순도가 매우 높아졌으며 서로 유사한 부분이 전혀 없었습니다.

### 인사이트 4 · 다중 관점의 진정한 가치는 '우승자 선정'이 아님

처음에는 A/B 테스트를 통해 최선의 버전을 선택하려 했습니다. 그러나 실제 검토 시 **6개 버전 각각이 명확한 use case를 가지고 있음**을 발견했습니다.
- v5 베이스라인 → 제품 페이지 / WeChat Reading (정보 밀도 높음)
- Anderson → 공식 계정 장문 헤더 이미지 (잡지를 넘기는 듯한 느낌)
- WKW → Bilibili / 중문 문화 콘텐츠 (향수 어린 온도감)
- Vignelli → 디자인 커뮤니티 / Dribbble (모든 프레임이 인쇄 포스터 수준)
- Hara → 클라이언트 프레젠테이션 / 정적 스크린샷 (미니멀리즘 철학)
- Kusama → X 숏폼 영상 / 바이럴 마케팅 (시각적 충격)

**결론**: 마케팅은 single-shot이 아니라 platform-specific multiplex입니다. 6개 관점 병렬 실행의 진정한 가치는 **한 프로젝트에 6개의 차별화된 무기를 갖게 하는 것**이지, 5개 버전을 버리는 것이 아닙니다.

### 인사이트 5 · subagent의 실패율 ~16%는 수용 가능한 수준임

6개 중 1개 실패 (Bass 첫 라운드 socket error). 처리 비용: 재시작 + 5분 분량의 간소화된 brief 작성 후 12~15분 대기. **1개의 에이전트가 순차적으로 6개 버전을 실행하는 것(90분 이상)과 비교했을 때**, 병렬 실행 + 재시도가 훨씬 경제적입니다.

### 인사이트 6 · 메인 스레드는 대기 시간 동안 실질적인 idle work를 수행해야 함

subagent 완료까지 12~15분이 소요됩니다. 이 시간 동안 메인 스레드는 절대 유휴 상태여서는 안 됩니다.

- **메인 버전 버그 수정** (이미 사용자로부터 피드백 받은 사항)
- **review framework 작성** (검토 시 작성할 내용)
- **방법론을 skill로 정립** (이 case study와 같이)
- **final summary 준비** (사용자가 돌아왔을 때 한눈에 파악 가능하도록)

이것이 parallel multi-agent workflow의 '메인 스레드 역할'입니다. 단순히 결과를 기다리는 PM이 아니라, 동기적으로 추진하는 orchestrator의 역할입니다.

---

## '다중 관점 병렬 실행' 활성화 시점

| 시나리오 | 활성화 여부 | 사유 |
|------|---------|------|
| 사용자가 명확하게 "다른 방향도 보고 싶다", "버전을 몇 개 더 만들어 달라"고 요청할 때 | ✅ 즉시 활성화 | 직접적인 요구 |
| 첫 번째 결과물에 만족하지 못하지만 구체적으로 무엇을 원하는지 모를 때 | ✅ 활성화 | "무엇을 원하는지 추측"하는 것보다 A/B 선택이 효율적임 |
| 프로젝트를 여러 플랫폼에 배포할 준비를 할 때 (X / 공식 계정 / Bilibili / 모멘트) | ✅ 활성화 | 플랫폼별로 하나의 버전 할당 |
| 클라이언트가 스타일을 확정하지 않았으나 예산(시간 + 토큰)이 있을 때 | ✅ 활성화 | 반복적인 수정 = 5배의 비용 발생 |
| 사용자가 이미 명확한 스타일 레퍼런스를 제공했고 버전이 하나만 필요할 때 | ❌ 비활성화 | 낭비 |
| 작업이 단순한 motion graphic / icon 애니메이션일 때 | ❌ 비활성화 | 과잉 엔지니어링 |
| 시간이 촉박할 때 < 30분 | ❌ 비활성화 | subagent 실행을 완료할 수 없음 |

---

## 전체 방법론 플로우차트```
사용자 brief（품질 기대치 포함）
       ↓
[메인 스레드] v5 베이스라인 director's notes 작성（만자급 5개 주요 부분）
       ↓
[메인 스레드] 구현 v5 HTML + 키 프레임 캡처（marketing baseline）
       ↓
[결정점] 다중 관점 활성화할까요?
       ↓ YES
[메인 스레드] 6개의 차별화된 관점을 선택 + 6개의 독립 브리프 작성（각 8개 필드）
       ↓
[6 subagents 병행]
   ├── v5a brief → director-notes + html + keyframes + README
   ├── v5b brief → ...
   ├── v5c brief → ...
   ├── v5d brief → ...
   ├── v5e brief → ...
   └── v5f brief → ...
       ↓
[메인 스레드 동기 작업] v5 버그 수정 · 리뷰 프레임워크 작성 · 방법론 정립
       ↓
[전체 6개 알림 도착]
       ↓
[메인 스레드] 실패 감지 + 재시도 / 스크린샷 보충
       ↓
[메인 스레드] 5개 차원 평가 + 3개 상위 질문 + use case 할당
       ↓
[메인 스레드] 작성 final REVIEW.md
       ↓
[납품] 6개의 완성본 + review + 플랫폼 분발 추천
```
---

## 관련 문서

- 전체 방법론:`references/launch-film-director-notes.md`- 단일 시점 샘플:`assets/director-notes-samples/launch-film-30s-sample.md`(v5 베이스라인)
- 실전 프로젝트 위치: 작성자 로컬 demos 디렉터리 (6 + 1 시점 전체 파일 세트 포함, 저장소와 함께 배포되지 않음)
- 검토 review: 작성자 로컬 REVIEW.md (저장소와 함께 배포되지 않음)

---

*Last updated: 2026-05-11*
*Real case study: Design-md-html v2.0 launch film 6-perspective parallel experiment*