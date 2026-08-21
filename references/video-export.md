# Video Export: HTML 애니메이션을 MP4/GIF로 내보내기

애니메이션 HTML을 다 만들면 사용자는 「영상으로 뽑을 수 있나」를 자주 묻는다. 이 문서가 전체 흐름을 정리한다.

## 언제 내보내나

**내보낼 시점**:
- 애니메이션이 끝까지 돌고, 시각 검증까지 끝났을 때（Playwright 스크린샷으로 각 시점 상태가 맞는지 확인）
- 사용자가 브라우저에서 최소 한 번 보고 괜찮다고 했을 때
- 애니메이션 버그가 남은 단계에서는 내보내지 **않는다** —— 영상이 된 뒤에 고치면 더 비싸다

**사용자가 쓸 만한 트리거 표현**:
- 「영상으로 뽑을 수 있나」
- 「MP4로 변환」
- 「GIF로 만들어줘」
- 「60fps」

## 산출 규격

기본은 세 가지 포맷을 한 번에 주고 사용자가 고르게 한다:

| 포맷 | 규격 | 맞는 곳 | 대표 용량（30s） |
|---|---|---|---|
| MP4 25fps | 1920×1080 · H.264 · CRF 18 | 위챗 공식계정 임베드, 위챗 채널, YouTube | 1-2 MB |
| MP4 60fps | 1920×1080 · 기본은 프레임 복제（호환이 안정적）· H.264 · CRF 18. 고품질 보간이 필요하면 `--minterpolate`를 명시. Stage 시계를 쓰는 애니메이션은 render-video-seek.js로 진짜 60fps를 직접 녹화 | 고프레임 전시, Bilibili, 포트폴리오 | 1.5-3 MB |
| GIF | 960×540 · 15fps · palette 최적화 | Twitter/X, README, Slack 프리뷰 | 2-4 MB |

## 툴체인

`scripts/`에 스크립트 두 개가 있다:

### 1. `render-video.js` — HTML → MP4

25fps MP4 기본 버전을 녹화한다. 전역 playwright에 의존한다.

```bash
NODE_PATH=$(npm root -g) node /path/to/claude-design/scripts/render-video.js <html파일>
```

선택 인자:
- `--duration=30` 애니메이션 길이（초）
- `--width=1920 --height=1080` 해상도
- `--trim=2.2` 영상 앞에서 잘라낼 초 수（reload + 글꼴 로딩 시간을 없앤다）
- `--fontwait=1.5` 글꼴 로딩 대기 시간（초）. 글꼴이 많으면 올린다

출력: HTML과 같은 디렉터리에 같은 이름의 `.mp4`.

### 2. `add-music.sh` — MP4 + BGM → MP4

무음 MP4에 배경음악을 섞는다. 장면（mood）에 따라 내장 BGM 라이브러리에서 고르고, 직접 가져온 오디오도 쓸 수 있다. 길이를 자동으로 맞추고 페이드 인·아웃을 넣는다.

```bash
bash add-music.sh <input.mp4> [--mood=<name>] [--music=<path>] [--out=<path>]
```

**내장 BGM 라이브러리**（`assets/bgm-<mood>.mp3`）:

| `--mood=` | 스타일 | 맞는 장면 |
|-----------|------|---------|
| `tech`（기본） | Apple Silicon / 애플 발표회, 미니멀한 신스 + 피아노 | 제품 발표, AI 도구, Skill 홍보 |
| `ad` | upbeat 모던 일렉트로닉, build + drop 있음 | 소셜 미디어 광고, 제품 티저, 프로모션 |
| `educational` | 따뜻하고 밝은 톤, 가벼운 기타·전자 피아노, inviting | 교양, 튜토리얼 소개, 강의 예고 |
| `educational-alt` | 같은 계열 대안. 다른 곡으로 한번 | 위와 같음 |
| `tutorial` | lo-fi 앰비언트, 거의 존재감 없음 | 소프트웨어 시연, 코딩 튜토리얼, 긴 시연 |
| `tutorial-alt` | 같은 계열 대안 | 위와 같음 |

**동작**:
- 음악을 영상 길이에 맞춰 자른다
- 0.3s 페이드 인 + 1s 페이드 아웃（하드컷 방지）
- 영상 스트림은 `-c:v copy`로 재인코딩하지 않고, 오디오는 AAC 192k
- `--music=<path>`가 `--mood`보다 우선한다. 외부 오디오를 바로 지정할 수 있다
- mood 이름을 틀리면 쓸 수 있는 옵션을 전부 나열한다. 조용히 실패하지 않는다

