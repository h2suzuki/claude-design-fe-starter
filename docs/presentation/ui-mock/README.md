# docs/presentation/ui-mock — mock 凍結置き場

Claude Design で承認された mock の凍結コピーと、その出所を機械照合するための sha256 台帳を置く。ここが FE 実装と parity 検証の唯一の突合先。運用の背景は `docs/design-sync.md`。

```text
docs/presentation/ui-mock/
├── export/               凍結した export 一式（画面 HTML + 共有 JS/CSS/フォント/画像）
├── screenshots/          承認時点の参照スクリーンショット（基準 viewport ごと）
├── states/               操作で到達できる状態と辺の凍結グラフ（画面ごと）。`ast:refresh` と `mock:integrity` はこのグラフを歩いて overlay の中も測る
├── mock-baseline.sha256  export/ 全ファイルの sha256 台帳（provenance pin）
└── DESIGN-POLICY.md      KEEP_IMPL 台帳（mock と実装の意図的差分・日付付き裁定のみ）
```

## export/ に入れる集合

入れるのは **その画面を描画するために実際に読まれた file の閉包**であって、配布物に入っていた全 file ではない。Claude Design の handoff bundle のように没案・確認用スクリーンショット・未参照資産を含む形で渡されることがある。

- 集合は実描画で決める。`grep` による静的な参照検出を根拠にしない — 実行時に組み立てられる path を取りこぼす
- 収集は `bun run --cwd pp mock:closure` が行う（引数なしで `export/` の全画面を基準 2 viewport で描画し、読まれた file の集合・外部 embed・取りこぼしを `pp/artifacts/mock-closure.json` へ書く）
- net-block を有効にした状態で回し、**404 と abort が 0 件**になるまで足す。これが「足りている」ことの機械的な証明になり、0 件になるまで tool は exit 1 で落ちる
- 入れる file は取得時の相対 path のまま置く（flatten・rename しない）。台帳はこの集合と 1:1 で対応する
- 除外の根拠は上の実測であって、file 名や件数ではない
- **live な外部 embed は閉包に入らない**。子 frame が外部サービスへ navigate する形（地図・動画・SNS の埋め込み）は export の file ではなく、vendor 化もできない。閉包の「取りこぼし」と分けて扱い、mock 側と実装側の両方で同じく空にする
- ただし embed の領域は **parity で検証されない**。空同士が一致しても、承認された意匠と一致した証明にはならない。この領域は screen-loop ⑧ の人間受入で見る

### デザインシステム page が混ざっている場合

export には、画面ではなく **design system の仕様書 + 見本**にあたる page が含まれることがある。形式は他の画面と同じ HTML なので、放っておくと実装対象の画面として数えてしまう。

- **凍結には含める**。表現規則と部品 variant の参照先なので sha256 で固定する
- **route として実装しない**。旧実装の page 対応で存否を判断する対象でもない
- **`reference-pages.json` に file 名を書く**。書いた page は画面ではないものとして扱われ、layout 検査（MOCK201/202/203/205 — 見本 page はブラウザで見る画面ではないので横幅や重なりを課さない）・参照スクショ・画面間のリンク文言の突合（MOCK204 — 見本 page は site の導線を持たない）から外れる。宣言が無い / 空なら見本 page は無いものとして全 page を画面として扱う。export に無い名前を書くと落ちる。**token の突合からは外れない** — 下の「pixel の正本にしない」を機械で見る段がこれにあたる
- **token 名の母体にはするが pixel の正本にしない**。値は各画面の実値を正とする — 見本 page を第 2 の正本にすると二重管理のドリフト（轍 #8）が再発する。画面と見本で値が割れたら、まず見本側の生成ぶれを疑って mock へ差し戻す。差し戻せない事情があるときだけ DESIGN-POLICY.md に日付付きの裁定として残す
- 部品 variant の初期一覧はこの page から取る。足りない状態（disabled / loading / empty / 長文）は Claude Design へ追加発注し、実装側で作らない
- コピー規則・icon / logo 規則は受入時の checklist にする。違反は実装で直さず mock 側へ差し戻す

## 凍結手順（/mock-freeze skill が案内する内容）

1. Claude Design 上でユーザーが mock の完成を宣言する
2. export 一式を取得する。取得経路は 2 つあり、どちらでも以降の gate は変わらない
   - **project 経由**: `tools/design_sync fetch`（要 `DESIGN_PROJECT_ID`）または DesignSync tool
   - **受け取り**: ユーザーから export 一式（zip 等）を受け取って展開する。この場合 `tools/design_sync verify` による Claude Design との再照合と、実装済み部品のライブラリ書き戻しは使えない — 突合先の出所は sha256 台帳だけが担う
