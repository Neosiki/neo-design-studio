#!/usr/bin/env bash
# shorts-compose.sh · 9:16 쇼츠 최종 합성: 배경 영상(또는 단색) + 해설 음성 + BGM(음성 구간 자동 낮춤) + ASS 자막 번인
#
# 사용법:
#   bash skills/shorts-studio/scripts/shorts-compose.sh --voiceover _shorts/voiceover.mp3 --ass _shorts/karaoke.ass --out shorts.mp4 \
#        [--video bg.mp4 | --image bg.jpg] [--bgm assets/bgm-educational.mp3] [--fontsdir <폰트 폴더>] \
#        [--size 1080x1920] [--bgm-vol 0.35] [--lufs -14]
#
# 영상/이미지를 주지 않으면 짙은 녹색 단색 배경으로 만듭니다(자막·음성 리허설용).
# 영상은 화면을 꽉 채우도록 확대 후 중앙 크롭, 길이는 음성 길이에 맞춥니다(짧으면 반복).
# 출력 규격: H.264 yuv420p · AAC · 30fps · 목표 음량 -14 LUFS(단일 패스 loudnorm이라 ±2 정도 오차가 날 수 있음)
set -euo pipefail
VO=""; ASS=""; OUT=""; VIDEO=""; IMAGE=""; BGM=""; FONTSDIR=""; SIZE="1080x1920"; BGMVOL="0.35"; LUFS="-14"
while [ $# -gt 0 ]; do
  case "$1" in
    --voiceover) VO="$2"; shift 2;; --ass) ASS="$2"; shift 2;; --out) OUT="$2"; shift 2;;
    --video) VIDEO="$2"; shift 2;; --image) IMAGE="$2"; shift 2;; --bgm) BGM="$2"; shift 2;;
    --fontsdir) FONTSDIR="$2"; shift 2;; --size) SIZE="$2"; shift 2;; --bgm-vol) BGMVOL="$2"; shift 2;; --lufs) LUFS="$2"; shift 2;;
    *) echo "알 수 없는 옵션: $1" >&2; exit 1;;
  esac
done
[ -n "$VO" ] && [ -n "$OUT" ] || { sed -n 2,12p "$0"; exit 1; }
W="${SIZE%x*}"; H="${SIZE#*x}"
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VO")
FIT="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p"
SUB=""
if [ -n "$ASS" ]; then
  SUB=",ass='${ASS//\'/\\\'}'"
  [ -n "$FONTSDIR" ] && SUB="${SUB%\'}':fontsdir='${FONTSDIR//\'/\\\'}'"
fi
IN=(); VIN=0
if [ -n "$VIDEO" ]; then IN+=(-stream_loop -1 -i "$VIDEO"); elif [ -n "$IMAGE" ]; then IN+=(-loop 1 -i "$IMAGE"); else IN+=(-f lavfi -i "color=c=0x263a2e:s=${W}x${H}:r=30"); fi
IN+=(-i "$VO")
if [ -n "$BGM" ]; then
  IN+=(-stream_loop -1 -i "$BGM")
  AF="[1:a]asplit=2[vo][sc];[2:a]volume=${BGMVOL}[bg];[bg][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[vo][duck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=${LUFS}:TP=-1.5:LRA=11[a]"
else
  AF="[1:a]loudnorm=I=${LUFS}:TP=-1.5:LRA=11[a]"
fi
ffmpeg -y -loglevel error "${IN[@]}" -filter_complex "[0:v]${FIT}${SUB}[v];${AF}" -map "[v]" -map "[a]" \
  -t "$DUR" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT"
echo "완료: $OUT ($(printf '%.1f' "$DUR")초, ${SIZE})"
