#!/bin/bash
# Agent tool の発注が seed-docs/llm-steps.md の表どおりか（llm-step 宣言・model・executor）を確かめ、逸脱を止める。PreToolUse:Agent で発火
set -euo pipefail

PROG=$(basename "$0")
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
TABLE="$ROOT/pp/scripts/llm-step.mjs"

# 文面は意図的に冗長 — 誤読防止のため trim せず維持する
usage() {
  cat >&2 <<MSG
$PROG: this is a Claude Code PreToolUse hook for the Agent tool, not a
command-line tool. It reads the hook payload from stdin, requires the prompt
to declare "llm-step: <step> <slug>", asks "node pp/scripts/llm-step.mjs
--expect <step> <slug> --json" what the table prescribes, and denies the call
when the model argument (or the executor) differs. It never modifies any file.

Register it in .claude/settings.json under PreToolUse with the matcher "Agent".
To try it by hand, feed it a payload:

  printf '{"tool_name":"Agent","tool_input":{"model":"opus","prompt":"llm-step: screen-review trial"}}' | $PROG

Exit codes: 0 lets the call through, 2 denies it.
MSG
}

# hook の stdin は socket なので $(</dev/stdin) では読めない
INPUT=$(cat)

if ! command -v jq >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq or node is not installed, so this hook cannot read the payload or the
step table and is letting the call through. The off-table agent check is OFF
until both are installed. This hook never modifies any file.
MSG
  exit 0
fi

if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi

# 表の script が無い PJ（seed 未取り込み）では何も止めない
[[ -f $TABLE ]] || exit 0

{ read -r TYPE; read -r MODEL; read -r DECL; } < <(jq -r '
  (.tool_input.subagent_type // ""),
  (.tool_input.model // ""),
  ((.tool_input.prompt // "") | capture("(?m)^llm-step:[ \\t]+(?<step>[a-z0-9-]+)[ \\t]+(?<slug>[A-Za-z0-9_.-]+)") | "\(.step) \(.slug)") // ""
' <<<"$INPUT" 2>/dev/null || printf '\n\n\n')

# fork（同 model を継ぐ）と codex の rescue は発注の型が別で、表の対象は general-purpose 系の subagent
case $TYPE in
  fork|codex:*) exit 0 ;;
esac

if [[ -z $DECL ]]; then
  cat >&2 <<MSG
$PROG: denied this Agent call because the prompt does not declare its step.
Add one line to the prompt:  llm-step: <step> <screen slug>
(steps: branch-route / ast-extract / pre-implementation-questions / implement /
gate-diagnose / screen-review / keep-impl-draft / production-smoke /
verify-claims). Then set "model" to what
  bun run --cwd pp llm-step -- --expect <step> <slug>
prints. The table is seed-docs/llm-steps.md. This hook never modifies any file.
MSG
  exit 2
fi

read -r STEP SLUG <<<"$DECL"
if ! EXPECT=$(node "$TABLE" --expect "$STEP" "$SLUG" --json 2>&1); then
  cat >&2 <<MSG
$PROG: denied this Agent call because the step table could not answer for
"$STEP $SLUG":

$EXPECT

Run  bun run --cwd pp difficulty  first (it writes pp/artifacts/difficulty.json),
then retry. This hook never modifies any file.
MSG
  exit 2
fi

{ read -r EXECUTOR; read -r WANT_MODEL; read -r WANT_EFFORT; } < <(jq -r '.executor, .model, .effort' <<<"$EXPECT")

if [[ $EXECUTOR == codex ]]; then
  cat >&2 <<MSG
$PROG: denied this Agent call. The table says "$STEP $SLUG" is codex work
(model $WANT_MODEL, effort $WANT_EFFORT): the change exceeds the delegation
boundary, so send it through /codex:rescue in an isolated worktree instead.
If the codex plugin is unavailable, write "codex-fallback:" on the llm-step
line and use model $WANT_MODEL's Claude counterpart from seed-docs/llm-steps.md.
This hook never modifies any file.
MSG
  if grep -Eq '(?m)^llm-step:.*codex-fallback:' <<<"$INPUT" 2>/dev/null; then :; else exit 2; fi
fi

if [[ -z $MODEL ]]; then
  cat >&2 <<MSG
$PROG: denied this Agent call because "model" is not set. The table prescribes
model $WANT_MODEL (effort $WANT_EFFORT) for "$STEP $SLUG"; an unset model
inherits the parent session's model, which is the drift this hook exists to
stop. Pass model: "$WANT_MODEL". This hook never modifies any file.
MSG
  exit 2
fi

if [[ $MODEL != "$WANT_MODEL" ]]; then
  cat >&2 <<MSG
$PROG: denied this Agent call because model "$MODEL" is not what the table
prescribes for "$STEP $SLUG": $WANT_MODEL (effort $WANT_EFFORT). Using a higher
model wastes tokens, a lower one loses judgment; both are deviations. Pass
model: "$WANT_MODEL" or change the table with a dated reason in
seed-docs/llm-steps.md. This hook never modifies any file.
MSG
  exit 2
fi

exit 0
