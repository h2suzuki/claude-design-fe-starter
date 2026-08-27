#!/bin/bash
# git commit の前に凍結 mock と sha256 台帳の一致（内容 + ファイル集合）を検査し、突合先がドリフトした commit を止める。PreToolUse:Bash で発火
set -euo pipefail

PROG=$(basename "$0")

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
usage() {
  cat >&2 <<MSG
$PROG: this is a Claude Code PreToolUse hook for Bash, not a command-line tool.
It reads the hook payload from stdin, acts only on commands that run git commit,
and never modifies any file.

Register it in .claude/settings.json under PreToolUse with the matcher "Bash".
To try it by hand, feed it a payload:

  printf '{"tool_input":{"command":"git commit -m x -- a.txt"}}' | $PROG

Exit codes: 0 lets the command through, 2 denies it.
MSG
}

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq is not installed, so this hook cannot read the payload and is letting
the command through. The frozen-mock drift check is OFF until jq is installed;
a commit that desynchronises export/ from mock-baseline.sha256 will not be
stopped. This hook never modifies any file.
MSG
  exit 0
fi

if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi

# jq の失敗は payload の形が違う合図。fail-open のまま、黙らずに使い方を出す
if ! CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>&1); then
  printf '%s: could not read the hook payload as JSON (jq: %s)\n' "$PROG" "$CMD" >&2
  usage
  exit 0
fi

grep -qE '\bgit\b[^;|&]*\bcommit\b' <<<"$CMD" || exit 0

# command は複数行を取りうるので cwd と分けて読む（1 回の jq に束ねると行境界で壊れる）
CWD=$(jq -r '.cwd // empty' <<<"$INPUT")
: "${CWD:=${CLAUDE_PROJECT_DIR:-$PWD}}"

# 検査するのは commit が実際に走る checkout。環境に anchor すると worktree の commit を別 checkout の台帳で判定する
ROOT=$CWD
if [[ $CMD =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]] && [[ -d ${BASH_REMATCH[1]} ]]; then
  ROOT=${BASH_REMATCH[1]}
fi
ROOT=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null) || ROOT=$CWD

BASELINE=$ROOT/docs/presentation/ui-mock/mock-baseline.sha256
[[ -f $BASELINE ]] || exit 0

cd "$ROOT/docs/presentation/ui-mock"
actual=""
if [[ -d export ]]; then
  actual=$(find export -type f ! -name .gitkeep | sort)
fi
listed=$(sed -nE 's/^[0-9a-f]{64} [ *]//p' mock-baseline.sha256 | sort)

content_out=""
content_ok=1
if ! content_out=$(sha256sum --check --quiet mock-baseline.sha256 2>&1); then
  content_ok=0
fi

if [[ $actual == "$listed" && $content_ok -eq 1 ]]; then
  exit 0
fi

{
  if [[ $actual != "$listed" ]]; then
    printf 'File sets differ (< listed in the baseline only / > present on disk only):\n'
    # diff の exit 1 (差分あり) は正常系 — pipefail + set -e で block 前に落ちないよう明示的に無害化する
    diff <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") | grep -E '^[<>]' | head -20 || true
  fi
  [[ -z $content_out ]] || printf '%s\n' "$content_out"
  # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
  cat <<'MSG'
Refusing to commit: docs/presentation/ui-mock/export/ and mock-baseline.sha256
disagree (this hook never modifies any file; it only stopped the tool call).

The check compares both the sha256 of every listed file and the set of files
itself, so an empty or malformed baseline lands here too. Committing in this
state would leave the gates comparing against a mock whose provenance nobody can
reconstruct afterwards.

If you re-froze the mock on purpose: run /mock-freeze so the export and the
baseline are updated together, then commit both in one commit.

If you did not: restore export/ from the last commit (git restore) so it matches
the baseline again.

Either way the export and the baseline must move in the same commit; that is the
state this gate lets through.
MSG
} >&2
exit 2
