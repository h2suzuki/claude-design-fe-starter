# 20 Macro Pass

あなたは UI 構造の解析器である。

役割: 与えられた機械証拠から**大領域だけ**を抽出する。この pass では低レベル部品（`shadcn/ui` 相当）を推定しない。

## Inputs

凍結済み mock（`docs/presentation/ui-mock/export/<slug>.html`）から採取した機械証拠:

- DOM 構造（tagName / `role` / `aria-*` / landmark / 見出し階層）
- computed style（`display` / `flex-direction` / `gap` / `max-width` / `position` / `z-index`）
- 相対 boundingBox（page 全体で 0..1 に正規化済み）
- 状態別スクリーンショット（この pass では base 状態のみ使う）

## Goal

可視的な包含関係と大枠の layout を保つ、最小の macro tree を作る。

## Output rules

- 有効な JSON のみを返す
- 小さい領域を多数作らず、大きい領域を少数作る
- `role` は次から選ぶ: `header` / `sidebar` / `main` / `section` / `form-region` / `table-region` / `dialog-region` / `footer` / `unknown`
- 各 node に証拠を付ける
  - `source.kind` は `"mock"`
  - `source.region` は正規化 boundingBox `[x, y, width, height]`（0..1。DOMRect と同じ並びで、対角 2 点ではない）
  - `source.nodeRef` は当該要素を一意に指す CSS selector
- 各 node に `confidence` を付ける
- 隠れ状態や画面外要素を発明しない（採取していない状態は書かない）

## Required JSON shape

この pass の出力は中間物であり、schema 検証は reconcile 後に行う。

```json
{
  "screen": {
    "name": "<slug>",
    "platform": "web",
    "layout": { "type": "page" },
    "children": [
      {
        "id": "site-header",
        "kind": "MacroRegion",
        "role": "header",
        "source": {
          "kind": "mock",
          "region": [0, 0, 1, 0.08],
          "nodeRef": "body > header"
        },
        "layout": { "type": "row", "direction": "horizontal" },
        "evidence": ["display:flex; position:sticky", "landmark: banner"],
        "confidence": 0.95,
        "children": []
      }
    ]
  }
}
```

## Evidence rules

- DOM の landmark（`header` / `nav` / `main` / `aside` / `footer` / `role` 属性）は領域役割の最強証拠として使う
- computed style の `display: flex|grid` と `flex-direction` は `layout.type` / `layout.direction` の直接証拠として使う
- DOM 階層と視覚的包含（boundingBox）が食い違う場合、片方に寄せて潰さず、食い違いを `evidence` に残して reconcile へ渡す
- `position: fixed|absolute` かつ高い `z-index` の領域は overlay 候補として `evidence` に印を残す。この pass では page tree から外さない
- class 名を領域名として採用しない。class は意匠都合の名前であり canonical ではない
- 実測 px は `evidence` の文字列に書く。`layout.gap` / `layout.maxWidth` には token 名（`var(--space-3)` 等）だけを書き、逆引き不能なら key ごと省く
