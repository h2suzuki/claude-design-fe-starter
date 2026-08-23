# docs/presentation/ui-mock — mock 凍結置き場

Claude Design で承認された mock の凍結コピーと、その出所を機械照合するための sha256 台帳を置く。ここが FE 実装と parity 検証の唯一の突合先。運用の背景は `docs/design-sync.md`。

```text
docs/presentation/ui-mock/
├── export/               凍結した standalone HTML export（+ 共有 JS/CSS/フォント）
├── screenshots/          承認時点の参照スクリーンショット（基準 viewport ごと）
├── mock-baseline.sha256  export/ 全ファイルの sha256 台帳（provenance pin）
└── DESIGN-POLICY.md      KEEP_IMPL 台帳（mock と実装の意図的差分・日付付き裁定のみ）
```

## 凍結手順（/mock-freeze skill が案内する内容）

1. Claude Design 上でユーザーが mock の完成を宣言する
2. standalone HTML export を取得し、`export/` へ相対 path を保って逐語保存する（整形・切詰め・末尾改行の増減なし）。取得経路は 2 つあり、どちらでも以降の gate は変わらない
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
