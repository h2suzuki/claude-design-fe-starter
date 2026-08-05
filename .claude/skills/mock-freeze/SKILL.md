---
name: mock-freeze
description: Freeze an approved Claude Design export into design-reference with a sha256 provenance pin.
when_to_use: TRIGGER when the user declares a mock complete, when an export needs re-freezing, or when a provenance/baseline mismatch is reported. SKIP while the mock is still under revision in Claude Design.
---

# Mock Freeze

承認済み mock export を `design-reference/export/` へ凍結し、sha256 台帳で出所を pin する。手順の正は `design-reference/README.md`。

## Process

1. ユーザーの完成宣言を確認する（宣言前に凍結しない）
2. export を取得する: `tools/design_sync fetch`（要 `DESIGN_PROJECT_ID`）または DesignSync tool。byte を逐語保存する（整形・切詰め・末尾改行の増減なし）
3. 取得物を `design-reference/export/` へ配置する。編集 gate が Edit/Write を block するため、配置は cp 等の Bash で行う
4. 基準 viewport ごとの参照スクショを `design-reference/screenshots/` へ保存する
5. 台帳を更新する（.gitkeep 除外・空白名安全）:

   ```bash
   cd design-reference
   find export -type f ! -name .gitkeep -print0 | sort -z | xargs -0 sha256sum > mock-baseline.sha256
   sha256sum --check --quiet mock-baseline.sha256
   ```

6. `pp/` で `npm run lint:mock` と `npm run test:provenance` を実行し、緑を確認してから export と台帳を同一 commit にする

## Rules

- 凍結後の export は直接編集しない — 変更は Claude Design 側 → 再 export → 再凍結
- Claude Design へ push した後は `tools/design_sync verify` で再取得し、repo と SHA-256 一致を確認する（`docs/design-sync.md`）
- 台帳と export の不一致は commit gate（check-mock-baseline hook）が止める。台帳だけ・実体だけの commit を作らない

## Related

- `design-order` — mock 修正を Claude Design へ依頼する側の手順
- `fe-kickoff` — 凍結第 1 号を含む walking skeleton 全体
