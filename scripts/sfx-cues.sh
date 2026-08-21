#!/bin/bash
# sfx-cues.sh — cue 표를 따라 무음 영상에 SFX 포인트를 찍는다(B00 계단함수(StepFun) b-roll 실전에서 정리, 2026-07-17)
#
# 사용법: bash sfx-cues.sh <무음영상.mp4> <cue표.tsv> <출력.mp4> [--dur=초]
#
# cue 표 형식(TSV, # 으로 시작하는 줄은 주석):
#   초<TAB>sfx 상대 경로(assets/sfx/ 기준)<TAB>볼륨dB
#   예: 63.0	impact/brand-stamp.mp3	-13
#
# 볼륨 기준(가벼운 SFX가 내레이션을 받치는 경우): whoosh류 -16 / tick류 -15 / impact류 -12. 순수 애니메이션 완성본은 전체를 +4dB 해도 된다
# cue 밀도는 audio-design-rules.md의 레시피 참고(b-roll 받침은 9초당 1개 정도, 구조적 노드에만 찍는다)

set -e
SFX_DIR="$(cd "$(dirname "$0")/../assets/sfx" && pwd)"
IN="${1:?사용법: bash sfx-cues.sh in.mp4 cues.tsv out.mp4 [--dur=210]}"
TABLE="${2:?cue 표가 없다}"
OUT="${3:?출력 경로가 없다}"
DUR=""
for a in "$@"; do case "$a" in --dur=*) DUR="${a#*=}";; esac; done
[ -z "$DUR" ] && DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN" | cut -d. -f1)

INPUTS=(-i "$IN")
FILTER=""; MIX=""; i=1
while IFS=$'\t' read -r t f db; do
  [ -z "$t" ] && continue
  case "$t" in \#*) continue;; esac
  [ ! -f "$SFX_DIR/$f" ] && { echo "✗ SFX 파일이 없다: $f"; exit 1; }
  INPUTS+=(-i "$SFX_DIR/$f")
  ms=$(python3 -c "print(int(float('$t')*1000))")
  FILTER+="[$i:a]adelay=${ms}:all=1,volume=${db}dB[s$i];"
  MIX+="[s$i]"
  i=$((i+1))
done < "$TABLE"
N=$((i-1))
[ "$N" = "0" ] && { echo "✗ cue 표가 비었다"; exit 1; }

ffmpeg -y -loglevel error "${INPUTS[@]}" \
  -filter_complex "${FILTER}${MIX}amix=inputs=${N}:normalize=0,apad=whole_dur=${DUR}[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT"

echo "✓ cue ${N}개 → $OUT"
