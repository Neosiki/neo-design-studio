---
name: shorts-studio
description: >-
  15~45초 세로(9:16) 쇼츠·릴스를 대본에서 한국어 음성, 자막, BGM 합성까지 만든다.
  매장 홍보 영상을 같은 형식으로 여러 편 일괄 제작할 때, 카라오케·팝·박스 한국어 자막이 필요할 때 사용한다.
  5분 이상 해설 영상, SRT를 따라 그리는 화이트보드 영상, 브랜드 필름에는 적용하지 않는다.
metadata:
  version: "2026.11.1"
  updated: "2026-11-23"
---

# NeoDesign 선택형 쇼츠 · 한국어 음성

세로 영상은 이 경로를 선택했을 때만 쓴다. 부모 스킬의 일반 영상 기본 엔진과 삼방향 선택 절차는 그대로 둔다.
규칙의 근거와 명령은 [쇼츠 레시피](references/shorts-9x16.md)에 있다. 아래 명령은 저장소 루트 기준이다.

## 경로와 범위

- 신규 쇼츠도 새로운 시각 디자인이다. 삼방향 초안은 「히어로 프레임 1장 + 자막 프리셋(karaoke·pop·box) + 팔레트 + 분위기 한 문장」으로 구성해 사용자가 고르게 한다. 이미 승인한 방향이 있으면 다시 묻지 않는다.
- 화면의 주인공은 실제 매장 사진·영상이다. 생성 이미지로 대체하지 않는다(부모 스킬 §1.a). 자산이 없으면 placeholder로 두고 보완을 요청한다.
- 유튜브 업로드·예약 발행은 이 스킬의 범위가 아니다. 영상 파일까지 만든다.

## 작업 순서

1. 대본을 쓴다. 한 문장은 한 장면이고 장면은 8개 이하다. 첫 장면은 3초 안에 핵심을 말하고, 마지막 장면은 행동 하나만 말한다. 가격·시간·수치는 대표가 확인한 자료에서만 가져오며 후기·평점은 지어내지 않는다. 형식은 `examples/shorts-sample.md`.
2. 리허설: `node skills/shorts-studio/scripts/shorts-pipeline.mjs --script shorts.md --out-dir _shorts --provider silent`. 네트워크를 쓰지 않는다. 훅 길이·장면 수·문장 수 경고를 먼저 해소한다.
3. 음성: `--provider edge --yes`. **대본 텍스트가 Microsoft Edge 읽어주기 서버로 전송되므로 사용자에게 먼저 알리고 승인을 받는다.** 비공식 클라이언트(edge-tts)라서 상업 납품·장기 운영은 공식 Azure Speech를 권한다. 음성은 끝까지 들어 본다.
4. 자막: `node skills/shorts-studio/scripts/subtitle-ass.mjs --timeline _shorts/timeline.json --out _shorts/subs.ass --preset karaoke|pop|box`. 단어 타이밍은 문장 경계 안에서 글자 수로 추정한 값(`words[].estimated`)이다. 카라오케가 어긋나면 pop이나 box로 바꾼다. 자막은 안전 영역(위 150·아래 420·오른쪽 140px) 안에 둔다.
5. 합성: `bash skills/shorts-studio/scripts/shorts-compose.sh --voiceover _shorts/voiceover.mp3 --ass _shorts/subs.ass --video bg.mp4 --bgm assets/bgm-educational.mp3 --out shorts.mp4`. 1080×1920·30fps·약 -14 LUFS(±2)이고 음성 구간에서 BGM이 낮아진다.
6. 일괄: `node skills/shorts-studio/scripts/shorts-batch.mjs --csv batch.csv --out-dir _batch`. 업종 프리셋은 `scripts/shorts-presets.json`(제작자 제안값)이고, 한 편이 실패해도 다음 편으로 넘어가며 `report.csv`를 남긴다.
7. 납품 전 `references/shorts-9x16.md` §9 점검표를 거친다. 첫 3초 프레임·자막 글자 깨짐·음성 전체 청취·수치 대조·BGM과 폰트 사용 권한을 확인한다.

## 환경

Node 18 이상, FFmpeg(libass 포함)이 필요하다. 한국어 음성은 `pip install edge-tts`. Windows는 `Malgun Gothic`이 기본으로 있고, 다른 폰트는 `--fontsdir`로 폴더를 준다. 상업 이용 가능한 폰트인지 확인한다.
