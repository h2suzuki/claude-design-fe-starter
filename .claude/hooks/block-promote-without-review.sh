#!/bin/bash
# promote 系 command の前に screen-loop ⑧ の記録（review:check）が緑であることを要求し、飛ばした promote を止める。PreToolUse:Bash で発火
set -euo pipefail

PROG=$(basename "$0")
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
LEDGER="$ROOT/pp/promote-commands.json"

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
usage() {
  cat >&2 <<MSG
$PROG: this is a Claude Code PreToolUse hook for Bash, not a command-line tool.
It reads the hook payload from stdin, acts only on commands that match a
pattern listed in pp/promote-commands.json, runs "node pp/scripts/review-check.mjs",
and denies the command when that check is red. It never modifies any file.

Register it in .claude/settings.json under PreToolUse with the matcher "Bash".
To try it by hand, feed it a payload:

  printf '{"tool_input":{"command":"vercel promote"}}' | $PROG

Exit codes: 0 lets the command through, 2 denies it.
MSG
}

# hook の stdin は socket なので $(</dev/stdin) では読めない
INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq is not installed, so this hook cannot read the payload and is letting
the command through. The promote-without-review check is OFF until jq is
installed. This hook never modifies any file.
MSG
  exit 0
fi

if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi

COMMAND=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)
[[ -n $COMMAND ]] || exit 0

# 台帳が無い PJ（deploy しない、または未設定）では何も止めない。止める対象は PJ が列挙する
[[ -f $LEDGER ]] || exit 0

mapfile -t PATTERNS < <(jq -r '.patterns[]? // empty' "$LEDGER")
[[ ${#PATTERNS[@]} -gt 0 ]] || exit 0

MATCHED=""
for pattern in "${PATTERNS[@]}"; do
  if grep -Eq -- "$pattern" <<<"$COMMAND"; then
    MATCHED=$pattern
    break
  fi
done
[[ -n $MATCHED ]] || exit 0

if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: node is not on PATH, so review:check cannot run. Denying "$COMMAND"
(matched promote pattern: $MATCHED). Install node or run the check by hand:
  bun run --cwd pp review:check
This hook never modifies any file.
MSG
  exit 2
fi

if OUTPUT=$(node "$ROOT/pp/scripts/review-check.mjs" 2>&1); then
  exit 0
fi

cat >&2 <<MSG
$PROG: denied "$COMMAND" (matched promote pattern: $MATCHED) because the
screenshot review record is not green. screen-loop step 8 must be done and
recorded before a promote. Output of review:check:

$OUTPUT

Fix: run the screen-review skill for each red screen (writes
docs/presentation/ui-review/<slug>.json), then re-run
  bun run --cwd pp review:check
and retry. This hook never modifies any file.
MSG
exit 2
