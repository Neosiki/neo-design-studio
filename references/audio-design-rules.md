# 오디오 설계 규칙 · design-studio

> 모든 애니메이션 demo의 오디오 적용 배합표. `sfx-library.md`(자산 목록)와 함께 쓴다.
> 실전 담금질: design-studio 발표 hero v1-v9 반복 · Anthropic 공식 영상 3편의 Gemini 심층 해부 · 8000회 이상 A/B 비교

---

## 핵심 원칙 · 오디오 이원 체계 (철칙)

애니메이션 오디오는 **반드시 두 층으로 독립 설계해야 한다.** 한 층만 만들면 안 된다.

| 층 | 역할 | 시간 척도 | 시각과의 관계 | 점유 주파수대 |
|---|---|---|---|---|
| **SFX(박자 층)** | 시각 beat 하나하나를 표시 | 0.2-2초의 짧은 소리 | **강한 동기**(프레임 단위 정렬) | **고역 800Hz+** |
| **BGM(분위기 바닥)** | 감정 깔기, 음장 | 연속 20-60초 | 약한 동기(단락 단위) | **중저역 <4kHz** |

**BGM만 있는 애니메이션은 불완전하다** — 관객은 무의식적으로 「그림은 움직이는데 소리가 반응하지 않는다」를 감지한다. 싸구려 느낌의 근원이 바로 여기다.

---

## 금 기준 · 황금 배합비

아래 수치들은 Anthropic 공식 영상 3편과 우리 v9 확정판을 실측 비교해 얻은 **엔지니어링 하드 파라미터**다. 그대로 가져다 쓰면 된다.

### 음량
- **BGM 음량**: `0.40-0.50`(만눈금 1.0 기준)
- **SFX 음량**: `1.00`
- **음량 차**: BGM이 SFX peak보다 **-6 ~ -8 dB 낮게**(SFX의 절대 음량으로 튀게 하는 게 아니라 음량 차로 한다)
- **amix 파라미터**: `normalize=0`(normalize=1은 절대 쓰지 않는다. 동적 범위를 납작하게 눌러버린다)

### 주파수대 분리 (P1 하드 최적화)
Anthropic의 비결은 「SFX 음량이 크다」가 아니라 **주파수대 계층화**다.

```bash
[bgm_raw]lowpass=f=4000[bgm]      # BGM을 <4kHz 중저역으로 제한
[sfx_raw]highpass=f=800[sfx]      # SFX를 800Hz+ 중고역으로 밀어 올린다
[bgm][sfx]amix=inputs=2:duration=first:normalize=0[a]
```

왜인가: 사람 귀는 2-5kHz 구간에 가장 민감하다(이른바 「presence 주파수대」). SFX가 다 이 구간에 있고 BGM이 전 주파수대를 덮으면 **SFX가 BGM의 고역 성분에 가려진다.** highpass로 SFX를 밀어 올리고 lowpass로 BGM을 눌러 두면 둘이 스펙트럼에서 각각 한쪽을 차지하고, SFX 선명도가 곧바로 한 단계 올라간다.

### Fade
- BGM 진입: `afade=in:st=0:d=0.3`(0.3s, 하드 컷을 피한다)
- BGM 퇴장: `afade=out:st=N-1.5:d=1.5`(1.5s 긴 꼬리, 수습되는 느낌)
- SFX는 envelope를 자체적으로 갖고 있으니 별도 fade가 필요 없다

---

## SFX cue 설계 규칙

### 밀도 (10초에 SFX 몇 개)
Anthropic 영상 3편의 SFX 밀도를 실측하니 세 단계였다.

| 영상 | 10s당 SFX 수 | 제품 성격 | 장면 |
|---|---|---|---|
| Artifacts(ref-1) | **~9개/10s** | 기능 밀집, 정보 많음 | 복잡한 도구 시연 |
| Code Desktop(ref-2) | **0개** | 순수 분위기, 명상적 | 개발 도구 집중 상태 |
| Word(ref-3) | **~4개/10s** | 균형, 오피스 리듬 | 생산성 도구 |

**휴리스틱**:
- 제품 성격이 차분/집중 → SFX 밀도 낮게(0-3개/10s), BGM 중심
- 제품 성격이 활발/정보 많음 → SFX 밀도 높게(6-9개/10s), SFX가 리듬을 구동
- **시각 beat를 다 채우지 말 것** — 여백이 밀집보다 고급스럽다. **cue의 30-50%를 지우면 남은 것이 더 극적이 된다.**

### Cue 선택 우선순위
모든 시각 beat에 SFX를 붙일 필요는 없다. 이 우선순위로 고른다.

**P0 필수**(빠지면 위화감이 생긴다):
- 타이핑(터미널/입력)
- 클릭/선택(사용자 결정의 순간)
- 초점 전환(시각 주인공의 이동)
- Logo reveal(브랜드 수습)

