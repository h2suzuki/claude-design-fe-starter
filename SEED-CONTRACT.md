# SEED-CONTRACT — この seed の合成契約

複数 seed（将来の BE seed 等）を同一 repo へ copy-in で同居させるための契約。installer（`tools/install.sh`）はこの契約の範囲でのみ書き込む。

## 占有 dir（この seed が所有・他 seed は使用禁止）

- `frontend/`
- `pp/`
- `docs/presentation/ui-mock/`
- `docs/presentation/ui-ast/`
- `seed-docs/`

## merge 領域への寄与（file/dir 単位の追加。既存との衝突は既定で停止）

installer は既存 file を黙って置き換えない。1 件でも衝突したら **1 file も書かずに停止**し、対象を列挙する。置き換えるには `--overwrite` を明示する（PJ が育てた `pp/src/config.ts`・`selector-map.ts`・`.claude/settings.json` を失う操作なので、既定にはしない）。

| 領域 | 寄与 | 冪等化の方法 |
|---|---|---|
| `docs/` | `ui-quality-policy.md` `pixel-perfect.md` `design-sync.md` `ui-caveats.md` `ast-layer.md` | file 単位の add-only |
| `tools/` | `design_sync` `ast_validate` `ast-tree` `ast-viewer` `install.sh` | file 単位の add-only |
| `.claude/skills/` | `fe-kickoff/` `design-order/` `mock-freeze/` `ast-extract/` | file 単位の add-only（新規 dir として追加される） |
| `.claude/hooks/` | `block-frozen-mock-edit.sh` `check-mock-baseline.sh` | file 単位の add-only |
| `.claude/settings.json` | hooks 登録 | 無ければ作成。既存なら衝突として停止し、hooks は seed の同 file から手動 merge する |
| `CLAUDE.md` | 行動規範ブロック | `<!-- fe-starter:begin/end -->` マーカー区間の追記（既存なら skip） |
| `.gitignore` | build/一時生成物の除外 | `# fe-starter:begin/end` マーカー区間の追記（既存なら skip） |

`README.md`・`LICENSE` は installer の対象外（PJ 所有）。

## placeholder 一覧（生成後に PJ が差し替える点）

| placeholder / 差し替え点 | 場所 |
|---|---|
| `{{PRODUCT_NAME}}` などの `{{...}}` トークン | `docs/` `seed-docs/` `frontend/src/app.html` の各所（grep で列挙できる） |
| 基準 viewport・locale・timezone・固定時刻 | `pp/src/config.ts` |
| mock の entry ファイル名 | 環境変数 `PP_MOCK_FILE`（`pp/src/config.ts`） |
| AST から導けない selector 対 | `pp/src/selector-map.ts` の `MANUAL_PAIRS`（既定は screen AST からの導出） |
| design token の実値 | `frontend/src/lib/ui/tokens/tokens.css` |
| Claude Design project ID | 環境変数 `DESIGN_PROJECT_ID`（`tools/design_sync`） |