**전형적인 파이프라인**（애니메이션 내보내기 3종 + 음악）:
```bash
node render-video.js animation.html                        # 화면 녹화
bash convert-formats.sh animation.mp4                      # 60fps + GIF 파생
bash add-music.sh animation-60fps.mp4                      # 기본 tech BGM 추가
# 또는 장면에 맞춰:
bash add-music.sh tutorial-demo.mp4 --mood=tutorial
bash add-music.sh product-promo.mp4 --mood=ad --out=promo-final.mp4
```

### 3. `convert-formats.sh` — MP4 → 60fps MP4 + GIF

이미 있는 MP4에서 60fps 버전과 GIF를 만든다.

```bash
bash /path/to/claude-design/scripts/convert-formats.sh <input.mp4> [gif_width] [--minterpolate]
```

출력（입력과 같은 디렉터리）:
- `<name>-60fps.mp4` — 기본은 `fps=60` 프레임 복제（호환 범위가 넓다）. `--minterpolate`를 붙이면 고품질 프레임 보간
- `<name>.gif` — palette를 최적화한 GIF（기본 960 너비, 변경 가능）

**60fps 모드 선택**:

| 모드 | 명령 | 호환성 | 쓰는 곳 |
|---|---|---|---|
| 프레임 복제（기본）| `convert-formats.sh in.mp4` | QuickTime/Safari/Chrome/VLC 전부 통과 | 일반 납품, 플랫폼 업로드, 소셜 미디어 |
| minterpolate 보간 | `convert-formats.sh in.mp4 --minterpolate` | macOS QuickTime/Safari가 열지 못할 수 있음 | Bilibili처럼 진짜 보간이 필요한 전시용. **납품 전에 목표 플레이어에서 반드시 로컬 테스트** |

기본을 프레임 복제로 바꾼 이유: minterpolate가 내놓는 H.264 elementary stream에는 알려진 호환 버그가 있다 —— 예전에 minterpolate를 기본으로 두었을 때 「macOS QuickTime에서 열리지 않는」 문제를 여러 번 밟았다. 자세히는 `animation-pitfalls.md` §14.

`gif_width` 인자:
- 960（기본）—— 소셜 플랫폼 범용
- 1280 —— 더 선명하지만 파일이 커진다
- 600 —— Twitter/X에서 먼저 로드된다

### 4. `render-video-seek.js` — 진짜 60fps / 결정론적 렌더（고품질 납품에 권장）

`render-video.js`의 recordVideo 경로에는 고유한 한계가 셋 있다. 프레임레이트가 Chromium compositor에 25fps로 묶여 있고, 앞부분에 로딩 검은 프레임이 생겨 trim이 필요하고, 60fps는 사후 minterpolate 보간에만 의존해야 한다（ghosting + macOS QuickTime 호환 버그가 있다. `animation-pitfalls.md §14` 참고）. **진짜 60fps, 결정론적 출력, 또는 Bilibili·포트폴리오 납품**이 필요하면 seek 렌더로 바꾼다.

이 방식은 타임스탬프마다 seek해서 스크린샷을 찍고, ffmpeg로 PNG 시퀀스를 MP4로 인코딩한다. 기술 코어는 HeyGen HyperFrames（Apache 2.0）의 「시계 고정 + seek 스크린샷」 발상을 참고했지만 서드파티 패키지는 하나도 들이지 않는다 —— 이 skill에 이미 있는 playwright + ffmpeg만 쓰므로 runtime 중립이다.

```bash
NODE_PATH=$(npm root -g) node /path/to/claude-design/scripts/render-video-seek.js <html파일> --fps=60
```

인자: `--duration` · `--fps`（기본 60）· `--width` · `--height` · `--concurrency`（기본 worker 4개 병렬）· `--settle`（seek 후 rAF 몇 번을 기다린 뒤 찍을지, 기본 2. layout이 무거운 애니메이션은 올린다）· `--keep-chrome`. 출력은 HTML과 같은 디렉터리, 같은 이름의 `.mp4`.

