# 既存実装のある repo へ適用する

本書は `tools/install.sh` を実行した**後**に読む。既に動いている実装を持つ repo を、mock-first の作り方へ段階的に置き換えるまでの進め方を定める。新規 repo で seed を使う場合は本書を飛ばして `seed-docs/walking-skeleton.md` へ進む。

install.sh 自体の入手と実行は seed の README.md に載っている（本書は copy-in 後に repo 内から読める場所に置くため、bootstrap は扱わない）。

## 1. 作業場所 — main を凍結し worktree で作る

既存実装は**動いている資産**であって、置き換えが完走するまで消してはならない。かといって同一 checkout で並走させると、実装と mock 由来の新実装が混ざる。

```bash
git worktree add -b fe-rebuild ../<repo>-fe-rebuild
tools/install.sh ../<repo>-fe-rebuild
```

- `main` は既存実装のまま凍結され、deploy も検証も従来どおり続けられる
- seed が配る 77 file は `fe-rebuild` branch にだけ載る（installer は add-only なので既存 file は 1 つも書き換わらない）
- 置き換えが完走してから branch を統合する。途中で main を触らない

### worktree での path 解決

`git rev-parse --show-toplevel` は **worktree 自身**を返す。使い分けを誤ると「toolchain が無い」という誤診に直結する。

| 対象 | 引き方 | 理由 |
| --- | --- | --- |
| 作業対象（`frontend/` `pp/` `docs/`） | `git rev-parse --show-toplevel` | 検証するのは今いる worktree の実装 |
| 共有 toolchain（`drafts/pw-browsers` `drafts/bun`） | `dirname "$(git rev-parse --path-format=absolute --git-common-dir)"` | 実体は main repo 側に 1 つ置いて全 worktree で共有する。通常 repo でも同じ値になる |

`drafts/` は gitignore 対象なので worktree には materialize されない。新しい worktree で browser や bun が「無い」ように見えたら、まず上表の引き方を疑う。

同じ理由で `node_modules/` も worktree には無い。**依存の導入は worktree ごとに 1 回必要**で、これを飛ばすと `ERR_MODULE_NOT_FOUND` が出る。共有できるのは gitignore 下でも main repo 側に実体を置いた toolchain（`drafts/`）だけで、`node_modules` は各 worktree が持つ。

## 2. 既存実装の役割 — 正本ではなく参照資料

意匠の正本は Claude Design mock（`CLAUDE.md`）であり、既存実装ではない。既存実装から引き継ぐのは次に限る。

- **内容**: 文言・データ・画面が扱うドメインの語彙
- **契約**: 呼んでいる API の request/response 形（`pp` の fixture の出どころになる）
- **挙動**: 状態遷移と操作の結果（states fixture の網羅リストの出どころになる）

引き継がないのは**見た目の実装**である。既存 CSS/DOM を写すと、mock との差分が「意図的差分」なのか「写し損ね」なのか判別できなくなる。差分の扱いは 2 択のみで、実装を直すか `docs/presentation/ui-mock/DESIGN-POLICY.md` に日付付き裁定として登録するかしかない。

既存実装が Claude Design の export そのもの（`<x-dc>` 形式）で本番稼働している場合、突合先は最初から確定しているぶん有利だが、**旧 export をそのまま凍結 mock にはしない**。凍結するのは今回作り直した新しい export である。

## 3. 順序 — 1 画面ずつ、gate を緑にしてから次へ

画面数が多くても、最初の 1 枚は `seed-docs/walking-skeleton.md` の一周をそのまま踏む。2 枚目以降は `seed-docs/screen-loop.md` の定常ループに乗る。

最初の 1 枚の選び方には裏表がある。

- **最小の画面**: 一周が速い。ただし API を持たない画面を選ぶと `APP_API_FIXTURES` が空のままになり、fixture 経路が未検証で残る
- **API を持つ画面**: 一周は重いが、harness が本当に全部動くことの証明になる

walking skeleton の目的は「harness が動くことの証明」なので、**API を 1 本でも持つ画面**を推す。

## 4. 先に済ませる設定

一周に入る前に確定しておくと手戻りが出ない。

- `pp/src/config.ts` — 基準 viewport 2 点・locale・timezone・固定時刻
- `pp/vendor/` — mock の描画に要る外部資産（JS ライブラリ・フォント）を落として `VENDOR_ROUTES` に登録する。検証中の CDN 取得は `pp/src/net-block.ts` が abort するので、登録漏れは loud に失敗する。取得コマンドは `pp/vendor/README.md` に追記して再取得可能にしておく
- `frontend/src/app.html` ほかの `{{...}}` placeholder — grep で列挙して差し替える

mock が実行時に外部から JS を読む形式（`<x-dc>` + runtime CDN 等）なら、その URL も vendor 対象になる。`npm run lint:mock` が外部参照を検出する。

## 5. seed への戻し方

この作業中に見つかるのは 2 種類で、扱いが違う。

| 見つかるもの | 扱い |
| --- | --- |
| この repo 固有のもの（mock・AST・部品・SELECTOR_MAP の中身・fixture） | この repo に留める。seed へ戻さない |
| seed の機構の欠陥・不足（`pp/src`・spec の骨格・`tools/`・skills・本書を含む docs） | seed へ back-port する。出典 commit を message に記す |

判断に迷ったら「新規プロジェクトでも同じものが要るか」で分ける。要るなら機構、要らないなら固有物である。

## 6. 完了の判定

一周の完了条件は `seed-docs/walking-skeleton.md` と同じで、**全 gate が skip でなく実行されて緑**である。skip は「未検証」であって「合格」ではない。1 spec でも skip のまま「一周した」と宣言しない。

既存実装との比較で「見た目が同じだから完了」としない。同じ pixel でも構造契約（token / clamp / %）が違えば中間幅で崩れる。判定は `pp` が行う。
