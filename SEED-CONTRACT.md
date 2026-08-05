# SEED-CONTRACT — この seed の合成契約

複数 seed（将来の BE seed 等）を同一 repo へ copy-in で同居させるための契約。installer（`tools/install.sh`）はこの契約の範囲でのみ書き込む。

## 占有 dir（この seed が所有・他 seed は使用禁止）

- `frontend/`
- `pp/`
- `design-reference/`
- `seed-docs/`

## merge 領域への寄与（file/dir 単位の追加のみ・既存は上書きしない）

| 領域 | 寄与 | 冪等化の方法 |
|---|---|---|
| `docs/` | `ui-quality-policy.md` `pixel-perfect.md` `design-sync.md` `ui-caveats.md` | file 単位の add-only |
| `tools/` | `design_sync` `install.sh` | file 単位の add-only |
| `.claude/skills/` | `fe-kickoff/` `design-order/` `mock-freeze/` | dir 単位の add-only |
| `.claude/hooks/` | `block-frozen-mock-edit.sh` `check-mock-baseline.sh` | file 単位の add-only |
| `.claude/settings.json` | hooks 登録 | 無ければ作成・有れば手動 merge を案内（上書きしない） |
| `CLAUDE.md` | 行動規範ブロック | `<!-- fe-starter:begin/end -->` マーカー区間の追記（既存なら skip） |
| `.gitignore` | build/一時生成物の除外 | `# fe-starter:begin/end` マーカー区間の追記（既存なら skip） |

`README.md`・`LICENSE` は installer の対象外（PJ 所有）。

## placeholder 一覧（生成後に PJ が差し替える点）

| placeholder / 差し替え点 | 場所 |
|---|---|
| `{{PRODUCT_NAME}}` などの `{{...}}` トークン | `docs/` `seed-docs/` 内の各所（grep で列挙できる） |
| 基準 viewport・locale・timezone・固定時刻 | `pp/src/config.ts` |
| mock の entry ファイル名・SELECTOR_MAP | `pp/src/config.ts` `pp/src/selector-map.ts` |
| design token の実値 | `frontend/src/ui/tokens/tokens.css` |
| Claude Design project ID | 環境変数 `DESIGN_PROJECT_ID`（`tools/design_sync`） |
