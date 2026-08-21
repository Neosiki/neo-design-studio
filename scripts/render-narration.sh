#!/usr/bin/env bash
# render-narration.sh · 원스톱: HTML 해설 애니메이션 → 최종 MP4(음성 포함)
#
# 파이프라인:
#   1. render-video.js  무성 MP4 녹화(timeline.totalDuration 기준)
#   2. mix-voiceover.sh voiceover.mp3 믹스(BGM은 선택)
#   3. <basename>-narrated.mp4 출력
#
# Usage:
#   bash render-narration.sh <html> --timeline=<path> [options]
#
# Required:
#   <html>                해설 애니메이션 HTML(NarrationStage + recording 모드 rAF 자체 구동을 내장해야 한다)
#   --timeline=<path>     timeline.json 경로(totalDuration과 voiceover.mp3 경로를 알아서 읽는다)
#
# Optional:
#   --bgm-mood=<name>     BGM 프리셋(educational / tech / tutorial / ...)
#   --bgm=<path>          직접 지정한 BGM 파일
#   --bgm-volume=<0-1>    BGM 고정 볼륨, 기본 0.18
#   --no-ducking          sidechain ducking 끄기
#   --keep-silent         중간 산출물(무성 MP4)을 남긴다. debug에 쓴다
#   --seek                render-video-seek.js로 프레임 단위 seek 렌더(진짜 60fps · 결정적 · 검은 프레임 없음)
#   --seek-fps=<n>        seek 렌더 프레임레이트, 기본 60. --seek과 함께 쓴다
#   --out=<path>          출력 경로, 기본 <html-basename>-narrated.mp4
#   --width=<px>          영상 너비(기본 1920)
#   --height=<px>         영상 높이(기본 1080)
#
# Examples:
#   bash render-narration.sh demo.html --timeline=_narration/timeline.json
#   bash render-narration.sh demo.html --timeline=_narration/timeline.json --bgm-mood=educational
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$SCRIPT_DIR/.."

HTML=""
TIMELINE=""
BGM_MOOD=""
BGM=""
BGM_VOLUME="0.18"
NO_DUCKING=""
KEEP_SILENT=""
USE_SEEK=""
SEEK_FPS="60"
OUT=""
WIDTH="1920"
HEIGHT="1080"

for arg in "$@"; do
  case "$arg" in
    --timeline=*)    TIMELINE="${arg#*=}" ;;
    --bgm-mood=*)    BGM_MOOD="${arg#*=}" ;;
    --bgm=*)         BGM="${arg#*=}" ;;
    --bgm-volume=*)  BGM_VOLUME="${arg#*=}" ;;
    --no-ducking)    NO_DUCKING="--no-ducking" ;;
    --keep-silent)   KEEP_SILENT="1" ;;
    --seek)          USE_SEEK="1" ;;
    --seek-fps=*)    SEEK_FPS="${arg#*=}" ;;
    --out=*)         OUT="${arg#*=}" ;;
    --width=*)       WIDTH="${arg#*=}" ;;
    --height=*)      HEIGHT="${arg#*=}" ;;
    -*)              echo "알 수 없는 인자: $arg" >&2; exit 1 ;;
    *)               HTML="$arg" ;;
  esac
done

if [ -z "$HTML" ] || [ ! -f "$HTML" ]; then
  echo "Usage: bash render-narration.sh <html> --timeline=<path> [options]" >&2
  exit 1
fi
if [ -z "$TIMELINE" ] || [ ! -f "$TIMELINE" ]; then
  echo "✗ --timeline=<path>가 없다(timeline.json은 narrate-pipeline.mjs가 만든다)" >&2
  exit 1
fi

# ── timeline.json에서 totalDuration과 voiceover 경로를 읽는다 ──
TIMELINE_DIR="$(cd "$(dirname "$TIMELINE")" && pwd)"
TOTAL_DURATION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TIMELINE','utf8')).totalDuration)")
VOICEOVER_REL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TIMELINE','utf8')).voiceover || 'voiceover.mp3')")
VOICEOVER="$TIMELINE_DIR/$VOICEOVER_REL"

if [ ! -f "$VOICEOVER" ]; then
  echo "✗ voiceover.mp3가 없다: $VOICEOVER" >&2
  exit 1
fi

# 녹화 길이 = 전체 길이 + 1s 안전 여유
RECORD_DURATION=$(node -e "console.log(Math.ceil($TOTAL_DURATION + 1))")

HTML_ABS="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
HTML_DIR="$(dirname "$HTML_ABS")"
HTML_BASE="$(basename "$HTML" .html)"
SILENT_MP4="$HTML_DIR/$HTML_BASE.mp4"

if [ -z "$OUT" ]; then
  OUT="$HTML_DIR/$HTML_BASE-narrated.mp4"
fi

echo "═══ render-narration ═══════════════════"
echo "  HTML:        $HTML_ABS"
echo "  Timeline:    $TIMELINE"
echo "  Voiceover:   $VOICEOVER"
echo "  Total dur:   ${TOTAL_DURATION}s (녹화 ${RECORD_DURATION}s)"
echo "  크기:        ${WIDTH}×${HEIGHT}"
[ -n "$BGM_MOOD" ] && echo "  BGM mood:    $BGM_MOOD"
[ -n "$BGM" ] && echo "  BGM:         $BGM"
echo "  최종 출력:   $OUT"
echo "════════════════════════════════════════"

# ── Step 1: 무성 MP4 녹화 ──────────────────────
echo ""
if [ -n "$USE_SEEK" ]; then
  echo "▸ Step 1/2 · HTML 애니메이션을 프레임 단위 seek로 렌더 (무성 · ${SEEK_FPS}fps 결정적)"
  NODE_PATH=$(npm root -g) node "$SCRIPT_DIR/render-video-seek.js" "$HTML_ABS" \
    --duration="$RECORD_DURATION" \
    --fps="$SEEK_FPS" \
    --width="$WIDTH" \
    --height="$HEIGHT"
else
  echo "▸ Step 1/2 · HTML 애니메이션 녹화 (무성)"
  NODE_PATH=$(npm root -g) node "$SCRIPT_DIR/render-video.js" "$HTML_ABS" \
    --duration="$RECORD_DURATION" \
    --width="$WIDTH" \
    --height="$HEIGHT"
fi

if [ ! -f "$SILENT_MP4" ]; then
  echo "✗ 무성 MP4가 생성되지 않았다: $SILENT_MP4" >&2
  exit 1
fi

# ── Step 2: 음성 믹스 ──────────────────────
echo ""
echo "▸ Step 2/2 · 음성 믹스"
MIX_ARGS=("$SILENT_MP4" "--voiceover=$VOICEOVER" "--out=$OUT")
[ -n "$BGM_MOOD" ] && MIX_ARGS+=("--bgm-mood=$BGM_MOOD")
[ -n "$BGM" ]      && MIX_ARGS+=("--bgm=$BGM")
[ -n "$BGM_MOOD$BGM" ] && MIX_ARGS+=("--bgm-volume=$BGM_VOLUME")
[ -n "$NO_DUCKING" ] && MIX_ARGS+=("$NO_DUCKING")

bash "$SCRIPT_DIR/mix-voiceover.sh" "${MIX_ARGS[@]}"

# 중간 산출물 정리
if [ -z "$KEEP_SILENT" ]; then
  rm -f "$SILENT_MP4"
fi

echo ""
echo "✓ 완료: $OUT"
[ -n "$KEEP_SILENT" ] && echo "  (중간 산출물 남김: $SILENT_MP4)"
