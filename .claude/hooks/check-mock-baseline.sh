#!/bin/bash
# git commit の前に凍結 mock と sha256 台帳の一致（内容 + ファイル集合）を検査し、突合先がドリフトした commit を止める。PreToolUse:Bash で発火
set -euo pipefail

INPUT=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
CMD=$(jq -r '.tool_input.command // empty' <<<"$INPUT")
grep -qE '\bgit\b[^;|&]*\bcommit\b' <<<"$CMD" || exit 0

ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
BASELINE=$ROOT/design-reference/mock-baseline.sha256
[[ -f $BASELINE ]] || exit 0

cd "$ROOT/design-reference"
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
    printf '台帳とファイル集合の差分（< 台帳のみ / > 実体のみ）:\n'
    # diff の exit 1 (差分あり) は正常系 — pipefail + set -e で block 前に落ちないよう明示的に無害化する
    diff <(printf '%s\n' "$listed") <(printf '%s\n' "$actual") | grep -E '^[<>]' | head -20 || true
  fi
  [[ -z $content_out ]] || printf '%s\n' "$content_out"
  # 文面は意図的に冗長 — 誤読防止のため trim せず維持する
  cat <<'MSG'
凍結 mock (design-reference/export/) と mock-baseline.sha256 が一致しないため commit を止めました
(検査 = sha256 照合 + ファイル集合の突合。台帳が空・不正形式の場合もここに該当します。
hook 自身はファイルを変更しません)。意図した再凍結なら /mock-freeze の手順で台帳を更新し、
意図しない変更なら export/ を復元してください。台帳と実体を同一 commit に揃えれば、
この gate には当たりません。
MSG
} >&2
exit 2
