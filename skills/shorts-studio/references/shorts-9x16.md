# Shorts 9:16 · 한국어 쇼츠 레시피

아래 명령은 **저장소 루트**에서 실행하는 기준입니다. 세로 영상(쇼츠·릴스·틱톡)을 만들 때 읽는 문서입니다. 대본 → 한국어 음성 → 장면 → 자막 → BGM → 합성까지의 규칙과 명령을 한곳에 둡니다.
디자인 판단(장면 구도, 카메라, 스토리보드)은 기존 문서를 그대로 따르고, 이 문서는 **쇼츠에서 달라지는 규칙**만 다룹니다.

## 언제 쓰나 / 쓰지 않나

- 쓴다: 15~45초 세로 홍보 영상, 매장 소개·메뉴·이벤트 쇼츠, 같은 형식의 영상을 여러 매장에 일괄 제작
- 쓰지 않는다: 5분 이상 해설 영상(→ 저장소 루트 `references/voiceover-pipeline.md`), 화이트보드 강의 영상(→ `skills/whiteboard-video/SKILL.md`), 30초급 브랜드 필름(→ 저장소 루트 `references/launch-film-director-notes.md`)
- 범위 밖: 유튜브 업로드·예약 발행·계정 인증. 이 스킬은 **영상 파일까지** 만듭니다.

## 1. 규격 (제작자 기준값)

| 항목 | 값 | 비고 |
|---|---|---|
| 해상도·프레임 | 1080×1920 · 30fps · H.264 · AAC | 플랫폼 정책은 바뀌므로 업로드 전 해당 플랫폼 안내를 한 번 확인 |
| 길이 | 15~45초 권장 | 장면 8개 이하 |
| 안전 영역 | 위 150px · 아래 420px · 오른쪽 140px 비움 | 플랫폼 UI가 덮는 구간. 제작자가 잡은 보수적 값이며 기기마다 다름 |
| 음량 | 약 -14 LUFS | 합성 스크립트가 단일 패스로 맞춤(±2 오차) |

안전 영역 안쪽에 **자막·가격·연락처·로고**를 둡니다. 배경 사진·영상은 전체 화면을 써도 됩니다.

## 2. 대본 규칙

1. **첫 3초에 훅.** 첫 장면(hook)은 약 3초 이내, 글자 수로 15자 안팎. 인사말·매장 소개로 시작하지 않습니다.
2. **한 문장 = 한 장면.** 장면 하나는 45자 이하, 문장 하나. 장면이 8개를 넘으면 줄입니다.
3. **마지막 장면은 행동 하나.** 예약, 방문, 저장 중 하나만 말합니다.
4. **사실 값은 근거 문서에서만.** 가격·영업시간·수상·후기 수치는 대표님이 확인한 자료(근거표)에서 가져오고, 없으면 쓰지 않습니다. 후기·평점을 지어내지 않습니다.
5. **강조는 장면당 1~2개 낱말**을 `**낱말**`로 감쌉니다. 음성에는 영향이 없고 자막 색만 바뀝니다.
6. 숫자·영문·약어는 TTS가 어색하게 읽을 수 있습니다. 음성을 들어 보고, 어색하면 대본에서 읽는 대로 풀어 씁니다(자막은 별도로 둘 수 있음).

대본 파일 형식은 `../examples/shorts-sample.md`입니다. 제목 `## id` 아래에 한 문장씩 씁니다.

## 3. 장면 설계 (기존 규칙 연결)

- 각 컷은 저장소 루트 `references/storyboard-basics.md`의 **표지 테스트(S1)**: 정지 프레임 한 장만 봐도 무슨 컷인지 읽혀야 합니다.
- 컷 길이는 보통 1.5~3.5초. 컷마다 **움직임이 있어야** 합니다(루트 `references/voiceover-pipeline.md` 철칙 3).
- 화면의 주인공은 **실제 매장 사진·영상**입니다. 생성 이미지로 대체하지 않습니다(§1.a 자산 프로토콜, AI slop 규칙 유지). 자산이 없으면 정직하게 placeholder를 두고 보완을 요청합니다.
- 세로 화면에서는 가로형 3D 틸트(루트 `references/apple-gallery-showcase.md`)를 쓰지 않습니다.

## 4. 한국어 음성

| provider | 비용·키 | 네트워크 | 단어 타이밍 | 용도 |
|---|---|---|---|---|
| `silent` | 없음 | 없음 | 글자 수 추정 | 리허설(대본 길이·자막 위치 확인) |
| `edge` | 무료·키 없음 | Microsoft 읽어주기 서버 | 문장 경계 + 글자 수 추정 | 기본 한국어 음성. 비공식 클라이언트라 상업 납품·장기 운영에는 공식 Azure Speech 권장 |
| `doubao` (기존) | 키 필요 | ByteDance | 중국어·영어만 실측 | 한국어에는 권하지 않음 |

