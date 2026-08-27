# Claude Design 初回プロンプト例文と定常作業

事前に seed-docs/design-order-template.md の「day-0 で持ち込む 4 点」を準備しておく。

## (a) design system 生成

design-system 型 project を新規作成して投げる。publish すると org の新規 project に自動適用される (公式メカニズム)。

> {{PRODUCT_NAME}}（プロダクト概要添付）の design system を作ってください。モバイルファースト（基準 390px・{{MIN_WIDTH}}〜{{MAX_WIDTH}} で成立）。まず tokens（色・タイポ・spacing・radius）、次に基礎部品（Button / Input / Card / リスト行 / AppBar / Tab / Bottom sheet / 空状態バンド）を、部品ごとに default・focus・disabled・loading・error・empty・長文の状態違いを並べた preview で。touch target は 44px 以上。hover でしか到達できない操作は作らない。

出力はユーザーが裁定する (色・トーンはここで確定) → publish。

⚠️ design system は org 単位の資産。同一 org で複数の design system を並走させる場合の切替・スコープ挙動は未確認 — 設定時に実地で確認する。

## (b) 最初の画面 mock

通常 project を新規作成する (作成時に design system を自動継承)。発注文には seed-docs/design-order-template.md の発注規約 block を添える (/design-order が組み立てる)。

> 画面 {{SCREEN_NAME}}（要件添付）を design system の部品だけで組んでください。新しい部品が必要になったら、先に部品として states 込みで提示してから画面に合成。{{MIN_WIDTH}}〜{{MAX_WIDTH}} の単一レスポンシブ HTML で、mobile では {{MOBILE_LAYOUT}}、desktop では {{DESKTOP_LAYOUT}} の配置。完成したら export 一式（画面 HTML + 共有 JS/CSS/フォント/画像）を書き出せる形に。

## (c) 既存 mock の修正

修正依頼には**発注規約 block も完成後の流れも添えない**。規約は (a)(b) で渡してあり、修正依頼に再掲すると規約を根拠にデザイン全体へ手が入る。export はユーザーが Claude Design の画面で行う操作なので、依頼文ではなく下の「発注側メモ」に書く。

貼る文はこの形にする。

> 既存 mock の修正 {{FIX_COUNT}} 件です。意匠は変えないでください。
>
> 1. **{{SCREEN_NAME}}** — 現状: … / 不都合: … / 直し方: …
> 2. …
>
> 修正は上記 {{FIX_COUNT}} 点に限定し、他の画面・部品の見た目・構造・文言は変えないでください。

書き方の規律:

- **値の割れは発注側が決めない**。「A と B で値が違うので、どちらが意図かを決めて統一してください」と書く。こちらで「B に揃えて」と指定すると、意匠の決定を発注側が奪うことになる
- 現状は **file 名・行番号・実測値**で書く。「なんとなく崩れている」では直す対象が定まらない
- 不都合は**見えている事象**で書く（はみ出す・重なる・読めない）。原因の推測を書かない — 直し方はデザイン側が決める
- 1 依頼 = 1 回の再 export。項目が増えて意匠の作り直しになりそうなら、(b) として別に発注する

### 発注側メモ（依頼文には貼らない）

- export の受け取りと再凍結は `docs/presentation/ui-mock/README.md` の凍結手順。sha256 台帳が変わる
- 修正が入った画面は AST を採り直す（`/ast-extract`）。凍結が変われば AST の provenance も変わる
- 参照スクショも撮り直す（凍結手順のとおり `export/` の全画面分）

## 定常作業

| 場面 | やり方 |
|---|---|
| mock 修正 | 構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集。公式の 3 手段を使い分ける。依頼文は上の (c) の形で書く |
| 完成 | 完成宣言 → export 一式の取得 → /mock-freeze で docs/presentation/ui-mock/ へ凍結 + sha256 pin → FE 実装 → parity (seed-docs/screen-loop.md) |
| 新部品の昇格 | mock 中に生まれた新部品は design system 側へ登録させる。mock project 内に孤立させない |
| 実装済み部品への置換 | FE 実装が確定した部品は、実装から生成した preview HTML を tools/design_sync でライブラリへ書き戻し、Design 生成の「想像部品」を「実装済み部品」へ順次置換する。以後 Claude Design は実物部品で新画面を組む = mock と実装の乖離が構造的に縮む |
| push 後の検証 | ライブラリへ push したら再取得して SHA-256 照合 (docs/design-sync.md の fetch / verify 運用。対象 project は環境変数 DESIGN_PROJECT_ID で指定) |
