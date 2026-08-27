#!/bin/bash
# 凍結 mock が 1 枚も無いうちの UI 実装（frontend/src/lib/ui/・routes/）への書き込みを deny する。PreToolUse:Edit|Write と PreToolUse:Bash で発火
set -euo pipefail

PROG=$(basename "$0")
GUARDED='frontend/src/(lib/ui|routes)/'

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
usage() {
  cat >&2 <<MSG
$PROG: this is a Claude Code PreToolUse hook, not a command-line tool. It reads
the hook payload from stdin, looks at tool_input.file_path (Edit/Write) and
tool_input.command (Bash), and never modifies any file.

Register it in .claude/settings.json under PreToolUse for BOTH the "Edit|Write"
and the "Bash" matcher. Registering only the first leaves shell redirection,
tee and sed -i as an unguarded way to write the same files. To try it by hand:

  printf '{"tool_input":{"file_path":"<absolute path>"}}' | $PROG
  printf '{"tool_input":{"command":"cat > frontend/src/routes/+page.svelte"}}' | $PROG

Exit codes: 0 lets the call through, 2 denies it.
MSG
}

INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq is not installed, so this hook cannot read the payload and is letting
the call through. The mock-first guard is OFF until jq is installed; UI files
written before any mock is frozen will not be stopped. This hook never modifies
any file.
MSG
  exit 0
fi

if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi

# heredoc を含む command は改行を持つので、1 回の jq で 2 値を改行区切りに取ると境界が壊れる
if ! FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>&1); then
  printf '%s: could not read the hook payload as JSON (jq: %s)\n' "$PROG" "$FILE" >&2
  usage
  exit 0
fi
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
deny() {
  cat >&2 <<'MSG'
Refusing to write UI implementation while docs/presentation/ui-mock/export/ holds
no frozen mock (this hook never modifies any file; it only stopped the tool
call).

The mock is the design source of truth, and every parity gate compares the
implementation against the frozen copy of it. Writing components or routes
first leaves nothing to converge on, so those gates stay skipped and the work
cannot be shown to be correct.

To start implementing: get the mock approved in Claude Design, then land the
export with /mock-freeze, which writes docs/presentation/ui-mock/export/ and
mock-baseline.sha256 in the same commit. This gate opens as soon as one file is
frozen there.

Outside this gate: frontend/src/app.html, pp/, docs/, and anything not under
frontend/src/lib/ui/ or frontend/src/routes/ can be written right now.
MSG
  exit 2
}

# .gitkeep 以外が 1 つでもあれば凍結済み
mock_is_frozen() {
  local export_dir=$1 found
  [[ -d $export_dir ]] || return 0
  if ! found=$(find "$export_dir" -type f ! -name .gitkeep 2>&1); then
    printf '%s: could not scan %s (%s) — letting the call through\n' "$PROG" "$export_dir" "$found" >&2
    return 0
  fi
  [[ -n $found ]]
}

if [[ -n $FILE ]]; then
  # 意匠を担う置き場だけを見る。app.html や設定 file は着工条件の対象外
  [[ $FILE =~ /$GUARDED ]] || exit 0
  # project dir でなく編集対象の path から repo を割り出す（別 checkout でも正しく効く）
  mock_is_frozen "${FILE%/frontend/src/*}/docs/presentation/ui-mock/export" || deny
  exit 0
fi

[[ -n $CMD ]] || exit 0

# 相対 path の書き込み先は command が走る dir で決まる。worktree では project dir と別
CWD=$(jq -r '.cwd // empty' <<<"$INPUT")
: "${CWD:=${CLAUDE_PROJECT_DIR:-$PWD}}"

# heredoc の本文は data であって command ではない。混ぜると文書中の語だけで誤 deny する
drop_heredoc_bodies() {
  local line term=""
  while IFS= read -r line; do
    if [[ -n $term ]]; then
      [[ ${line//[[:space:]]/} == "$term" ]] && term=""
      continue
    fi
    printf '%s\n' "$line"
    if [[ $line =~ \<\<-?[[:space:]]*[\"\']?([A-Za-z_][A-Za-z0-9_]*) ]]; then
      term=${BASH_REMATCH[1]}
    fi
  done <<<"$1"
}

# 行内の path 候補を cwd 基準で絶対化する。cwd は repo root とは限らない（worktree・下位 dir）
absolutize_tokens() {
  local token
  set -f
  for token in $1; do
    token=${token//[\'\"]/}
    token=${token##*[\>\<]}
    [[ -n $token ]] || continue
    [[ $token == /* ]] || token=$CWD/$token
    printf '%s\n' "$token"
  done
  set +f
}

# 書き込みの形を取る行だけを見る。行をまたぐ照合は離れた語を 1 つの command と誤認する
while IFS= read -r line; do
  [[ $line =~ (^|[[:space:]])(\>|\>\>)[[:space:]]* ]] ||
    [[ $line =~ (^|[[:space:]\;\|\&])(tee|sed[[:space:]]+-i|touch|mkdir|dd|cp|mv|rsync|install|ln|unzip|tar|git[[:space:]]+mv)[[:space:]] ]] ||
    continue
  # 書き込み先の path から repo を割り出す（Edit/Write 経路と同じ根拠に揃える）
  while IFS= read -r target; do
    [[ $target =~ $GUARDED ]] || continue
    mock_is_frozen "${target%/frontend/src/*}/docs/presentation/ui-mock/export" || deny
  done < <(absolutize_tokens "$line")
done < <(drop_heredoc_bodies "$CMD")
exit 0
