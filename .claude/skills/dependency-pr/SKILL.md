---
name: dependency-pr
description: Handles a dependency-update pull request with local CI in the checkout and an explicit user approval before landing.
when_to_use: TRIGGER when SessionStart pr-check reports an open PR, or when the user says "依存更新 PR", "dependabot", or "/dependency-pr <PR number>". SKIP when the PR is not a dependency update or gh is unavailable.
argument-hint: <PR number>
---

# Dependency PR

依存更新 PR を GitHub Actions に任せず、この checkout で検証してから扱う。

## Process

1. `tools/pr-check.sh` で対象 PR を確認する。
2. `gh pr checkout <n>` を実行する。使えなければ `git fetch origin <branch> && git checkout <branch>` を使う。
3. `tools/ci.sh` を実行する。時間は画面数に比例し、iac-web の 7 画面では約 40 分だった。
4. 緑なら `drafts/gate-logs/ci-green.<sha>` が書かれたことを確かめる。**ユーザーの Go が出るまで merge しない。**
5. Go の後に `git checkout main && git merge --ff-only <branch>` を実行する。merge commit を禁じる repo では ff か squash だけを使う。rebase が必要なら branch を rebase して CI をやり直す。sha が変わると記録も外れる。
6. `git push origin main` を実行する。
7. GitHub が MERGED と判定した後に `git push origin --delete <branch>` を実行する。
8. `bun run --cwd pp round:record <n>` を実行し、`seed-docs/round-record.md` の巡へ依存 bump として記録する。
9. 赤なら落ちた段名と log の末尾 20 行を `gh pr comment <n>` で PR に書き、PR は open のまま終える。

## Rules

- `@playwright/test` は `docs/stack.md` の固定版で、同梱 Chromium が pixel の出所である。上げる手順は別枠にする。
- major は 1 件ずつ単独 PR にする。peer range は先に `npm view <pkg>@<ver> peerDependencies` で確認し、framework が許さない major へは進まない。
- patch と minor も 1 件ずつ land し、前後の gate を `seed-docs/adoption.md` §7 に従って比べる。
- merge、push、branch 削除は Go の後だけに行う。
- `pp/land-commands.json` に `^git( -C \S+)? merge`、`^gh pr merge`、`^git( -C \S+)? push` などを入れると、緑記録の無い merge / push は hook が止める。

## Related

- `mock-freeze` — `round:record` の呼び手
- `verify-claims` — 完了主張の検証
