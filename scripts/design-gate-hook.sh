#!/bin/bash
# design-gate-hook.sh — PreToolUse(Bash) hook: 장편 렌더 전에 디자인 절차의 gate 파일을 확인한다
#
# 철칙의 배경(2026-07-17 Neo(Neo)가 세웠다): design-studio은 디자인에 들어가기 전에 반드시
# ① 자산 협약(brand-spec.md) ② 세 방향의 실제 비주얼을 사용자에게 고르게 하기
# (direction-approved.md에 선택 또는 면제 사유를 기록)를 거친다.
# B00(210s) 실측: 방향 확인을 건너뛰고 바로 전체를 렌더 → 전편 재작업. 이 hook은 그 교훈을
# 기계적 제약으로 옮긴 것이다:
# **길이가 45초 이상인 합성은 direction-approved.md가 없으면 렌더하지 못한다** — 장편 재작업의
# 대가가 잠깐 멈추는 것보다 훨씬 크다.
#
# 통과 조건(하나만 맞으면 된다):
#   - 합성 길이가 45s 미만이거나 판정할 수 없다(단편·실험은 마찰을 낮게 두고 SKILL.md의 gate 협약으로 제약한다)
#   - 프로젝트 디렉터리(또는 위로 두 단계)에 direction-approved.md가 있다
#   - 명령에 SKIP_DESIGN_GATE=1을 명시했다(Neo가 건너뛰겠다고 분명히 말할 때 쓰고, 감사할 수 있다)
#
# 보안 고지: 이 hook은 **skill이 자동으로 설치하지 않는다** — SKILL.md와 README에는 settings.json에
# 쓰라는 지시가 전혀 없고, 직접 settings.json에 넣어야만 동작한다. 행동의 상한: 조건에 맞는 장편
# 렌더 명령에 exit 2로 실행을 막고 이유를 출력하는 것까지다. 네트워크 요청도, 파일 쓰기도, 삭제도 없다.
# 저장소 루트의 SECURITY.md를 참고한다.
#
# settings.json 설정: PreToolUse / matcher "Bash" / command가 이 스크립트를 가리키게 한다

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)
CWD=$(printf '%s' "$INPUT" | python3 -c "import json,sys;print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

# 명령을 입에 올리는 명령(echo/grep 등)은 그냥 통과시킨다. 순수 텍스트가 잘못 걸리는 것을 막는다(QA Bug1)
FIRST=$(echo "$CMD" | sed -E 's/^[[:space:]]*//' | cut -d' ' -f1)
case "$FIRST" in echo|printf|grep|cat|ls|head|tail|wc|sed|awk) exit 0;; esac
# 렌더 명령만 본다(npm run render과 해설 장편 렌더를 포함한다)
echo "$CMD" | grep -qE "hyperframes(@[0-9.]+)? +render|render-video(-seek)?\.js|render-narration\.sh|npm +run +render\b" || exit 0
# 명시적으로 건너뛰기(감사할 수 있는 비상구)
echo "$CMD" | grep -q "SKIP_DESIGN_GATE=1" && exit 0

# 프로젝트 디렉터리 찾기: 명령 안에서 cd한 대상 > hook의 cwd
DIR="$CWD"
CDDIR=$(echo "$CMD" | grep -oE 'cd +"[^"]+"|cd +[^ &;]+' | head -1 | sed -E 's/^cd +//; s/"//g')
[ -n "$CDDIR" ] && [ -d "$CDDIR" ] && DIR="$CDDIR"

# 합성 길이 얻기: hyperframes 프로젝트는 index.html의 data-duration을 읽고, render-video-seek는 --duration 인자를 읽는다
DUR=""
D_ARG=$(echo "$CMD" | grep -oE '\-\-duration=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$D_ARG" ] && DUR="$D_ARG"
if [ -z "$DUR" ] && [ -f "$DIR/index.html" ]; then
  DUR=$(grep -oE 'data-duration="[0-9.]+"' "$DIR/index.html" | head -1 | grep -oE '[0-9.]+' | cut -d. -f1)
fi
# 길이를 판정할 수 없거나 단편이면 → 통과
[ -z "$DUR" ] && exit 0
[ "$DUR" -lt 45 ] 2>/dev/null && exit 0

# 장편: gate 파일을 찾는다(프로젝트 디렉터리와 위로 두 단계)
for d in "$DIR" "$DIR/.." "$DIR/../.."; do
  [ -f "$d/direction-approved.md" ] && exit 0
done

cat >&2 << EOF
🛑 디자인 절차 gate: 이 합성은 길이가 ${DUR}s(45s 이상 장편)인데 프로젝트 안에서 direction-approved.md를 찾지 못했습니다.
design-studio 철칙: 장편을 렌더하기 전에 「세 방향의 실제 비주얼을 사용자에게 고르게 하기」를 반드시 마쳐야 합니다(또는 사용자가 면제를 명시해야 합니다). 그리고 선택·면제 기록을 프로젝트 디렉터리의 direction-approved.md에 써야 합니다(어느 버전들을 보여줬는지, 스크린샷 경로, 사용자가 고른 원문 포함).
채워 넣은 뒤 다시 렌더하세요. 사용자가 직접 건너뛰겠다고 말했다면 명령 앞에 SKIP_DESIGN_GATE=1을 붙여 명시적으로 통과시키세요.
(근거: 2026-07-17 B00 실측. 방향 확인을 건너뛰고 210s 전편을 렌더 → 전편 비주얼 재작업)
EOF
exit 2
