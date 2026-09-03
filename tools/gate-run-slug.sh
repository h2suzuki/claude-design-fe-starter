#!/usr/bin/env bash
# 1 画面の gate を専用 vite server と skip 検査まで含めて実行する。
set -u

PROG=${0##*/}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOG_DIR=$ROOT/drafts/gate-logs

usage() {
  printf 'Usage: %s <slug>.dc.html [playwright args...]\n' "$PROG"
}

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 64
fi
MOCK=$1
shift
mkdir -p "$LOG_DIR" || exit 1
LOG=$LOG_DIR/${MOCK//\//_}.log
VITE_LOG=$LOG.vite

port_free() {
  node -e 'const net = require("node:net"); const server = net.createServer(); server.once("error", () => process.exit(1)); server.listen(Number(process.argv[1]), "127.0.0.1", () => server.close(() => process.exit(0)));' "$1"
}

command -v node >/dev/null 2>&1 || { printf 'node not found\n' >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { printf 'curl not found\n' >&2; exit 1; }
PORT=""
for candidate in 5173 5174 5175; do
  if port_free "$candidate"; then
    PORT=$candidate
    break
  fi
done
if [[ -z $PORT ]]; then
  printf 'no free port among 5173, 5174, 5175\n' >&2
  exit 1
fi
VITE=$ROOT/frontend/node_modules/.bin/vite
if [[ ! -x $VITE ]]; then
  printf 'vite not found (%s)\n' "$VITE" >&2
  exit 1
fi

(
  cd "$ROOT/frontend" || exit 1
  exec ./node_modules/.bin/vite dev --host 127.0.0.1 --port "$PORT" --strictPort
) > "$VITE_LOG" 2>&1 &
VITE_PID=$!
trap 'kill "$VITE_PID" 2>/dev/null || true; wait "$VITE_PID" 2>/dev/null || true' EXIT INT TERM

ready=0
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    printf 'vite died\n' >&2
    tail -n 20 "$VITE_LOG"
    exit 1
  fi
  sleep 1
done
if [[ $ready -ne 1 ]]; then
  printf 'vite not ready\n' >&2
  exit 1
fi

TOOLCHAIN=$("$ROOT/tools/toolchain-dir")
toolchain_rc=$?
[[ $toolchain_rc -eq 0 ]] || exit "$toolchain_rc"
(
  cd "$ROOT/pp" || exit 1
  PLAYWRIGHT_BROWSERS_PATH=$TOOLCHAIN/pw-browsers PP_MOCK_FILE=$MOCK PP_APP_URL=http://127.0.0.1:$PORT timeout 1800 ./node_modules/.bin/playwright test "$@"
) > "$LOG" 2>&1
playwright_rc=$?
printf 'playwright rc=%s\n' "$playwright_rc"
(
  cd "$ROOT/pp" || exit 1
  PP_MOCK_FILE=$MOCK node scripts/require-no-skips.mjs
)
skips_rc=$?
printf 'require-no-skips rc=%s\n' "$skips_rc"
[[ $playwright_rc -eq 0 ]] || exit "$playwright_rc"
exit "$skips_rc"
