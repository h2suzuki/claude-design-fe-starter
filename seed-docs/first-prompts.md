# Claude Design 初回プロンプト例文と定常作業

事前に seed-docs/design-order-template.md の「day-0 で持ち込む 4 点」を準備しておく。

## (a) design system 生成

design-system 型 project を新規作成して投げる。publish すると org の新規 project に自動適用される (公式メカニズム)。

> {{PRODUCT_NAME}}（プロダクト概要添付）の design system を作ってください。モバイルファースト（基準 390px・320〜1920 で成立）。まず tokens（色・タイポ・spacing・radius）、次に基礎部品（Button / Input / Card / リスト行 / AppBar / Tab / Bottom sheet / 空状態バンド）を、部品ごとに default・focus・disabled・loading・error・empty・長文の状態違いを並べた preview で。touch target は 44px 以上。hover でしか到達できない操作は作らない。

出力はユーザーが裁定する (色・トーンはここで確定) → publish。

⚠️ design system は org 単位の資産。同一 org で複数の design system を並走させる場合の切替・スコープ挙動は未確認 — 設定時に実地で確認する。

## (b) 最初の画面 mock

通常 project を新規作成する (作成時に design system を自動継承)。発注文には seed-docs/design-order-template.md の発注規約 block を添える (/design-order が組み立てる)。

> 画面 {{SCREEN_NAME}}（要件添付）を design system の部品だけで組んでください。新しい部品が必要になったら、先に部品として states 込みで提示してから画面に合成。320〜1920 の単一レスポンシブ HTML で、mobile では {{MOBILE_LAYOUT}}、desktop では {{DESKTOP_LAYOUT}} の配置。完成したら standalone HTML で export できる形に。

## 定常作業

| 場面 | やり方 |
|---|---|
| mock 修正 | 構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集。公式の 3 手段を使い分ける |
| 完成 | 完成宣言 → standalone HTML export → /mock-freeze で docs/presentation/ui-mock/ へ凍結 + sha256 pin → FE 実装 → parity (seed-docs/screen-loop.md) |
| 新部品の昇格 | mock 中に生まれた新部品は design system 側へ登録させる。mock project 内に孤立させない |
| 実装済み部品への置換 | FE 実装が確定した部品は、実装から生成した preview HTML を tools/design_sync でライブラリへ書き戻し、Design 生成の「想像部品」を「実装済み部品」へ順次置換する。以後 Claude Design は実物部品で新画面を組む = mock と実装の乖離が構造的に縮む |
| push 後の検証 | ライブラリへ push したら再取得して SHA-256 照合 (docs/design-sync.md の fetch / verify 運用。対象 project は環境変数 DESIGN_PROJECT_ID で指定) |