recordVideo의 막힌 지점 셋을 정면으로 푼다:
- **진짜 네이티브 임의 프레임레이트**: `--fps=60`이면 진짜 60fps가 나온다（모든 프레임이 실제로 seek한 화면이다）. `convert-formats.sh`의 minterpolate 보간을 거치지 않으므로 ghosting + macOS 호환 버그를 우회한다
- **앞부분 검은 프레임 없음**: 화면을 녹화하지 않으니 로딩 구간 검은 프레임이 아예 없고, `--trim` / `--fontwait`도 필요 없다
- **결정론적**: 타임스탬프로 seek해서 찍기 때문에 같은 입력이면 같은 출력이고, 머신 부하나 프레임 드롭에 영향받지 않는다

**적용 경계（중요）**: Stage 시계를 쓰는 애니메이션만 지원한다 —— `assets/animations.jsx`의 `<Stage>` 또는 `narration_stage.jsx`의 `<NarrationStage>`. 이들은 `window.__seekRender`에 반응해 자체 구동 시계를 멈추고 `window.__seek(t)`를 노출한다. 순수 CSS `@keyframes` / Lottie / Stage를 쓰지 않고 손으로 짠 애니메이션은 `__seek`를 먹지 않으므로 계속 `render-video.js`를 쓴다（스크립트가 `__seek`를 찾지 못하면 오류를 내고 알려준다）.

**대가**: 프레임마다 찍기 때문에 긴 영상은 recordVideo 실시간 녹화보다 총 소요 시간이 길어질 수 있다（`--concurrency`로 worker를 늘려 완화한다）. 임시 PNG가 디스크를 많이 차지하므로 렌더 전에 메모리를 많이 쓰는 다른 App은 닫는 편이 좋다.

**둘 중 하나를 고르는 기준**: 기본은 여전히 `render-video.js`다（위험이 없고 모든 애니메이션 유형을 커버한다）. 진짜 60fps·결정론·고품질 납품이 필요하고 애니메이션이 Stage 시계를 쓴다면 `render-video-seek.js`. 내레이션이 있는 긴 애니메이션은 `render-narration.sh --seek` 한 줄로 seek 렌더 + 믹싱까지 간다.

## 전체 흐름（표준 권장）

사용자가 「영상으로 뽑아줘」라고 하면:

```bash
cd <프로젝트디렉터리>

# $SKILL이 이 skill의 루트를 가리킨다고 가정（설치 위치에 맞게 바꾼다）

# 1. 25fps 기본 MP4 녹화
NODE_PATH=$(npm root -g) node "$SKILL/scripts/render-video.js" my-animation.html

# 2. 60fps MP4와 GIF 파생
bash "$SKILL/scripts/convert-formats.sh" my-animation.mp4

# 산출 목록:
# my-animation.mp4         (25fps · 1-2 MB)
# my-animation-60fps.mp4   (60fps · 1.5-3 MB)
# my-animation.gif         (15fps · 2-4 MB)
```

## 기술 세부（트러블슈팅용）

### Playwright recordVideo의 함정

- 프레임레이트가 25fps로 고정이라 60fps를 바로 녹화할 수 없다（Chromium headless compositor의 상한）
- context를 만드는 순간부터 녹화가 시작되므로 `trim`으로 앞쪽 로딩 시간을 반드시 잘라야 한다
- 기본이 webm 포맷이라, 범용 재생을 위해서는 ffmpeg로 H.264 MP4로 바꿔야 한다

`render-video.js`는 위 문제들을 이미 처리한다.

### ffmpeg minterpolate 인자

현재 설정: `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`

- `mi_mode=mci` — motion compensation interpolation（움직임 보정）
- `mc_mode=aobmc` — adaptive overlapped block motion compensation
- `me_mode=bidir` — 양방향 움직임 추정
- `vsbmc=1` — 가변 size block motion compensation

CSS **transform 애니메이션**（translate/scale/rotate）에는 잘 듣는다.
**순수 fade**에는 약한 ghosting이 생길 수 있다 —— 사용자가 싫어하면 단순 프레임 복제로 내린다:

```bash
ffmpeg -i input.mp4 -r 60 -c:v libx264 ... output.mp4
```

### GIF palette를 왜 두 단계로 하나

GIF는 256색만 쓴다. 한 번 pass로 만든 GIF는 애니메이션 전체 색을 256색 범용 palette로 눌러버리기 때문에, 베이지 바탕 + 주황처럼 섬세한 배색은 뭉개진다.

