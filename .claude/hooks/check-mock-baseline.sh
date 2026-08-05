#!/bin/bash
# git commit の前に凍結 mock と sha256 台帳の一致を検査し、突合先がドリフトした commit を止める。PreToolUse:Bash で発火
set -euo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
grep -qE '\bgit\b[^;|&]*\bcommit\b' <<<"$CMD" || exit 0

ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
BASELINE=$ROOT/design-reference/mock-baseline.sha256
[[ -f $BASELINE ]] || exit 0

if ! (cd "$ROOT/design-reference" && sha256sum --check --quiet mock-baseline.sha256 2>&1); then
  # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
  cat >&2 <<'MSG'
design-reference/export/ と mock-baseline.sha256 が一致しないため commit を止めました
(この検査は sha256 照合のみで、hook 自身はファイルを変更しません)。意図した再凍結なら
/mock-freeze の手順で台帳を更新し、意図しない変更なら export/ を復元してください。
台帳と実体を同一 commit に揃えれば、この gate には当たりません。
MSG
  exit 2
fi
exit 0
