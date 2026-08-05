#!/bin/bash
# 凍結 mock（design-reference/export/ 配下）への Edit/Write を deny する。PreToolUse:Edit|Write で発火
set -euo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT")
[[ -n $FILE ]] || exit 0

ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
case $FILE in
  "$ROOT"/design-reference/export/*)
    # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
    cat >&2 <<'MSG'
design-reference/export/ は凍結済み mock 資産のため、Edit/Write での直接編集を止めました
(hook 自身はファイルを変更しません)。変更は Claude Design 側で行い、再 export → /mock-freeze の
再凍結手順 (Bash での配置 + mock-baseline.sha256 更新) で反映すると、この gate には当たりません。
MSG
    exit 2
    ;;
esac
exit 0
