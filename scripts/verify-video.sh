#!/bin/bash
# verify-video.sh — 렌더링 산출물 측 강제 검사(PASS/FAIL, 에이전트 육안검사에 의존하지 않음)
#
# 검사항목: 해상도/fps, 재생시간 오차, audio stream 존재 여부, 시작/끝 블랙프레임, LUFS 음량, 파일 크기
# 합성 측 검사(lint/layout/motion/contrast)는 hyperframes check가 담당하며, 이 스크립트는 산출물만 검사한다.
#
# Usage:
#   bash verify-video.sh video.mp4 [--duration=10] [--fps=60] [--width=1920] [--height=1080]
#                        [--no-audio]        # 명확히 무음인 중간 산출물, audio+음량 검사 건너뜀
#                        [--allow-black-open] # 인트로에서 의도적으로 블랙오프닝인 경우 시작 블랙프레임 검사 건너뜀
#
# Exit code: 0 = 전부PASS；1 = FAIL 있음

set -u
FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: bash verify-video.sh video.mp4 [--duration=N] [--fps=N] [--width=N] [--height=N] [--no-audio] [--allow-black-open]"
  exit 1
fi
shift || true

EXP_DURATION=""; EXP_FPS=""; EXP_W=""; EXP_H=""; NO_AUDIO=0; ALLOW_BLACK_OPEN=0
for a in "$@"; do
  case "$a" in
    --duration=*) EXP_DURATION="${a#*=}" ;;
    --fps=*)      EXP_FPS="${a#*=}" ;;
    --width=*)    EXP_W="${a#*=}" ;;
    --height=*)   EXP_H="${a#*=}" ;;
    --no-audio)   NO_AUDIO=1 ;;
    --allow-black-open) ALLOW_BLACK_OPEN=1 ;;
  esac
done

FAILS=0
pass() { echo "  ✓ PASS  $1"; }
fail() { echo "  ✗ FAIL  $1"; FAILS=$((FAILS+1)); }
warn() { echo "  ⚠ WARN  $1"; }

echo "▸ verify-video: $FILE"

# ---------- 기본 스트림 정보 ----------
INFO=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -show_entries format=duration,size -of default=noprint_wrappers=1 "$FILE" 2>/dev/null)
W=$(echo "$INFO" | grep '^width=' | cut -d= -f2)
H=$(echo "$INFO" | grep '^height=' | cut -d= -f2)
FPS_RAW=$(echo "$INFO" | grep '^avg_frame_rate=' | cut -d= -f2)
DUR=$(echo "$INFO" | grep '^duration=' | cut -d= -f2)
SIZE=$(echo "$INFO" | grep '^size=' | cut -d= -f2)
FPS=$(python3 -c "print(round(eval('${FPS_RAW:-0}' if '${FPS_RAW:-0}'!='0/0' else '0'),2))" 2>/dev/null || echo "?")

[ -z "$W" ] && { fail "비디오 스트림을 읽을 수 없음(파일 손상 또는 비디오 파일 아님)"; echo "✗ 1건 FAIL"; exit 1; }
echo "  info: ${W}x${H} · ${FPS}fps · ${DUR%.*}s · $((SIZE/1024))KB"

# ---------- 해상도 / fps ----------
if [ -n "$EXP_W" ]; then
  [ "$W" = "$EXP_W" ] && [ "$H" = "$EXP_H" ] && pass "해상도 ${W}x${H}" || fail "해상도 ${W}x${H}，기대 ${EXP_W}x${EXP_H}"
fi
if [ -n "$EXP_FPS" ]; then
  python3 -c "exit(0 if abs($FPS-$EXP_FPS)<=0.5 else 1)" 2>/dev/null && pass "프레임률 ${FPS}fps" || fail "프레임률 ${FPS}fps，기대 ${EXP_FPS}fps"
fi

# ---------- 재생시간 오차（±2% 또는 ±0.2s 중 큰 쪽）----------
if [ -n "$EXP_DURATION" ]; then
  python3 -c "
d=float('$DUR'); e=float('$EXP_DURATION')
tol=max(e*0.02,0.2)
exit(0 if abs(d-e)<=tol else 1)" 2>/dev/null && pass "재생시간 ${DUR%.*}s（기대 ${EXP_DURATION}s）" || fail "재생시간 ${DUR}s，기대 ${EXP_DURATION}s（허용오차2%）"
fi

# ---------- audio stream ----------
HAS_AUDIO=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$FILE" 2>/dev/null | head -1)
if [ "$NO_AUDIO" = "1" ]; then
  [ -z "$HAS_AUDIO" ] && pass "오디오 트랙 없음(--no-audio 중간 산출물)" || warn "--no-audio를 선언했으나 오디오 트랙이 존재함"
else
  if [ -n "$HAS_AUDIO" ]; then
    pass "audio stream 존재"
    # ---------- LUFS 음량（완제품 참고 -14 LUFS ±4）----------
    LUFS=$(ffmpeg -i "$FILE" -af loudnorm=print_format=summary -f null - 2>&1 | grep 'Input Integrated' | grep -oE '\-?[0-9]+\.?[0-9]*')
    if [ -n "$LUFS" ]; then
      python3 -c "exit(0 if -18<=float('$LUFS')<=-10 else 1)" 2>/dev/null \
        && pass "음량 ${LUFS} LUFS（목표 구간 -18~-10）" \
        || warn "음량 ${LUFS} LUFS이 -14±4 구간에서 벗어남，믹스 게인 확인"
    fi
  else
    fail "audio stream 없음——스킬 철칙: 애니메이션 기본 납품 형태는 SFX+BGM 포함 MP4, 무음=반제품"
  fi
fi

# ---------- 시작/끝 블랙프레임 ----------
BLACK=$(ffmpeg -i "$FILE" -vf "blackdetect=d=0.1:pix_th=0.10" -an -f null - 2>&1 | grep -oE 'black_start:[0-9.]+ black_end:[0-9.]+' )
if [ -n "$BLACK" ]; then
  HEAD_BLACK=$(echo "$BLACK" | awk -F'[: ]' '$2<0.3{print}' | head -1)
  TOTAL=${DUR%.*}
  TAIL_BLACK=$(echo "$BLACK" | awk -F'[: ]' -v t="$TOTAL" '$4>t-0.3{print}' | head -1)
  if [ -n "$HEAD_BLACK" ] && [ "$ALLOW_BLACK_OPEN" = "0" ]; then
    fail "시작 블랙프레임($HEAD_BLACK)——녹화 시작점 오프셋의 전형적 증상; 의도적 블랙오프닝의 경우 --allow-black-open 사용"
  else
    [ -n "$HEAD_BLACK" ] && pass "시작 블랙프레임(--allow-black-open 선언됨)"
  fi
  [ -n "$TAIL_BLACK" ] && fail "종료 블랙프레임（$TAIL_BLACK)——루프 점프 또는 재생시간 과녹화의 전형적 증상"
  [ -z "$HEAD_BLACK" ] && [ -z "$TAIL_BLACK" ] && warn "영상 중 블랙프레임 구간 존재(의도적 전환이면 무시 가능):$(echo "$BLACK" | head -2 | tr '\n' ' ')"
else
  pass "블랙프레임 없음"
fi

# ---------- 요약 ----------
echo ""
if [ "$FAILS" = "0" ]; then
  echo "◇ verify-video: 모두 PASS"
  exit 0
else
  echo "✗ verify-video: ${FAILS}건 FAIL"
  exit 1
fi
