# HyperFrames 렌더링 백엔드 · 선정 기준 및 운영 매뉴얼

> 2026-07-17 실측 검증 통과 후 도입(툴체인/중국어 폰트/프록시 환경/마이그레이션/3D 5개 항목 모두 통과, 핵심 데이터 본문 내장).
> HyperFrames는 HeyGen에서 오픈소스로 공개한 HTML→비디오 프레임워크(Apache 2.0)입니다. 순수 HTML + 일시 정지된 GSAP timeline, 헤드리스 브라우저의 프레임별 seek를 통한 결정론적 렌더링을 지원합니다.

## 선정 기준(작업 시작 전 이 표를 먼저 확인하십시오)

| 시나리오 | 권장 렌더링 경로 |
|---|---|
| 신규 애니메이션 프로젝트(기본) | **HyperFrames**. 감사(Audit) 스위트 기본 제공, 3D/GSAP/Lottie/shader 전체 해제 |
| 3D / 파티클 / 물리적 관성 / shader 트랜지션이 필요한 경우 | HyperFrames(자체 개발 Stage에서 구현 불가) |
| 기존 Stage 데모 재사용/개편 | 간편 마이그레이션(어댑터 레시피 하단 참조, 개당 20-30분 소요). 수정 없이 재렌더링만 하는 경우 그대로 render-video-seek.js 사용 |
| 런타임 환경이 취약한 경우(npm 없음 / 의존성 설치 불가 / 사용자에게 단일 파일로 전달하여 더블 클릭 실행) | 자체 개발 Stage(assets/animations.jsx), 기존 프로세스 유지 |
| 인터랙티브 데모(사용자가 브라우저에서 직접 조작하며, 비디오를 내보내지 않음) | 자체 개발 Stage 또는 일반 HTML. HyperFrames는 렌더링 파이프라인이며 인터랙티브 프레임워크가 아님 |
| 내레이션이 포함된 긴 영상(Step 9.5, narration_stage 구동) | **자체 개발 narration 파이프라인**(voiceover-pipeline.md + render-narration.sh). 당분간 HyperFrames 미적용—이중 시간 소스/자막/TTS 타임라인이 자체 개발 Stage와 긴밀하게 결합됨. '애니메이션 기본 HyperFrames'와 두 항목이 동시에 해당될 경우 본 항목을 우선 적용 |
| 대량 파라미터화 비디오(개인화/템플릿 텍스트 교체) | Remotion(로드맵 방향 5 참조, 본 skill 메인 프로세스와 독립적) |

**디자인 언어는 언제나 최우선입니다**: 서사 구조, easing 시스템, SFX/BGM 듀얼 트랙 시스템은 기존과 동일하게 모두 적용되며(animation-best-practices.md / audio-design-rules.md), HyperFrames는 구현 및 렌더링 도구일 뿐입니다. GSAP 구현 레시피는 다음을 참조하십시오:`references/gsap-recipes.md`.

## 프로젝트 스캐폴딩

> ⚠️ 설치 주의사항:`hyperframes init`프로젝트 파일을 생성하는 것 외에도 **19개의 hyperframes skill을 설치합니다`~/.claude/skills/`**（렌더링 백엔드 합성 계약 문서, 실행 가능한 hook이 없는 순수 문서）. 신경 쓰인다면 먼저 실행하세요**`npx hyperframes docs`로컬 문서 목록을 확인한 후 init 여부를 결정하세요.```bash
npx -y hyperframes init 프로젝트명 --example blank   # 비대화식일 때는 반드시 --example 포함
cd 프로젝트명 && npm install
```
index.html / hyperframes.json / meta.json / package.json(CLI 버전 고정) + 프로젝트 수준의 CLAUDE.md를 생성합니다. init은 19개의 hyperframes skill을 다음에 설치합니다:`~/.claude/skills/`(로컬에 설치됨). 합성 구문 규약은 hyperframes-core skill의 SKILL.md를 읽습니다(init은 각 runtime의 skill 디렉토리에 설치되며, Claude Code 기본값은`~/.claude/skills/`; skill 메커니즘이 없는 runtime은 직접 읽음`npx hyperframes docs`로컬 문서 대체), 로컬 문서`npx hyperframes docs <topic>`(data-attributes / gsap / rendering / troubleshooting).

**버전 전략**: 프로젝트 package.json은 정확한 버전을 고정(pin)합니다(현재 실측된 버전은 0.7.61입니다). 업데이트가 매우 빠르며(300+ releases), 업그레이드 시 먼저`npx hyperframes@latest upgrade --project . --check`delta를 확인하고, 회귀 데모를 실행한 후 진행하세요.

## 합성 계약 요약 (전체 버전은 hyperframes-core 참조)

