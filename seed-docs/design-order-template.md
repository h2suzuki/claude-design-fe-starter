# Claude Design 発注規約 — 持ち込み 1 枚

## 位置づけ

- docs/ の 5 本 (ui-quality-policy / pixel-perfect / design-sync / ui-caveats / ast-layer) は repo / agent 側の規約であり、Claude Design には持ち込まない
- Claude Design に持ち込むデザイン規約は、この 1 枚に凝縮する。発注文への組み込みは /design-order が行う
- 下の block の数値 (390 / 1280 / 44px) は例。pp/src/config.ts で確定した基準 viewport と一致させてから使う

## day-0 で Claude Design に持ち込む 4 点

1. プロダクト概要 1 枚 (目的・対象ユーザー・トーン・モバイルファースト宣言)
2. brand 素材 (色・ロゴ・タイポ。無ければ Claude Design に提案させ、ユーザーが裁定する)
3. 参考 screenshot 2–3 枚 (好みの UI 方向を示す)
4. 本発注規約 (下の block)

## 発注規約 (そのまま貼る)

```text
【{{PRODUCT_NAME}} デザイン発注規約】
1. 320〜1920px で成立する単一レスポンシブ HTML で作る。基準幅は 390 (mobile・第一) と
   1280 (desktop・第二)。幅別に別 mock を作らない
2. 部品ごとに default / focus / disabled / loading / error / empty / 長文 の状態一式を
   preview で並べる
3. touch target は 44px 以上。hover でしか到達できない操作を作らない
4. 同じ見た目は同じ部品。似た部品を別々に描かない
5. 状態間で部品の外形寸法を変えない。出現・消滅しうる要素は空間を事前に確保し、
   文言が切り替わる領域は最長文言の寸法で確保する
6. スクロールバーは常時表示か常時非表示のどちらかに固定する
7. 意味色は名前付きパレットで定義する。同じ色でも意味が違えば別名を与える。
   色コードの直書きは禁止
8. UI に実装説明文を置かない。説明が必要になる挙動はデザイン側を直す
9. 括弧は、全角（）は前後密着・半角 () は前後に半角空白が既定。最終判断は mock 上の見た目
10. export は Claude Design の外で描画できる形にする (同梱 runtime + 相対 path。
    ビルド手順を要する形にしない)。単一ファイル化は求めない
11. 画面が使う画像は export に同梱する。外部 URL の参照で代替しない
```

## 補足

- 項目 5 の狙いはレイアウトシフトをデザイン段階で殺すこと。実装後に直すより桁違いに安い
- 項目 7 は tokens の発注要件でもある。パレット名がそのまま frontend/src/lib/ui/tokens/tokens.css の token 名の母体になる
- 各項目は repo 側の検証 (pp/ の parity・sweep、docs/ の規約) と対になっており、mock 段階で守られていないと FE 実装の gate で必ず検出される
