---
name: ast-extract
description: Extract a schema-valid UI AST from a frozen mock's machine evidence through macro, leaf, and reconcile passes.
when_to_use: TRIGGER when a frozen mock needs its UI AST built or rebuilt, when "AST 抽出" / "ui-ast を起こす" is requested, or after a re-freeze invalidates an existing screen AST. SKIP while the mock is still under revision in Claude Design, and for wrapper-registry-only edits.
---

# AST Extract

凍結済み mock（実行可能 HTML）から機械証拠を採取し、macro → leaf → reconcile の 3 pass で v0.2 UI AST を確定する。意匠の正本は mock なので、AST は「mock を読み直した意味構造の再構成物」であり、意匠の代替ではない。schema の正は `docs/presentation/ui-ast/ui-ast.schema.json`、gate の正は `tools/ast_validate`。

## Process

1. **前提を確認する** — 対象 slug の mock がユーザー完成宣言済みで、`docs/presentation/ui-mock/export/<slug>.html`（取得元によっては `<slug>.dc.html` など複数段の拡張子）が凍結され、`mock-baseline.sha256` と一致していること。未凍結 mock からは抽出しない（突合先がドリフトする）
2. **機械証拠を採取する** — 下記 Evidence の 4 種を Playwright で決定的に取る
3. **macro pass** — `20-macro-pass.md` に従い大領域だけを抽出する
4. **leaf pass** — `30-leaf-pass.md` に従い領域ごとの部品候補を出す（複数候補可）
5. **reconcile pass** — `40-reconcile-pass.md` に従い v0.2 準拠 JSON へ確定する
6. **gate を通す** — `python3 tools/ast_validate <file>` が緑になるまで直す（`--self-test` で gate 自体の健全性も確認できる）
7. **保存する** — `docs/presentation/ui-ast/screens/<slug>.ui-ast.json`（slug は凍結 export の file 名の最初の dot までと共通）
8. **裁定論点を報告する** — `uncertainNodes` と未カバー領域をターン末尾に列挙し、ユーザー裁定を仰ぐ

## Evidence

採取するのは推測材料ではなく機械証拠の 4 種。すべて同一の凍結 export から、同一条件で取る。

- **DOM 構造** — tagName / `role` / `aria-*` / text / 属性。意味証拠として最優先
- **computed style** — `display` / `flex-direction` / `gap` / `max-width` / `position` / `z-index`。layout 契約の根拠
- **相対 boundingBox** — `getBoundingClientRect()` + `scrollX/scrollY` で page 座標にし、`documentElement.scrollWidth/scrollHeight` で割って 0..1 に正規化する。これが `source.region` = `[x, y, width, height]`（DOMRect と同じ並び。対角 2 点で書くと `tools/ast-viewer` の枠が壊れる）
- **状態別スクリーンショット** — base に加え、overlay 展開・tab 切替など mock が持つ状態ごとに 1 枚

決定性のための採取条件:

- export を静的 HTTP server で配信して開く（`file://` は相対 path と CORS の挙動が変わる）
- 外部依存（CDN script / webfont / API）は route stub で固定応答にする
- 時刻・timezone・locale を固定する（`page.clock.setFixedTime` 等）
- `document.fonts.ready` の解決と安定待ちの後に測る
- 基準 viewport と中間幅を別 context で採る（例: 1280×800 / 390×844）。responsive variant の根拠はこの複数採取だけ
- 非描画 template 要素（`x-dc` 配下等）の match は除外し、`width > 0 && height > 0` の可視 match を測る

## Rules

- **実測 px を layout 契約に書かない（AST104）** — `layout.gap` / `layout.maxWidth` に `16px` のような実測値を書くと gate が落ちる。mock の CSS custom property を逆引きして `var(--space-3)` のような token 名を書き、逆引き不能なら当該 key を省いて実測値は `evidence` に残す。**逆引きの辞書は design system の見本 page**（凍結 export に混ざって届く）— token 名・値・用途がそこに並ぶので、同値の token を取り違えずに引ける。実測 px の突合は pp/ のテストの担当であり、AST の担当ではない
- **`uncertainNodes` は裁定論点として報告する** — 低信頼 node を黙って確定させない。`reason` と `alternatives` を書いて `uncertainNodes` に載せ、ターン末尾でユーザーに提示する。意匠差分の裁定が要る場合の台帳は `docs/presentation/ui-mock/DESIGN-POLICY.md`
- **採取していない状態を書かない** — 状態・responsive 差分・hidden 判定は、採取した証拠がある範囲だけ書く。1 viewport だけの採取から breakpoint 差分を推測しない
- **design system の見本 page から screen AST を起こさない** — 凍結 export には画面でない見本 page が混ざる（`docs/presentation/ui-mock/README.md`）。これは route にならないので screen AST の対象外で、使うのは部品語彙と token 辞書としてである
- **class 名を component 名として採用しない** — mock の class は意匠都合の名前であり、canonical な部品名ではない。意味は tag / role / aria / text / 構造から起こす
- **CSS selector は `source.nodeRef` に書く** — schema の `source` は `kind` / `region` / `file` / `nodeRef` のみを許す。selector 用の独自 key を足すと schema error になる
- **slug を一致させる（AST106）** — `screen.name` = `<slug>`、`screen.provenance.mockFile` = 凍結した export の相対 path（file 名の最初の dot までが `<slug>` と一致すればよい）。`sha256` は `mock-baseline.sha256` に記録された当該 export の値をそのまま使う

## Output

- 成果物: `docs/presentation/ui-ast/screens/<slug>.ui-ast.json` — v0.2 schema 準拠 JSON のみ（前後に散文を付けない）
- 報告: gate 結果（`ast_validate` の緑）、`coverage` の 2 値、`uncertainNodes` の裁定論点、未カバー領域

## Related

- `20-macro-pass.md`（本 skill dir 内） — 大領域抽出の pass 指示
- `30-leaf-pass.md`（本 skill dir 内） — 部品候補抽出の pass 指示
- `40-reconcile-pass.md`（本 skill dir 内） — v0.2 確定の pass 指示
- `mock-freeze` — 抽出の前提になる凍結手順
- `design-order` — mock 側を直す必要が出たときの発注手順
