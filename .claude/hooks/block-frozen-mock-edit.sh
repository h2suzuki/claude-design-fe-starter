#!/bin/bash
# 凍結 mock（docs/presentation/ui-mock/export/ 配下）への Edit/Write を deny する。PreToolUse:Edit|Write で発火
set -euo pipefail

PROG=$(basename "$0")

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
usage() {
  cat >&2 <<MSG
$PROG: this is a Claude Code PreToolUse hook for Edit and Write, not a
command-line tool. It reads the hook payload from stdin, looks only at
tool_input.file_path, and never modifies any file.

Register it in .claude/settings.json under PreToolUse with the matcher
"Edit|Write". To try it by hand, feed it a payload:

  printf '{"tool_input":{"file_path":"<absolute path>"}}' | $PROG

Exit codes: 0 lets the edit through, 2 denies it.
MSG
}

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq is not installed, so this hook cannot read the payload and is letting
the edit through. The frozen-mock guard is OFF until jq is installed; edits to
docs/presentation/ui-mock/export/ will not be stopped. This hook never modifies
any file.
MSG
  exit 0
fi

if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi

# jq の失敗は payload の形が違う合図。fail-open のまま、黙らずに使い方を出す
if ! FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>&1); then
  printf '%s: could not read the hook payload as JSON (jq: %s)\n' "$PROG" "$FILE" >&2
  usage
  exit 0
fi

# file_path を持たない tool の payload — 正常系なので黙って通す
[[ -n $FILE ]] || exit 0

# project dir に anchor すると別 checkout (worktree 等) の凍結 mock を素通りさせるので、path 区間で判定する
case $FILE in
  */docs/presentation/ui-mock/export/*)
    # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
    cat >&2 <<'MSG'
Refusing to Edit/Write inside docs/presentation/ui-mock/export/ (this hook never
modifies any file; it only stopped the tool call).

That directory holds the frozen mock, which every parity gate compares the
implementation against. Editing it in place makes the gates agree with a mock
that no longer matches the design, so the comparison silently stops meaning
anything.

To change the mock: edit the design in Claude Design, export it again, and land
the new export with /mock-freeze, which writes the file and updates
mock-baseline.sha256 in the same commit. Changes made that way do not hit this
gate.

To change something else near the mock: screenshots/ and DESIGN-POLICY.md are
outside this gate and can be edited directly.
MSG
    exit 2
    ;;
esac
exit 0
