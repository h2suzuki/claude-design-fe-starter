#!/usr/bin/env bash
# local CI の段を順番に実行し、最初の失敗をそのまま返す。
set -u

PROG=${0##*/}
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
LOG_DIR=$ROOT/drafts/gate-logs
NO_GATE=0
STEPS=()

usage() {
  printf 'Usage: %s [--no-gate] [--plan]\n' "$PROG"
}

PLAN=0
for arg in "$@"; do
  case $arg in
    --no-gate) NO_GATE=1 ;;
    --plan) PLAN=1 ;;
    *) usage >&2; exit 64 ;;
  esac
done

# bun test と同じ集合で unit の有無を決める（frontend/ 配下、node_modules 除く）
unit_test_file() {
  [[ -d $ROOT/frontend ]] || return 0
  find "$ROOT/frontend" -path '*/node_modules' -prune -o -type f \
    \( -name '*.test.*' -o -name '*.spec.*' -o -name '*_test.*' -o -name '*_spec.*' \) -print -quit
}
UNIT_FILE=$(unit_test_file)
UNIT_PLAN=run
[[ -n $UNIT_FILE ]] || UNIT_PLAN='skip (no unit tests)'
GATE_PLAN=run
[[ $NO_GATE -eq 0 ]] || GATE_PLAN='skip (--no-gate)'

if [[ $PLAN -eq 1 ]]; then
  printf '%-16s %s\n' frontend-check run frontend-unit "$UNIT_PLAN" pp-typecheck run gate-all "$GATE_PLAN" frontend-build run
  exit 0
fi

mkdir -p "$LOG_DIR" || exit 1
BUN=$(command -v bun || true)
if [[ -z $BUN ]]; then
  TOOLCHAIN=$("$HERE/toolchain-dir")
  toolchain_rc=$?
  if [[ $toolchain_rc -ne 0 ]]; then
    exit "$toolchain_rc"
  fi
  BUN=$TOOLCHAIN/bun/bun-linux-x64/bun
fi
if [[ ! -x $BUN ]]; then
  printf 'bun not found (%s)\n' "$BUN" >&2
  exit 1
fi
PATH="$(dirname "$BUN"):${PATH:-}"
export PATH

run() {
  local step=$1
  local log=$LOG_DIR/ci-$step.log
  shift
  STEPS+=("$step")
  "$@" > "$log" 2>&1
  local rc=$?
  printf '%-16s rc=%s\n' "$step" "$rc"
  if [[ $rc -ne 0 ]]; then
    tail -n 20 "$log"
  fi
  return "$rc"
}

run frontend-check "$BUN" run --cwd "$ROOT/frontend" check
rc=$?
[[ $rc -eq 0 ]] || exit "$rc"

if [[ -n $UNIT_FILE ]]; then
  run frontend-unit "$BUN" --cwd "$ROOT/frontend" test
  rc=$?
  [[ $rc -eq 0 ]] || exit "$rc"
else
  STEPS+=("frontend-unit (skipped: no unit tests)")
  printf 'skipped (no unit tests)\n' > "$LOG_DIR/ci-frontend-unit.log"
  printf 'skipped (no unit tests)\n'
fi

run pp-typecheck npm --prefix "$ROOT/pp" run typecheck
rc=$?
[[ $rc -eq 0 ]] || exit "$rc"

if [[ $NO_GATE -eq 0 ]]; then
  run gate-all bash "$HERE/gate-run-all.sh"
  rc=$?
  [[ $rc -eq 0 ]] || exit "$rc"
fi

run frontend-build "$BUN" run --cwd "$ROOT/frontend" build
rc=$?
[[ $rc -eq 0 ]] || exit "$rc"

if [[ $NO_GATE -eq 1 ]]; then
  printf 'ci green (green record not written: --no-gate)\n'
  exit 0
fi
DIRTY=$(git -C "$ROOT" status --porcelain --untracked-files=no)
if [[ -n $DIRTY ]]; then
  printf 'ci green (green record not written: working tree is dirty)\n'
  exit 0
fi
SHA=$(git -C "$ROOT" rev-parse HEAD)
RECORD=$LOG_DIR/ci-green.$SHA
{
  date -Iseconds
  printf '%s\n' "${STEPS[@]}"
} > "$RECORD"
printf 'ci green: %s\n' "$RECORD"
