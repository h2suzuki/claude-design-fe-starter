# SEED-CONTRACT — この seed の合成契約

複数 seed（将来の BE seed 等）を同一 repo へ copy-in で同居させるための契約。installer（`tools/install.sh`）はこの契約の範囲でのみ書き込む。

## 占有 dir（この seed が所有・他 seed は使用禁止）

- `frontend/`
- `pp/`
- `docs/presentation/ui-mock/`
- `docs/presentation/ui-ast/`
- `seed-docs/`

## merge 領域への寄与（file/dir 単位の追加。既存との衝突は既定で停止）

installer は既存 file を 3 分類する。**seed の現行版と一致**する file はそのまま残し、**seed が過去に配った版**（前回 install のまま触られていない file）は黙って新版へ入れ替える。判定は seed の git 履歴に同じ blob があるかで行うので、seed が git checkout でない場合はこの緩和が効かず全て衝突扱いになる。

**seed が一度も配ったことのない中身**を持つ file は PJ が育てたものとみなす（`pp/src/config.ts`・`selector-map.ts`・`frontend/src/app.html`・PJ 語彙を埋めた docs など、seed 自身が day-0 で埋めろと指示している差し替え点がここに来る）。

- **既に seed が入っている repo（更新）**: その file だけ触らずに残りを配り、触らなかった file を末尾に列挙する。差し替え点を埋めた repo が機構更新を受け取れなくなるのを避けるため、全か無かにはしない
- **まだ seed が入っていない repo（初回）で衝突**: 対象 dir 違いを疑う場面なので **1 file も書かずに停止**する

どちらも `--overwrite` で置き換えられる。判定は「配布 file のどれかが seed 由来と認識できるか」または「marker 区間が既にあるか」で行う。

書き込みの後、target が git repo なら **まだ commit されていない seed の path** の commit まで進む（端末では 1 キー確認で `y` / `Y` だけが進み他は即 cancel・`--commit` で無条件・`--no-commit` で抑止）。cancel しても file は残るので、再実行すると同じ確認に戻る。元から未 commit の編集を持っていた `CLAUDE.md` / `.gitignore` は、marker 追記が既存編集と混ざるため commit 対象から外す。

| 領域 | 寄与 | 冪等化の方法 |
|---|---|---|
| `docs/` | `ui-quality-policy.md` `pixel-perfect.md` `design-sync.md` `ui-caveats.md` `ast-layer.md` | file 単位の add-only |
| `tools/` | `design_sync` `ast_validate` `ast-tree` `ast-viewer` `toolchain-dir` `install.sh` | file 単位の add-only |
| `.claude/skills/` | `fe-kickoff/` `design-order/` `mock-freeze/` `ast-extract/` | file 単位の add-only（新規 dir として追加される） |
| `.claude/hooks/` | `block-frozen-mock-edit.sh` `block-ui-before-mock.sh` `check-mock-baseline.sh` | file 単位の add-only（exec bit は seed が記録した mode で配る） |
| `.claude/settings.json` | hooks 登録 | 無ければ作成。既存なら衝突として停止し、hooks は seed の同 file から手動 merge する |
| `CLAUDE.md` | 行動規範ブロック | `<!-- fe-starter:begin/end -->` マーカー区間の追記（既存なら skip — 強制力を持たない層なので PJ の版に任せる） |
| `.gitignore` | build/一時生成物の除外 | `# fe-starter:begin/end` マーカー区間の追記（既存区間は seed の現行版へ入れ替える — 機械的に効くので追随させる。区間外と区間の位置は動かさない） |

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
