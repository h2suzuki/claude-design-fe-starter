# vendor — mock/app が参照する外部資産の同梱置き場

検証中の CDN 取得は禁止（`pp/src/net-block.ts` が全外部アクセスを abort する）。mock の描画に外部資産（フォント・JS ライブラリ等）が必要なら、host 側で 1 回だけ取得してここへ置き、`routes.json` に URL→ファイルの対応を登録する。

- 資産の実体は gitignore 済み（この README と `routes.json` のみ追跡）。取得コマンドを本ファイルへ記録し、誰でも再取得できる状態を保つ
- `routes.json` が唯一の許可源。net-block の route と `bun run lint:mock` の許可判定が同じ台帳を読むので、登録すれば両方が同時に通る
- フォントは anti-aliasing を byte 安定にするため必ず同梱する。mock 発注時に画像の同梱を要件化していれば（発注規約 項目 11）、vendor 化が要るのはフォントと runtime に絞られる
- 資産の過不足は `bun run lint:mock`（外部参照検出）と実行時の net-block abort（登録漏れが loud に失敗）で検出される

## 取得コマンドの記録（PJ で追記していく）

```bash
# 例: フォントの同梱
# mkdir -p fonts && curl -fsSL -o fonts/YourFont.woff2 "https://fonts.gstatic.com/..."
```
