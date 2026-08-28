# Claude Design 発注規約 — 持ち込み 1 枚

## 位置づけ

- docs/ の 6 本 (ui-quality-policy / pixel-perfect / design-sync / ui-caveats / ast-layer / stack) は repo / agent 側の規約であり、Claude Design には持ち込まない
- Claude Design に持ち込むデザイン規約は、この 1 枚に凝縮する。発注文への組み込みは /design-order が行う
- 下の block の `{{...}}` は、`pp/src/config.ts` で確定した基準 viewport と `SWEEP_WIDTHS` の下限・上限で埋める。**発注した幅の範囲がそのまま検証される範囲**なので、片方だけ変えない

## day-0 で Claude Design に持ち込む 4 点

1. プロダクト概要 1 枚 (目的・対象ユーザー・トーン・モバイルファースト宣言)。**そのまま貼れる形は `seed-docs/first-prompts.md` の「1 通目」**
2. brand 素材 (色・ロゴ・タイポ。無ければ Claude Design に提案させ、ユーザーが裁定する)
3. 参考 screenshot 2–3 枚 (好みの UI 方向を示す)
4. 本発注規約 (下の block)

## 発注規約 (そのまま貼る)

```text
【{{PRODUCT_NAME}} デザイン発注規約】
1. {{MIN_WIDTH}}〜{{MAX_WIDTH}}px で成立する単一レスポンシブ HTML で作る。基準幅は
   {{MOBILE_WIDTH}} (mobile・第一) と {{DESKTOP_WIDTH}} (desktop・第二)。幅別に別 mock を作らない
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
11. 画面が使う画像とフォントは export に同梱する。外部 URL の参照で代替しない
12. export の file 名は英小文字・数字・ハイフンだけで付ける (画面名に空白・大文字・
    日本語を使わない)
13. 画面全体に効く表現規則 (見出しと本文の折り返し方・字間・行送りの既定) は、部品と
    同じく design system に明記する。特定の画面にだけ効く暗黙の規則を作らない
14. favicon と app icon の元画像を、正方形・余白込み・単色背景で渡す (透過 PNG または
    SVG)。小寸法で潰れない字画にする — 16px でも判別できることを確認する
15. 本文の最小サイズ・行間・最小ウェイトを数値で書く。細いウェイトは使わない
16. 画面内アイコンの規則を書く (線の太さ・色の取り方・絵文字の可否・外部リンクを示す形)。
    favicon とは別の話である
17. テーマを複数持つなら、全ての意味色をテーマごとの値で定義し、切替の永続化先と初期値も
    書く。片方のテーマだけで色を決めない
18. 要件書に文言・表記のルールがあれば design system へ転記する。使う表現と使わない表現を
    対で書く
```

## 補足

- 項目 5 の狙いはレイアウトシフトをデザイン段階で殺すこと。実装後に直すより桁違いに安い
- 項目 7 は tokens の発注要件でもある。パレット名がそのまま frontend/src/lib/ui/tokens/tokens.css の token 名の母体になる
- 項目 12 は AST の制約。画面 slug は `^[a-z0-9][a-z0-9-]*$` で、export の file 名から採る。ここが崩れると screen AST を起こせず、parity の対応表も作れない
- 項目 14 は mock に現れない要件。favicon は画面の意匠に出ないので mock を見ても存在に気づかず、実装で「元画像が写真しかない」と分かる。写真から起こすと 16px で潰れる
- 項目 13 は実地で踏んだ穴。mock の page 全体に効いていた折り返し規則が design system に無く、実装が拾えないまま「gate は全部緑・見た目は 1 文字ずれ」になった。規則は言葉だけでなく **CSS 断片で書かせる** — `h1,h2,h3{text-wrap:pretty}` のように書いてあれば実装がそのまま拾える
- 項目 15 は touch target (項目 3) と同種の下限。本文サイズと行間は後から上げると全画面のレイアウトが動くので、mock の段階で決める
- 項目 16 の受け皿は `docs/presentation/ui-mock/README.md` の「icon / logo 規則は受入時の checklist にする」。発注で要求しておかないと、checklist の突合先が無い
- 項目 17 を落とすと片テーマ分の token しか出ず、後からもう一方を足すときに全色を決め直すことになる。切替の永続化は全タブ共有が正しい設定なので localStorage でよい (`docs/ui-caveats.md` タブ毎の状態)
- 項目 18 の受け皿も受入 checklist。文言規則が design system に無いと、画面ごとに表記が割れても mock 側の正が無い
- 各項目は repo 側の検証 (pp/ の parity・sweep、docs/ の規約) と対になっており、mock 段階で守られていないと FE 実装の gate で必ず検出される
