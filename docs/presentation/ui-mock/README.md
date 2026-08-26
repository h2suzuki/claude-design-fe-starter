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

## 凍結手順（/mock-freeze skill が案内する内容）

1. Claude Design 上でユーザーが mock の完成を宣言する
2. export 一式を取得し、`export/` へ相対 path を保って逐語保存する（整形・切詰め・末尾改行の増減なし。入れる集合は下の「export/ に入れる集合」）。取得経路は 2 つあり、どちらでも以降の gate は変わらない
   - **project 経由**: `tools/design_sync fetch`（要 `DESIGN_PROJECT_ID`）または DesignSync tool
   - **受け取り**: ユーザーから export 一式（zip 等）を受け取って展開する。この場合 `tools/design_sync verify` による Claude Design との再照合と、実装済み部品のライブラリ書き戻しは使えない — 突合先の出所は sha256 台帳だけが担う
3. 基準 viewport ごとの参照スクリーンショットを `screenshots/` へ保存する
4. sha256 台帳を更新する（.gitkeep 除外・空白名安全）:

   ```bash
   cd docs/presentation/ui-mock
   find export -type f ! -name .gitkeep -print0 | sort -z | xargs -0 sha256sum > mock-baseline.sha256
   sha256sum --check --quiet mock-baseline.sha256
   ```

5. `pp/` の provenance テストで台帳と実体の一致を確認してから commit する

## 規律

- `export/` 配下は凍結資産。直接編集は禁止（hook が Edit/Write を block する）。変更は Claude Design 側で行い、再 export → 再凍結する
- 台帳と実体の不一致は「突合先のドリフト」であり、検証全体を無効化する。commit 前 hook が sha256 照合とファイル集合の突合（台帳未登録の追加・実体の欠落を含む）で検出する
- mock は 320〜1920 で成立する単一レスポンシブ HTML を要件とする（幅別の別 mock を置かない）