3. `export/` へ相対 path を保って逐語保存する（整形・切詰め・末尾改行の増減なし。編集 gate が Edit/Write を止めるので、配置は cp 等の Bash で行う）
4. 閉包を実測して集合を確定する（`bun run --cwd pp mock:closure`。上の「export/ に入れる集合」）。読まれなかった file は外し、取りこぼしが挙がれば足す
5. **2 回目以降の凍結では、前版との差分を棚卸しする**。修正を依頼した箇所以外にも手が入った export が返ることがある。`git diff --no-index --word-diff=plain <前版> <新版>` を file ごとに読み、依頼した変更・依頼していない変更に仕分ける。後者は採るか差し戻すかを決めてから先へ進む — 決めずに凍結すると、正本が黙って動いたことになる
6. mock 自身の破れを機械で出す（`bun run --cwd pp mock:integrity`。引数なしで `export/` の全画面。`reference-pages.json` の見本 page は layout 検査から外れ、token の突合にだけ入る）。状態グラフがあれば角丸は全状態で集める。出力は 2 つに分かれる:
   - **直してから凍結するもの** — 横スクロール・はみ出した要素・覆われた操作要素・収まらない dialog。見れば壊れているので 1 件でも残さない。ここで見つかれば mock の修正で済むが、実装後に見つかると実装の欠陥に見える
   - **気づき** — 同じ行き先や同じ token が画面ごとに違う言い方をされている。**凍結は止めない**。揃えるかどうかは読んだ人が決める。**機械に揃えさせない** — 短い言い方を長い言い方へ寄せれば layout が壊れることがあり、意匠の基準は文字列の同一性ではなく人が読んで分かることだから（1px の光学補正が要るのと同じ理由）

   厳密さを要求してよいのは **実装が mock を写すとき**で、そこは光学補正ごと 1px 単位で写す。**mock の中の画面どうし**は、どちらも承認済みの意匠なので揃っている必要がない

   | id | 検査 | 見る条件 |
   |---|---|---|
   | MOCK201 | 横スクロールする | `SWEEP_WIDTHS` の全幅 |
   | MOCK202 | はみ出しが始まる要素 | 同上（MOCK201 が出た幅だけ名指しする） |
   | MOCK203 | 操作要素が他の要素に覆われている | 基準 2 viewport・1 画面ぶんずつ送りながら |
   | MOCK204 | 画面間で値が割れている | nav/header/footer のリンク文言と `:root` の custom property |
   | MOCK205 | dialog が viewport に収まらない | 基準 2 viewport・DOM にある dialog を 1 つずつ現して測る |
   | MOCK206 | 画面の角丸が design system に無い | 見本 page の使用値か design-scale.json の宣言と突き合わせ。気づき |

   `design-scale.json` は `docs/presentation/ui-mock/design-scale.json` に `{ "version": "1", "radius": [14, 22, 28, 999] }` の形で置く。置かれていない場合は、`reference-pages.json` で宣言した見本 page が実際に使っている角丸と突き合わせる

   **検査していないもの**: click で初めて mount する dialog（DOM に無いので測れない）、本文中のリンク文言（文脈で言い方が変わってよい）、意匠そのものの良し悪し。これらは screen-loop ⑧ の人間受入で見る
7. 基準 viewport ごとの参照スクリーンショットを `screenshots/` へ保存する（`bun run --cwd pp mock:screenshots`。引数なしで `export/` の全画面を撮り、資産の 404 と abort があれば落ちる（外部 embed の abort は閉包の外なので落とさない）。`reference-pages.json` の見本 page は画面ではないので撮らない）。**`export/` の全画面分**を撮る — 実装する画面だけでは、AST の region が指す画も、後から他画面を実装するときの参照も欠ける。**fullPage・DPR 1** で撮る — 同じ viewport・同じ DPR で撮った app 側の画と寸法が揃うので、mock と実装の pixel 差はここから直接取れる（`pp/` の self-baseline は app 自身の過去としか比べないため、mock との一致は見ていない）。DPR を上げると mobile の縦長 fullPage が MB 級になり、repo を圧迫するだけで判断の役には立たない

7b. 状態グラフを探索する（`bun run --cwd pp mock:states`。overlay など click で現れる状態と辺を凍結する。同じ親の同種候補が 4 つ以上なら先頭と末尾に代表化し、画面 × viewport の時間上限を適用する。上限到達は気づき、再生の非決定は直すもの）

8. sha256 台帳を更新する（.gitkeep 除外・空白名安全）:

   ```bash
   (cd docs/presentation/ui-mock && find export -type f ! -name .gitkeep -print0 | sort -z | xargs -0 sha256sum > mock-baseline.sha256)
   (cd docs/presentation/ui-mock && sha256sum --check --quiet mock-baseline.sha256)
   ```

9. `pp/` で `bun run lint:mock` と provenance テストを実行し、台帳と実体の一致を確認してから commit する。緑の意味は MOCK101〜103 が 0 件であること — MOCK104（重い資産）は凍結を止めず、実装前ヒアリング（`seed-docs/pre-implementation-questions.md` の「重い資産」）へ持ち越す。`lint:mock` が印字するヒアリング文面が、そのまま発注側へ聞く文面になる

## 規律

- `export/` 配下は凍結資産。直接編集は禁止（hook が Edit/Write を block する）。変更は Claude Design 側で行い、再 export → 再凍結する
- 台帳と実体の不一致は「突合先のドリフト」であり、検証全体を無効化する。commit 前 hook が sha256 照合とファイル集合の突合（台帳未登録の追加・実体の欠落を含む）で検出する
- mock は `SWEEP_WIDTHS` の下限〜上限で成立する単一レスポンシブ HTML を要件とする（幅別の別 mock を置かない）
