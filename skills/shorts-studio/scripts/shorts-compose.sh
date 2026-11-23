#!/usr/bin/env bash
# shorts-compose.sh · 호환용 얇은 래퍼. 실제 합성은 shorts-compose.mjs가 합니다(Windows PowerShell에서도 bash 없이 실행 가능).
# 사용법과 옵션은 shorts-compose.mjs 머리말을 보세요.
exec node "$(dirname "$0")/shorts-compose.mjs" "$@"
