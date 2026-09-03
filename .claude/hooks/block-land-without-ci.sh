#!/usr/bin/env bash
# land 系 command の前に対象 commit の full local CI 記録を要求する。
set -u

PROG=${0##*/}
ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
LEDGER=$ROOT/pp/land-commands.json

usage() {
  cat >&2 <<MSG
Usage: $PROG

This is a Claude Code PreToolUse hook for Bash, not a command-line tool. It
reads the hook payload from stdin, checks commands listed in
pp/land-commands.json, and requires a clean full local CI record for the
target commit. This hook never modifies any file.

Register it in .claude/settings.json under PreToolUse with matcher "Bash".
To try it by hand:

  printf '{"tool_input":{"command":"git merge feature"}}' | $PROG

Exit codes: 0 lets the command through, 2 denies it.
MSG
}

deny_missing_record() {
  local record=$REPO_DIR/drafts/gate-logs/ci-green.$TARGET_SHA
  cat >&2 <<MSG
$PROG: denied "$COMMAND" (matched land pattern: $MATCHED).
Target SHA checked: $TARGET_SHA
Repository directory checked: $REPO_DIR
Expected green CI record: $record

Fix: git checkout <branch> → tools/ci.sh (a green run writes the record) → retry.
--no-gate runs and runs on a dirty tree do not write the record.
This hook never modifies any file.
MSG
  exit 2
}

deny_gh() {
  cat >&2 <<MSG
$PROG: denied "$COMMAND" (matched land pattern: $MATCHED).
Target SHA checked: unavailable because gh pr view $PR_NUMBER could not resolve it.
Repository directory checked: $REPO_DIR

Fix: check out the branch and use git merge, or fix gh authentication and retry.
This hook never modifies any file.
MSG
  exit 2
}

merge_sha() {
  local arg ref="" skip=0
  local -a args=()
  read -r -a args <<<"${REST#git merge}"
  for arg in "${args[@]}"; do
    if [[ $skip -eq 1 ]]; then skip=0; continue; fi
    case $arg in
      --abort|--continue|--quit) return 1 ;;
      -m|--message|-s|--strategy|-X|--strategy-option|--into-name|--cleanup) skip=1 ;;
      -*) continue ;;
      *) ref=$arg; break ;;
    esac
  done
  [[ -n $ref ]] || return 1
  git -C "$REPO_DIR" rev-parse --verify "${ref}^{commit}" 2>/dev/null
}

push_sha() {
  local arg
  local -a args=()
  read -r -a args <<<"${REST#git push}"
  for arg in "${args[@]}"; do
    case $arg in --delete|-d|--delete=*) return 1 ;; esac
  done
  git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null
}

pr_number() {
  local arg skip=0
  local -a args=()
  read -r -a args <<<"${REST#gh pr merge}"
  for arg in "${args[@]}"; do
    if [[ $skip -eq 1 ]]; then skip=0; continue; fi
    case $arg in
      --repo|-R|--subject|--body|--body-file|--match-head-commit) skip=1 ;;
      -*) ;;
      *) printf '%s\n' "$arg"; return 0 ;;
    esac
  done
  return 1
}

INPUT=$(cat)
if ! command -v jq >/dev/null 2>&1; then
  cat >&2 <<MSG
$PROG: jq is not installed, so this hook cannot read the payload and is letting
the command through. The land-without-ci check is OFF until jq is installed.
This hook never modifies any file.
MSG
  exit 0
fi
if [[ -z ${INPUT//[[:space:]]/} ]]; then
  usage
  exit 0
fi
COMMAND=$(jq -r '.tool_input.command // empty' <<<"$INPUT" 2>/dev/null || true)
[[ -n $COMMAND && -f $LEDGER ]] || exit 0
mapfile -t PATTERNS < <(jq -r '.patterns[]? // empty' "$LEDGER" 2>/dev/null)
[[ ${#PATTERNS[@]} -gt 0 ]] || exit 0
MATCHED=""
for pattern in "${PATTERNS[@]}"; do
  if grep -Eq -- "$pattern" <<<"$COMMAND"; then
    MATCHED=$pattern
    break
  fi
done
[[ -n $MATCHED ]] || exit 0

REPO_DIR=$ROOT
REST=$COMMAND
if [[ $COMMAND =~ ^git[[:space:]]-C[[:space:]]([^[:space:]]+)[[:space:]](.+)$ ]]; then
  REPO_DIR=${BASH_REMATCH[1]}
  [[ $REPO_DIR == /* ]] || REPO_DIR=$ROOT/$REPO_DIR
  REST="git ${BASH_REMATCH[2]}"
fi
TARGET_SHA=""
case $REST in
  git\ merge*) TARGET_SHA=$(merge_sha); resolve_rc=$? ;;
  git\ push*) TARGET_SHA=$(push_sha); resolve_rc=$? ;;
  gh\ pr\ merge*)
    PR_NUMBER=$(pr_number)
    pr_rc=$?
    [[ $pr_rc -eq 0 ]] || exit 0
    TARGET_SHA=$(gh pr view "$PR_NUMBER" --json headRefOid --jq .headRefOid 2>/dev/null)
    resolve_rc=$?
    [[ $resolve_rc -eq 0 && -n $TARGET_SHA ]] || deny_gh
    ;;
  *) exit 0 ;;
esac
[[ $resolve_rc -eq 0 && -n $TARGET_SHA ]] || exit 0
[[ -e $REPO_DIR/drafts/gate-logs/ci-green.$TARGET_SHA ]] && exit 0
deny_missing_record
