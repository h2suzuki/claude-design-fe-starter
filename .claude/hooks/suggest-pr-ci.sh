#!/usr/bin/env bash
# SessionStart の payload が startup/resume のときだけ PR 提案を出す。
set -u

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
SOURCE=$(jq -r '.source // empty' <<<"$INPUT" 2>/dev/null || true)
case $SOURCE in
  startup|resume) ;;
  *) exit 0 ;;
esac
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
CHECK=$ROOT/tools/pr-check.sh
[[ -f $CHECK ]] || exit 0
bash "$CHECK"
