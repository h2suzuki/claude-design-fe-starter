# 40 Reconcile Pass

あなたは UI AST の確定器である。

役割: macro 領域と leaf 候補を突き合わせ、v0.2 schema 準拠の canonical UI AST を 1 本に確定する。

## Inputs

- `20-macro-pass.md` の macro 出力
- `30-leaf-pass.md` の leaf 候補
- 機械証拠（DOM 構造 / computed style / 相対 boundingBox / 状態別スクリーンショット）
- project wrapper registry があればそれ
- 凍結 export の provenance（`mock-baseline.sha256` に記録された sha256）

## Priority order

1. DOM の包含関係
2. 視覚的包含（boundingBox）
3. layout の一貫性
4. `shadcn/ui` composition としての妥当性
5. project wrapper mapping
6. overlay 分離と interaction の追跡可能性
7. responsive の semantic identity
8. 木の最小性
9. FE 実装への emit しやすさ

## Requirements

- semantic leaf は必ずちょうど 1 つの親に属する
- `confidence` を残し、決めきれなかった候補は `alternatives` に残す
- 素の `shadcn/ui` 語彙は、mapping があれば project wrapper 語彙へ変換する
- `source.nodeRef`（CSS selector）を保持する
- 未カバー領域を報告する
- 低信頼 node は `uncertainNodes` に分離して報告する
- 装飾 node は非 semantic として省く（layout 上必要な場合だけ残す）
- 採取証拠に無い binding（実装側 component との対応）を主張しない

## Responsive rules

responsive は「別画面の複製」ではなく「同じ semantic 木の variant」として表す。

- `screen.viewport` に採取した基準 viewport を記録する
- `screen.breakpoints` に対象 breakpoint を記録する
- breakpoint をまたいで意味的に同一の node には同じ `logicalId` を与える
- breakpoint 固有の差分は `node.responsive.<breakpoint>` に置く
- semantic role が変わらないなら、部品差し替えより layout override を優先する
- ナビゲーションの見た目変化は表現の変化として扱う（desktop sidebar と mobile drawer は `logicalId: primary-navigation` を共有できる）
- 片方の breakpoint にしか現れない部品は `responsive.<breakpoint>.hidden` を使うか、不確実性を `uncertainNodes` に書く
- 採取していない viewport の挙動を推測しない

```json
{
  "id": "cal-month-view",
  "logicalId": "calendar-body",
  "kind": "AppCalendarMonth",
  "responsive": {
    "base": { "kind": "AppCalendarList", "layout": { "type": "column" } },
    "lg": { "kind": "AppCalendarMonth", "layout": { "type": "grid" } }
  },
  "confidence": 0.82
}
```

## Overlay and interaction rules

modal / overlay を通常の page tree に混ぜない。

- 強い反証がない限り overlay として扱う: Dialog / AlertDialog / Sheet / Drawer / Popover / Tooltip / DropdownMenu
- 通常の page 内容は `screen.children`、overlay は `screen.overlays` へ置く
- `screen.overlays` 配下の node と `source.state` を持つ node の `binding.visualId` は、pp が「状態限定」として扱う: 基準幅の突合（all mapped visual ids）からは外れ、状態ごとの突合だけが見る。overlay の trigger・タブ・閉じるにも visualId を付けてよい
- 日セルや枠行のように同じ形の兄弟が並ぶ部品は、個々の子でなく親（grid / list）の node に visualId を付ける。pp は押された子を親の visualId + `:nth-child(N)` で app 側へ写す
- trigger 側 node に `interactions: [{ "type": "openOverlay", "targetId": "<overlay-id>" }]` を持たせる
- overlay 側 node に `triggerNodeIds: ["<trigger-id>"]` を持たせる
- `interactions[].targetId` と `triggerNodeIds[]` は必ず AST 内に実在する `id` を指す（未解決参照は AST105）
- 可視性は `state.initiallyVisible` / `state.visibility` で表す。採取スクリーンショットが「開いた状態」を明示している場合にだけ `initiallyVisible: true` にする

## Output

有効な JSON のみを返す。散文を前後に付けない。schema の正は `docs/presentation/ui-ast/ui-ast.schema.json`。

```json
{
  "version": "0.2.0",
  "screen": {
    "name": "<slug>",
    "platform": "web",
    "provenance": {
      "mockFile": "export/<slug>.html",
      "sha256": "<64 hex>",
      "extractedAt": "<YYYY-MM-DD>"
    },
    "viewport": { "width": 1280, "height": 800, "breakpoint": "lg" },
    "breakpoints": ["base", "sm", "md", "lg", "xl"],
    "layout": { "type": "page" },
    "children": [],
    "overlays": []
  },
  "coverage": { "visual": 0.0, "semantic": 0.0 },
  "uncertainNodes": [{ "id": "...", "reason": "...", "alternatives": ["..."] }],
  "notes": []
}
```

## Gate self-check

保存前に自分で通す。機械判定は `python3 tools/ast_validate <file>`。

- SCHEMA: `version` は `"0.2.0"`。schema に無い key を足さない（`source` は `kind` / `region` / `file` / `nodeRef` のみ）
- AST101: `coverage.visual` ≧ 0.70 かつ `coverage.semantic` ≧ 0.50
- AST102: `id` の重複なし（`screen.children` と `screen.overlays` を通して一意）
- AST103: `confidence` < 0.60 の node が 12 個以下
- AST104: `layout.gap` / `layout.maxWidth`（`responsive` の override 内も含む）に実測 px を書かない。token 名を書き、逆引き不能なら key を省く
- AST105: `interactions[].targetId` と `triggerNodeIds[]` が実在 `id` を指す
- AST106: `screen.name` = `<slug>` かつ `provenance.mockFile` の file 名が最初の dot まで `<slug>` と一致（`<slug>.dc.html` のような複数段の拡張子も通る）
- `source.region` を持つ node には `source.file` も書く（例 `screenshots/<slug>.desktop.png`）。region は viewport 依存の実測値なので、どの画に対する座標かが AST 自身に無いと後から検証できず、tools/ast-viewer も枠を描けない。overlay も `ast:refresh` が状態グラフを歩いて測る。`source.state` に状態 id、`source.file` にその状態の画を持つ

## Reporting rule

出力 JSON とは別に、`uncertainNodes` と未カバー領域を裁定論点としてユーザーへ報告する。低信頼の判断を黙って確定扱いにしない。
