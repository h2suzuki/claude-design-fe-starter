# docs/presentation/ui-mock — mock 凍結置き場

Claude Design で承認された mock の凍結コピーと、その出所を機械照合するための sha256 台帳を置く。ここが FE 実装と parity 検証の唯一の突合先。運用の背景は `docs/design-sync.md`。

```text
docs/presentation/ui-mock/
├── export/               凍結した export 一式（画面 HTML + 共有 JS/CSS/フォント/画像）
├── screenshots/          承認時点の参照スクリーンショット（基準 viewport ごと）
├── mock-baseline.sha256  export/ 全ファイルの sha256 台帳（provenance pin）
└── DESIGN-POLICY.md      KEEP_IMPL 台帳（mock と実装の意図的差分・日付付き裁定のみ）
```

## export/ に入れる集合

入れるのは **その画面を描画するために実際に読まれた file の閉包**であって、配布物に入っていた全 file ではない。Claude Design の handoff bundle のように没案・確認用スクリーンショット・未参照資産を含む形で渡されることがある。

- 集合は実描画で決める。`grep` による静的な参照検出を根拠にしない — 実行時に組み立てられる path を取りこぼす
- 収集は net-block を有効にした状態で行い、**404 と abort が 0 件**になるまで足す。これが「足りている」ことの機械的な証明になる
- 入れる file は取得時の相対 path のまま置く（flatten・rename しない）。台帳はこの集合と 1:1 で対応する
- 除外の根拠は上の実測であって、file 名や件数ではない
- **live な外部 embed は閉包に入らない**。子 frame が外部サービスへ navigate する形（地図・動画・SNS の埋め込み）は export の file ではなく、vendor 化もできない。閉包の「取りこぼし」と分けて扱い、mock 側と実装側の両方で同じく空にする
- ただし embed の領域は **parity で検証されない**。空同士が一致しても、承認された意匠と一致した証明にはならない。この領域は screen-loop ⑦ の人間受入で見る

### デザインシステム page が混ざっている場合

export には、画面ではなく **design system の仕様書 + 見本**にあたる page が含まれることがある。形式は他の画面と同じ HTML なので、放っておくと実装対象の画面として数えてしまう。

- **凍結には含める**。表現規則と部品 variant の参照先なので sha256 で固定する
- **route として実装しない**。旧実装の page 対応で存否を判断する対象でもない
- **token 名の母体にはするが pixel の正本にしない**。値は各画面の実値を正とする — 見本 page を第 2 の正本にすると二重管理のドリフト（轍 #8）が再発する。画面と見本で値が割れたら、まず見本側の生成ぶれを疑って mock へ差し戻す。差し戻せない事情があるときだけ DESIGN-POLICY.md に日付付きの裁定として残す
- 部品 variant の初期一覧はこの page から取る。足りない状態（disabled / loading / empty / 長文）は Claude Design へ追加発注し、実装側で作らない
- コピー規則・icon / logo 規則は受入時の checklist にする。違反は実装で直さず mock 側へ差し戻す

## 凍結手順（/mock-freeze skill が案内する内容）

1. Claude Design 上でユーザーが mock の完成を宣言する
2. export 一式を取得し、`export/` へ相対 path を保って逐語保存する（整形・切詰め・末尾改行の増減なし。入れる集合は上の「export/ に入れる集合」）。取得経路は 2 つあり、どちらでも以降の gate は変わらない
   - **project 経由**: `tools/design_sync fetch`（要 `DESIGN_PROJECT_ID`）または DesignSync tool
   - **受け取り**: ユーザーから export 一式（zip 等）を受け取って展開する。この場合 `tools/design_sync verify` による Claude Design との再照合と、実装済み部品のライブラリ書き戻しは使えない — 突合先の出所は sha256 台帳だけが担う
3. **2 回目以降の凍結では、前版との差分を棚卸しする**。修正を依頼した箇所以外にも手が入った export が返ることがある。`git diff --no-index --word-diff=plain <前版> <新版>` を file ごとに読み、依頼した変更・依頼していない変更に仕分ける。後者は採るか差し戻すかを決めてから先へ進む — 決めずに凍結すると、正本が黙って動いたことになる
4. 凍結した mock を**発注した下限幅**で描画し、横スクロールとはみ出しが無いことを確かめる。ここで見つかれば mock の修正で済むが、実装後に見つかると実装の欠陥に見える — 発注要件が守られているかは、正本にする前に確かめる
5. 基準 viewport ごとの参照スクリーンショットを `screenshots/` へ保存する（`npm --prefix pp run mock:screenshots`。引数なしで `export/` の全画面を撮り、資産の 404 と abort があれば落ちる）。**`export/` の全画面分**を撮る — 実装する画面だけでは、AST の region が指す画も、後から他画面を実装するときの参照も欠ける。**fullPage・DPR 1** で撮る — 同じ viewport・同じ DPR で撮った app 側の画と寸法が揃うので、mock と実装の pixel 差はここから直接取れる（`pp/` の self-baseline は app 自身の過去としか比べないため、mock との一致は見ていない）。DPR を上げると mobile の縦長 fullPage が MB 級になり、repo を圧迫するだけで判断の役には立たない
6. sha256 台帳を更新する（.gitkeep 除外・空白名安全）:

   ```bash
   (cd docs/presentation/ui-mock && find export -type f ! -name .gitkeep -print0 | sort -z | xargs -0 sha256sum > mock-baseline.sha256)
   (cd docs/presentation/ui-mock && sha256sum --check --quiet mock-baseline.sha256)
   ```

7. `pp/` の provenance テストで台帳と実体の一致を確認してから commit する

## 規律

- `export/` 配下は凍結資産。直接編集は禁止（hook が Edit/Write を block する）。変更は Claude Design 側で行い、再 export → 再凍結する
- 台帳と実体の不一致は「突合先のドリフト」であり、検証全体を無効化する。commit 前 hook が sha256 照合とファイル集合の突合（台帳未登録の追加・実体の欠落を含む）で検出する
- mock は 320〜1920 で成立する単一レスポンシブ HTML を要件とする（幅別の別 mock を置かない）