두 단계:
1. `palettegen=stats_mode=diff` —— 먼저 전편을 훑어 **이 애니메이션에 맞는 optimal palette**를 만든다
2. `paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle` —— 그 palette로 인코딩한다. rectangle diff는 변한 영역만 갱신해서 파일을 크게 줄인다

fade 전환에는 `dither=bayer`가 `none`보다 매끄럽지만 파일이 조금 커진다.

## Pre-flight check（내보내기 전）

내보내기 전 30초 자체 점검:

- [ ] HTML을 브라우저에서 끝까지 한 번 돌렸고 콘솔 오류가 없다
- [ ] 애니메이션 0번째 프레임이 온전한 초기 상태다（로딩 중 빈 화면이 아니다）
- [ ] 애니메이션 마지막 프레임이 안정된 마무리 상태다（중간에 잘리지 않았다）
- [ ] 글꼴·이미지·emoji가 전부 정상 렌더된다（`animation-pitfalls.md` 참고）
- [ ] Duration 인자가 HTML의 실제 애니메이션 길이와 맞는다
- [ ] HTML의 Stage가 `window.__recording`을 감지해 loop=false를 강제한다（Stage를 직접 짰다면 반드시 확인. `assets/animations.jsx`를 쓰면 내장되어 있다）
- [ ] 마지막 Sprite의 `fadeOut={0}`（영상 마지막 프레임이 페이드아웃되지 않게）
- [ ] 「Created by 디자인 스튜디오」 워터마크 포함（애니메이션에만 필수. 서드파티 브랜드 작업물은 「비공식 제작 · 」 접두사를 붙인다. 자세히는 SKILL.md §「Skill 홍보 워터마크」）

## 납품할 때 함께 주는 설명

내보내기가 끝난 뒤 사용자에게 주는 표준 설명 형식:

```
**전체 납품물**

| 파일 | 포맷 | 규격 | 용량 |
|---|---|---|---|
| foo.mp4 | MP4 | 1920×1080 · 25fps · H.264 | X MB |
| foo-60fps.mp4 | MP4 | 1920×1080 · 60fps（기본 프레임 복제. 보간 버전이면 표기）· H.264 | X MB |
| foo.gif | GIF | 960×540 · 15fps · palette 최적화 | X MB |

**설명**
- 60fps는 기본이 프레임 복제입니다（호환성이 좋습니다）. 명시적으로 요청할 때만 minterpolate 보간을 씁니다（transform 애니메이션에는 잘 듣지만 복잡한 화면에서는 아티팩트가 생기기 쉽습니다）. 진짜 60fps는 render-video-seek.js로 프레임마다 seek해 직접 녹화합니다
- GIF는 palette를 최적화해서, 30s 애니메이션이면 3MB 정도까지 줄어듭니다

크기나 프레임레이트를 바꾸려면 말씀해 주세요.
```

## 사용자가 흔히 덧붙이는 요구

| 사용자 말 | 대응 |
|---|---|
| 「너무 크다」 | MP4: CRF를 23-28로 올린다. GIF: 해상도를 600으로 내리거나 fps를 10으로 |
| 「GIF가 뭉개진다」 | `gif_width`를 1280으로 올린다. 또는 MP4로 대체할 것을 권한다（위챗 모멘트도 지원한다） |
| 「9:16 세로로」 | HTML 원본의 `--width=1080 --height=1920`을 고치고 다시 녹화한다 |
| 「워터마크 넣어줘」 | ffmpeg에 `-vf "drawtext=..."` 또는 `overlay=`로 PNG 하나를 얹는다 |
| 「배경을 투명하게」 | MP4는 alpha를 지원하지 않는다. WebM VP9 + alpha 또는 APNG를 쓴다 |
| 「무손실로」 | CRF를 0으로 + preset veryslow（파일이 10배 커진다） |

## Skill 홍보 워터마크 템플릿（애니메이션 내보내기 전용）

SKILL.md는 애니메이션 MP4/GIF에 기본으로 워터마크를 넣도록 정한다. 템플릿은 아래와 같다（어두운 바탕에서는 `rgba(255,255,255,0.35)`로, 서드파티 브랜드 애니메이션에는 「비공식 제작 · 」 접두사）:

```jsx
<div style={{
  position: 'absolute', bottom: 24, right: 32,
  fontSize: 11, color: 'rgba(0,0,0,0.4)',
  letterSpacing: '0.15em', fontFamily: 'monospace',
  pointerEvents: 'none', zIndex: 100,
}}>
  Created by 디자인 스튜디오
</div>
```