**P1 권장**:
- 요소 등장/퇴장(modal / card)
- 완료/성공 피드백
- AI 생성 시작/종료
- 큰 전환(scene 전환)

**P2 선택**(많아지면 어지럽다):
- hover / focus-in
- 진행 tick
- 장식적 ambient

### 타임스탬프 정렬 정밀도
- **같은 프레임 정렬**(0ms 오차): 클릭/초점 전환/Logo 착지
- **1-2 프레임 앞으로**(-33ms): 빠른 whoosh(관객에게 심리적 예고를 준다)
- **1-2 프레임 뒤로**(+33ms): 물체 착지/impact(실제 물리에 맞는다)

---

## BGM 선택 결정 트리

design-studio skill에는 BGM 6곡이 들어 있다(`assets/bgm-*.mp3`).

```
애니메이션의 성격은 무엇인가?
├─ 제품 발표 / 기술 시연 → bgm-tech.mp3(minimal synth + piano)
├─ 튜토리얼 설명 / 도구 사용 → bgm-tutorial.mp3(warm, instructional)
├─ 교육 학습 / 원리 설명 → bgm-educational.mp3(curious, thoughtful)
├─ 마케팅 광고 / 브랜드 홍보 → bgm-ad.mp3(upbeat, promotional)
└─ 같은 계열에서 변주가 필요 → bgm-*-alt.mp3(각각의 대체판)
```

### BGM이 없는 장면 (고려할 가치가 있다)
Anthropic Code Desktop(ref-2)을 보라: **SFX 0개 + 순수 Lo-fi BGM**만으로도 충분히 고급스럽다.

**언제 BGM 없이 가나**:
- 애니메이션 길이가 10s 미만(BGM이 세워지지 않는다)
- 제품 성격이 「집중/명상」이다
- 장면 자체에 환경음이나 설명 음성이 있다
- SFX 밀도가 매우 높다(청각 과부하를 피한다)

---

## 장면별 배합표 (바로 쓸 수 있다)

### 배합 A · 제품 발표 hero (design-studio v9와 동일)
```
길이: 25초
BGM: bgm-tech.mp3 · 45% · 주파수대 <4kHz
SFX 밀도: ~6개/10s

cue:
  터미널 타이핑 → type × 4(간격 0.6s)
  엔터          → enter
  카드 집결      → card × 4(0.2s 엇박)
  선택          → click
  Ripple        → whoosh
  초점 4회       → focus × 4
  Logo          → thud(1.5s)

음량: BGM 0.45 / SFX 1.0 · amix normalize=0
```

### 배합 B · 도구 기능 시연 (Anthropic Code Desktop 참조)
```
길이: 30-45초
BGM: bgm-tutorial.mp3 · 50%
SFX 밀도: 0-2개/10s(극히 적게)

전략: BGM + 설명 voiceover가 구동하게 하고, SFX는 **결정적 순간**에만(파일 저장/명령 실행 완료)
```

### 배합 C · AI 생성 시연
```
길이: 15-20초
BGM: bgm-tech.mp3 또는 BGM 없음
SFX 밀도: ~8개/10s(고밀도)

cue:
  사용자 입력 → type + enter
  AI 처리 시작 → magic/ai-process(1.2s 루프)
  생성 완료 → feedback/complete-done
  결과 제시 → magic/sparkle
  
포인트: ai-process는 2-3회 루프해서 생성 과정 전체를 관통할 수 있다
```

### 배합 D · 순수 분위기 롱테이크 (Artifacts 참조)
```
길이: 10-15초
BGM: 없음
SFX: 정성껏 설계한 cue 3-5개만 단독으로 사용

전략: SFX 하나하나가 주인공이고, BGM이 「뭉개는」 문제가 없다.
어울리는 곳: 단일 제품 슬로모션, 클로즈업 소개
```

---

## ffmpeg 합성 템플릿

### 템플릿 1 · SFX 하나를 영상에 얹기
```bash
ffmpeg -y -i video.mp4 -itsoffset 2.5 -i sfx.mp3 \
  -filter_complex "[0:a][1:a]amix=inputs=2:normalize=0[a]" \
  -map 0:v -map "[a]" output.mp4
```

### 템플릿 2 · 다중 SFX 타임라인 합성 (cue 시간에 맞춰 정렬)
```bash
ffmpeg -y \
  -i sfx-type.mp3 -i sfx-enter.mp3 -i sfx-click.mp3 -i sfx-thud.mp3 \
  -filter_complex "\
[0:a]adelay=1100|1100[a0];\
[1:a]adelay=3200|3200[a1];\
[2:a]adelay=7000|7000[a2];\
[3:a]adelay=21800|21800[a3];\
[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0[mixed]" \
  -map "[mixed]" -t 25 sfx-track.mp3
```
**핵심 파라미터**:
- `adelay=N|N`: 앞이 왼쪽 채널 지연(ms), 뒤가 오른쪽 채널. 두 번 써야 스테레오 정렬이 보장된다
- `normalize=0`: 동적 범위를 보존한다. 핵심!
- `-t 25`: 지정한 길이로 자른다