- 루트 컨테이너:`data-composition-id` + `data-start` + `data-duration` + `data-width/height`- 각 타이머 요소:`class="clip"` + `data-start` + `data-duration` + `data-track-index`- timeline은 반드시 paused 상태여야 하며 등록되어야 합니다:`window.__timelines["합성id"] = gsap.timeline({paused:true})`- 영상 소재용`muted`, 오디오 트랙 개별 `<audio>`요소
- **결정론적 로직만 허용**: 금`Date.now()` / `Math.random()`/ 런타임 네트워크 fetch; 랜덤 시드 함수 사용
- 폰트: Google Fonts는 컴파일러에 의해 자동으로 수집되어 결정론적 @font-face가 주입됩니다(캐시`~/.cache/hyperframes/fonts/`）；순수 시스템 글꼴(PingFang SC 등) 한 줄 추가 `@font-face { font-family:"PingFang SC"; src: local("PingFang SC"); }`lint 통과
- Three.js 진행`hf-seek`이벤트 어댑터(`~/.claude/skills/hyperframes-animation/adapters/three.md`), 루트 컨테이너는 명시적으로 `data-duration`## 기존 데모 마이그레이션 · 어댑터 레시피 (실측 개당 20-30분)

자체 개발 Stage/순수 render(t) 애니메이션은 다시 작성할 필요 없으며, 4단계로 진행됩니다:

1. **컨테이너**: 래핑`#root`합성 data 속성 포함; 전체`.stage`유일한 clip으로 처리하는 것이 가장 간편합니다(`class="stage clip"` + data-start/duration/track-index）；`.stage`fixed 중앙 정렬에서 absolute inset:0으로 변경, html/body를 1920×1080으로 고정
2. **자체 구동 삭제**: rAF tick 루프, fitStage/resize 리스너, replay 버튼,`__ready/__setTime/__seek`프로토콜 전체 삭제 (렌더러에 불필요)
3. **프록시 tween 연결** (핵심 12행):
   ```js
   const proxy = { t: 0 };
   const tl = gsap.timeline({ paused: true });
   tl.to(proxy, { t: DURATION, duration: DURATION, ease: "none",
     onUpdate: () => render(proxy.t) }, 0);
   window.__timelines = window.__timelines || {};
   window.__timelines["main"] = tl;
   render(0);   // 필수: timeline이 t=0에서 멈춰 있을 때 onUpdate가 트리거되지 않으므로, 이 문장을 추가하지 않으면 첫 프레임이 초기화되지 않을 수 있음
   ```
4. **transition 스캔**: 전체 검색`transition:`참고. CSS transition + class 전환은 wall-clock 시간을 따르므로 프레임별 seek 시 결과가 불확실합니다. 반드시 render(t) 내에서 t에 대한 순수 함수(lerp)로 변경해야 합니다.

## 검증 및 렌더링```bash
npm run check                        # lint+runtime+layout+motion+contrast 5개 항목 감사
npx hyperframes check --no-contrast  # 어두운 시네마틱 스타일 전용(아래 참조)
npx -y hyperframes@<pin버전> render --fps 60   # 최종 렌더; 기본 30fps
```
- **check 결과가 반드시 0 error여야 렌더링** (contrast 게이트 제외). lint는 letterSpacing 떨림, 폰트 누락, 비결정성 등 일련의 '경고 없는 시각적 버그'를 차단할 수 있습니다.
- **contrast 게이트 절충**: WCAG 4.5:1 기준으로 검사하므로 다크 시네마틱 스타일의 저대비 워터마크/장식 텍스트(16-40% 투명도)와 근본적으로 충돌하며, 요소별 면제 기능도 없습니다. 다크 cinematic 결과물 통일`--no-contrast`, 나머지 4개 항목은 여전히 0 error여야 합니다. 밝은 배경의 정보성 결과물은 건너뛰지 마세요. contrast 오류는 대개 실제 문제입니다.
- **2단계 렌더링**: 우선 기본 30fps로 빠르게 출력하고, 육안 및 프레임 캡처 검사를 통과한 후`--fps 60`최종 렌더링. 60fps 600 프레임 1080p 실측 약 20초
- 렌더링 결과물 측 검증(audio stream / 블랙 프레임 / 라우드니스 / 재생 시간) 사용`scripts/verify-video.sh`(verification.md 참조)

## 투명 채널 (overlay 디자인 자막/스티커 편집 트랙에 직접 중첩)`npx hyperframes render --format mov`ProRes 4444 출력(yuva444p12le, 알파 포함, 2026-07-17 실측 결과 배경색 중첩 시 소프트 쉐도우까지 정확하게 반투명 처리됨);`--format webm`마찬가지로 투명하며 부피가 작습니다;`--format png-sequence`AE/다빈치용 RGBA 프레임 시퀀스 출력. 합성 시 유의 사항: html/body 배경 설정`transparent`, 배경색을 깔지 않습니다. 장식 문자/코너 마크/lower-third와 같은 오버레이(overlay) 소재는 이제 편집 트랙에 바로 불러올 수 있어 크로마키 작업이 필요 없습니다. MOV는 파일 용량이 크므로(ProRes 무손실급, 4초당 15MB 수준) 편집 전달용으로 사용하고, 네트워크 전송용으로는 webm을 사용하세요.

## 오디오

HyperFrames 컴포지션 내에서`<audio>`요소는 타임라인에 직접 추가 가능(BGM/해설 영상 동시 렌더링). 현재 오디오 워크플로우는 유지됨: SFX/BGM 2트랙 체제는 audio-design-rules.md를 따르며, add-music.sh / mix-voiceover.sh를 이용한 후반 믹싱도 가능함. 어느 방식이 더 나을지는 실전에서 결정하며, 현재는 강제하지 않음. SFX 큐 포인트 작업에는`scripts/sfx-cues.sh <비디오> <cue시트.tsv> <출력>`(cue 시트 = 초 단위/sfx 경로/볼륨 dB 3개 열, B00 실전 사례, 시트 수정 후 재실행 시 10초 내 영상 출력).

## pitfalls 증분 (자체 개발 파이프라인 대비)

자체 개발 파이프라인의 pitfalls(animation-pitfalls.md §7/10/12/13 녹화 프로토콜 관련, §6 폰트 타이밍, §15/17 네트워크 관련)는 HyperFrames 백엔드에서 **적용되지 않음**: 녹화 프로토콜은 프레임워크 내부에서 처리되며, 폰트는 컴파일 단계에서 크롤링되고, CDN은 프록시 환경에서도 정상 작동함을 확인했습니다. 새로 추가된 이슈는 총 4가지로, animation-pitfalls.md §18-21에 기록되었습니다: CSS transition 비결정성, 프록시 tween 첫 프레임, contrast 게이트 충돌, fromTo immediateRender 팬텀 현상.