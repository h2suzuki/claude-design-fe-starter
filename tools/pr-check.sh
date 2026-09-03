#!/usr/bin/env bash
# origin の open PR を提案用に表示するだけで、CI は実行しない。
set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
command -v gh >/dev/null 2>&1 || { printf 'pr-check: gh not found\n'; exit 0; }
ORIGIN=$(git -C "$ROOT" remote get-url origin 2>/dev/null)
origin_rc=$?
if [[ $origin_rc -ne 0 || -z $ORIGIN ]]; then
  printf 'pr-check: origin not found\n'
  exit 0
fi
PRS=$(gh pr list --repo "$ORIGIN" --state open --json number,title,author,headRefName --jq '.[] | "#\(.number) \(.title) (\(.author.login), \(.headRefName))"' 2>&1)
gh_rc=$?
if [[ $gh_rc -ne 0 ]]; then
  printf 'pr-check: gh failed: %s\n' "${PRS%%$'\n'*}"
  exit 0
fi
if [[ -z $PRS ]]; then
  printf 'pr-check: no open PRs\n'
  exit 0
fi
printf 'origin に open PR があります。CI をここで回すなら、branch を checkout して tools/ci.sh を実行する提案をユーザーへ出してください（Go が出るまで走らせない）\n'
printf '%s\n' "$PRS"
