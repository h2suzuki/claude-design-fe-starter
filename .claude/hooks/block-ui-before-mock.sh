#!/bin/bash
# 凍結 mock が 1 枚も無いうちの UI 実装（frontend/src/lib/ui/・routes/）への Edit/Write を deny する。PreToolUse:Edit|Write で発火
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
the edit through. The mock-first guard is OFF until jq is installed; UI files
written before any mock is frozen will not be stopped. This hook never modifies
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

# 意匠を担う置き場だけを見る。app.html や設定 file は着工条件の対象外
case $FILE in
  */frontend/src/lib/ui/*|*/frontend/src/routes/*) ;;
  *) exit 0 ;;
esac

# project dir でなく編集対象の path から repo を割り出す（別 checkout でも正しく効く）
EXPORT_DIR=${FILE%/frontend/src/*}/docs/presentation/ui-mock/export
[[ -d $EXPORT_DIR ]] || exit 0

if ! FROZEN=$(find "$EXPORT_DIR" -type f ! -name .gitkeep 2>&1); then
  printf '%s: could not scan %s (%s) — letting the edit through\n' "$PROG" "$EXPORT_DIR" "$FROZEN" >&2
  exit 0
fi

# .gitkeep 以外が 1 つでもあれば凍結済み
[[ -z $FROZEN ]] || exit 0

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
cat >&2 <<'MSG'
Refusing to Edit/Write UI implementation while docs/presentation/ui-mock/export/
holds no frozen mock (this hook never modifies any file; it only stopped the
tool call).

The mock is the design source of truth, and every parity gate compares the
implementation against the frozen copy of it. Writing components or routes
first leaves nothing to converge on, so those gates stay skipped and the work
cannot be shown to be correct.

To start implementing: get the mock approved in Claude Design, then land the
export with /mock-freeze, which writes docs/presentation/ui-mock/export/ and
mock-baseline.sha256 in the same commit. This gate opens as soon as one file is
frozen there.

Outside this gate: frontend/src/app.html, pp/, docs/, and anything not under
frontend/src/lib/ui/ or frontend/src/routes/ can be edited right now.
MSG
exit 2