### 템플릿 3 · 영상 + SFX track + BGM (주파수대 분리 포함)
```bash
ffmpeg -y -i video.mp4 -i sfx-track.mp3 -i bgm.mp3 \
  -filter_complex "\
[2:a]atrim=0:25,afade=in:st=0:d=0.3,afade=out:st=23.5:d=1.5,\
     lowpass=f=4000,volume=0.45[bgm];\
[1:a]highpass=f=800,volume=1.0[sfx];\
[bgm][sfx]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k final.mp4
```

---

## 실패 모드 속견표

| 증상 | 근본 원인 | 수정 |
|---|---|---|
| SFX가 들리지 않는다 | BGM 고역 성분이 가린다 | BGM에 `lowpass=f=4000` + SFX에 `highpass=f=800` 추가 |
| 효과음이 너무 크고 귀에 거슬린다 | SFX 절대 음량이 너무 크다 | SFX 음량을 0.7로 내리고 BGM도 0.3으로 함께 내려 차이를 유지 |
| BGM과 SFX 리듬이 충돌한다 | BGM을 잘못 골랐다(강한 beat가 있는 music을 썼다) | ambient / minimal synth 계열 BGM으로 교체 |
| 애니메이션이 끝날 때 BGM이 갑자기 끊긴다 | fade out을 안 했다 | `afade=out:st=N-1.5:d=1.5` |
| SFX가 겹쳐 뭉개진다 | cue가 너무 촘촘하고 SFX 하나하나가 너무 길다 | SFX 길이를 0.5s 이내로 통제하고 cue 간격을 0.2s 이상으로 |
| 위챗 공식계정 mp4에 소리가 없다 | 위챗 공식계정이 auto-play를 mute할 때가 있다 | 걱정할 필요 없다. 사용자가 눌러서 열면 소리가 난다. gif는 애초에 소리가 없다 |

---

## 시각과의 연동 (고급)

### SFX 음색은 시각 스타일과 맞아야 한다
- 따뜻한 아이보리/종이 느낌의 시각 → SFX는 **목질/부드러운** 음색(Morse, paper snap, soft click)
- 차가운 검정 테크 시각 → SFX는 **금속/디지털** 음색(beep, pulse, glitch)
- 손그림/동화풍 시각 → SFX는 **카툰/과장된** 음색(boing, pop, zap)

현재 `apple-gallery-showcase.md`의 따뜻한 아이보리 바닥색 → `keyboard/type.mp3`(mechanical) + `container/card-snap.mp3`(soft) + `impact/logo-reveal-v2.mp3`(cinematic bass) 조합

### SFX가 시각 리듬을 이끌 수 있다
고급 기법: **SFX 타임라인을 먼저 설계하고, 그다음에 시각 애니메이션을 SFX에 맞춘다**(그 반대가 아니다).
SFX의 cue 하나하나가 「시계의 tick」이라서 시각 애니메이션을 SFX 리듬에 맞추면 대단히 안정적이다 — 반대로 SFX가 시각을 따라가면 ±1 프레임만 어긋나도 위화감이 생긴다.

---

## 품질 점검 체크리스트 (발표 전 자기점검)

- [ ] 음량 차: SFX peak - BGM peak = -6 ~ -8 dB인가?
- [ ] 주파수대: BGM lowpass 4kHz + SFX highpass 800Hz인가?
- [ ] amix normalize=0(동적 범위 보존)인가?
- [ ] BGM fade-in 0.3s + fade-out 1.5s인가?
- [ ] SFX 개수가 적절한가(장면 성격에 맞춰 밀도를 골랐는가)?
- [ ] SFX 하나하나가 시각 beat와 같은 프레임에 정렬됐는가(±1 프레임 이내)?
- [ ] Logo reveal 효과음 길이가 충분한가(1.5s 권장)?
- [ ] BGM을 끄고 한 번 들어보기: SFX만으로도 충분히 리듬감이 있는가?
- [ ] SFX를 끄고 한 번 들어보기: BGM만으로도 감정의 기복이 있는가?

두 층 중 어느 하나만 들어도 스스로 정합해야 한다. 두 층을 겹쳐야만 들을 만하다면 제대로 만들지 못한 것이다.

---

## 참고

- SFX 자산 목록: `sfx-library.md`
- 시각 스타일 참고: `apple-gallery-showcase.md`
- Anthropic 영상 3편 심층 오디오 분석: AUDIO-BEST-PRACTICES.md(저자 로컬 자료, 저장소에 함께 배포되지 않음)
- design-studio v9 실전 사례: hero-animation-v9-final.mp4(저자 로컬 샘플, 저장소에 함께 배포되지 않음)
