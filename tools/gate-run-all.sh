#!/usr/bin/env bash
# export の画面ごとに gate を実行し、結果を 1 枚の台帳へ集める。
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)
LOG_DIR=$ROOT/drafts/gate-logs
OUT=$LOG_DIR/all-screens.txt

mkdir -p "$LOG_DIR" || exit 1
if [[ $# -eq 0 ]]; then
  # 分割実行では追記して全画面の summary を 1 枚に集める。
  : > "$OUT"
  LIST=$LOG_DIR/list-screens.txt
  "$ROOT/pp/node_modules/.bin/tsx" "$ROOT/pp/scripts/list-screens.ts" > "$LIST" 2>&1
  rc=$?
  if [[ $rc -ne 0 ]]; then
    tail -n 20 "$LIST"
    exit "$rc"
  fi
  mapfile -t SCREENS < "$LIST"
else
  SCREENS=("$@")
fi

if [[ ${#SCREENS[@]} -eq 0 ]]; then
  printf 'no screens\n'
  exit 0
fi

failed=0
for screen in "${SCREENS[@]}"; do
  mock=$screen
  [[ $mock == *.dc.html ]] || mock=$mock.dc.html
  slug=${mock%.dc.html}
  run_log=$LOG_DIR/run-${slug//\//_}.out
  bash "$HERE/gate-run-slug.sh" "$mock" --timeout=180000 > "$run_log" 2>&1
  rc=$?
  summary=$(awk '/passed|failed/ { line = $0 } END { print line }' "$run_log")
  skips=$(awk '/require-no-skips:/ { line = $0 } END { print line }' "$run_log")
  printf '%-24s rc=%s | %s | %s\n' "$slug" "$rc" "${summary:-no result line}" "${skips:-no skip line}" >> "$OUT"
  printf '%-24s rc=%s | %s\n' "$slug" "$rc" "${summary:-no result line}"
  [[ $rc -eq 0 ]] || failed=1
done
printf 'summary: %s\n' "$OUT"
exit "$failed"