- 승인 게이트: `edge`는 텍스트를 외부 서버로 보내므로 `--yes` 또는 `DESIGN_CLOUD_OK=1`이 있어야 실행됩니다. 처음 쓸 때 사용자에게 한 번 알립니다.
- 음색: `ko-KR-SunHiNeural`(여), `ko-KR-InJoonNeural`(남). 목록은 `python -m edge_tts --list-voices`로 확인합니다.
- **단어 타이밍은 추정값**입니다(`timeline.json`의 `words[].estimated`). 카라오케 색이 실제 발음보다 조금 앞서거나 늦을 수 있으니 음성을 들으며 한 번 확인하고, 어긋나면 `--preset pop`처럼 낱말 단위 동기가 덜 필요한 프리셋을 씁니다.

## 5. 자막 프리셋

| 프리셋 | 모양 | 어울리는 곳 |
|---|---|---|
| `karaoke` | 읽히는 순서대로 낱말 색이 채워짐 | 정보 전달, 설명이 긴 영상 |
| `pop` | 쪽마다 살짝 커지며 등장 | 음식·소매·이벤트처럼 속도감이 필요한 영상 |
| `box` | 반투명 검은 박스 위 흰 글씨 | 배경이 복잡한 사진·영상(가독성 우선) |

- 한 줄 11자 이하, 한 쪽 2줄(마지막 쪽이 짧으면 3줄까지). 낱말은 중간에서 자르지 않습니다.
- 강조색은 장면당 1~2개 낱말에만. 배경과 대비가 낮으면 `box`로 바꿉니다.
- 폰트: Windows는 `Malgun Gothic`이 기본으로 있습니다. 다른 폰트(Pretendard, 나눔스퀘어 등)를 쓰면 `--fontsdir`로 폴더를 주고, **상업 이용 가능 라이선스인지 확인**합니다.
- 상단 제목 띠는 `--title`로 넣습니다(안전 영역 안쪽).

## 6. BGM

`assets/bgm-*.mp3` 6곡을 씁니다(루트 `references/audio-design-rules.md`의 배합표 참고). 음성이 나올 때 BGM이 자동으로 낮아집니다(sidechain ducking). 외부 음원을 쓰면 저작권·상업 이용 여부를 확인합니다.

## 7. 명령 순서

```bash
# 1) 리허설 — 네트워크 없음, 무음 오디오. 길이·훅·자막 위치만 확인
node skills/shorts-studio/scripts/shorts-pipeline.mjs --script shorts.md --out-dir _shorts --provider silent

# 2) 한국어 음성 — 사용자 승인 후 --yes
node skills/shorts-studio/scripts/shorts-pipeline.mjs --script shorts.md --out-dir _shorts --provider edge --yes

# 3) 자막(ASS)
node skills/shorts-studio/scripts/subtitle-ass.mjs --timeline _shorts/timeline.json --out _shorts/subs.ass --preset karaoke --font "Malgun Gothic" --title "매장 이름"

# 4) 합성 — 배경 영상/이미지, 음성, BGM, 자막 번인
bash skills/shorts-studio/scripts/shorts-compose.sh --voiceover _shorts/voiceover.mp3 --ass _shorts/subs.ass --video bg.mp4 \
     --bgm assets/bgm-educational.mp3 --out shorts.mp4
```

파이프라인은 규칙을 어기면 경고를 냅니다(장면 8개 초과, 훅 3초 초과, 한 장면 45자 초과, 한 장면에 문장 둘 이상).

## 8. 업종별 프리셋과 일괄 제작

`../scripts/shorts-presets.json`에 음식점·사진관·골프레저·소매·교육 5종의 음색·속도·자막·강조색·BGM 묶음이 있습니다. **제작자 제안값이며 실제 영상으로 시험하며 조정**합니다.

여러 매장을 같은 형식으로 만들 때는 CSV를 씁니다(`../examples/batch-sample.csv`).

```bash
node skills/shorts-studio/scripts/shorts-batch.mjs --csv batch.csv --out-dir _batch --provider edge --yes
```

한 편이 실패해도 다음 편으로 넘어가고 `report.csv`에 성공·경고·실패를 남깁니다. 병렬 실행은 하지 않습니다.

## 9. 납품 전 점검

- [ ] 첫 3초 프레임 한 장을 봤을 때 무엇을 파는지 읽힌다
- [ ] 자막이 안전 영역 안에 있고 글자가 깨지지 않는다(폰트 폴백 확인)
- [ ] 음성을 끝까지 들었다(숫자·상호 발음, 카라오케 어긋남)
- [ ] 가격·시간·수치가 근거 자료와 일치한다
- [ ] BGM·폰트·사진의 사용 권한을 확인했다
- [ ] `ffprobe`로 1080×1920 · 30fps · 길이를 확인했다
