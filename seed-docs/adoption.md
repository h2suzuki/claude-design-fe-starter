# 既存実装のある repo へ適用する

本書は `tools/install.sh` を実行した**後**に読む。既に動いている実装を持つ repo を、mock-first の作り方へ段階的に置き換えるまでの進め方を定める。新規 repo で seed を使う場合は本書を飛ばして `seed-docs/walking-skeleton.md` へ進む。

install.sh 自体の入手と実行は seed の README.md に載っている（本書は copy-in 後に repo 内から読める場所に置くため、bootstrap は扱わない）。

## 1. 作業場所 — 既存実装は branch で凍結する

既存実装は**動いている資産**であって、置き換えが完走するまで消してはならない。ただし凍結すべきなのは「既存実装が動く状態」であって checkout の場所ではない。それは branch で足りる。

```bash
git switch -c fe-rebuild
<seed>/tools/install.sh .
```

- `main` branch は既存実装のまま凍結される。deploy も検証も従来どおり続けられる
- seed が配る file は `fe-rebuild` branch にだけ載る（installer は既存 file と衝突したら停止するので、既存実装が黙って書き換わることはない）
- `git switch main` すれば working tree は旧実装だけに戻り、status も clean のまま保たれる
- **作業する dir が変わらない**ので、既に動いている session をそのまま使える

install 直後に commit する。未 commit のまま branch を切り替えると、untracked の seed file が旧実装側の tree に残って見分けがつかなくなる。

旧実装を**同時に file として**参照したいなら、読むための checkout を別に出す。

```bash
git worktree add ../<repo>-main main
```

こちらは読むだけなので seed も hooks も要らない。作業する側は元の checkout のままである。

### 作業側を worktree にする場合

既存実装を今までどおり deploy しながら別 checkout で作り替えるなら、**先に seed を入れて commit し、その commit から worktree を出す**。

```bash
<seed>/tools/install.sh .        # 元の checkout で実行し、commit する
git worktree add .claude/worktrees/fe-rebuild -b fe-rebuild
```

`.claude/settings.json`（hooks 登録）・hook script・skills はいずれも追跡ファイルなので、commit 済みなら worktree にも materialize される（hook script の exec bit も保たれる）。session は通常どおり repo top で起動し、worktree へは `EnterWorktree` に `path` を渡して入る。

順序を逆にして worktree の中で install すると、seed はその worktree にしか載らない。元の checkout を見ている session には hooks が登録されず、凍結 mock の編集 gate が効かないまま作業することになる。

hooks 登録を含む settings の変更は hot-reload されないので、install 後に session を 1 回だけ再起動する。

### worktree での path 解決

`git rev-parse --show-toplevel` は **worktree 自身**を返す。使い分けを誤ると「toolchain が無い」という誤診に直結する。

| 対象 | 引き方 | 理由 |
| --- | --- | --- |
| 作業対象（`frontend/` `pp/` `docs/`） | `git rev-parse --show-toplevel` | 検証するのは今いる worktree の実装 |
| 共有 toolchain（browser・bun・npm cache） | `tools/toolchain-dir` | main repo 側に 1 つ置いて全 worktree で共有する。書けない環境では worktree 側へ退避して、その旨を stderr に出す |

`drafts/` は gitignore 対象なので worktree には materialize されない。新しい worktree で browser や bun が「無い」ように見えたら、まず上表の引き方を疑う。

共有先が書けない環境がある — session の write 権限が今いる checkout に閉じている sandbox では、main repo 側が read-only になる。`tools/toolchain-dir` はそれを実測して置き場を決めるので、手で場合分けしない。退避したときは worktree ごとに browser と bun を取り直すことになる（共有の狙いは達成できない）が、手順は同じまま通る。

同じ理由で `node_modules/` も worktree には無い。**依存の導入は worktree ごとに 1 回必要**で、これを飛ばすと `ERR_MODULE_NOT_FOUND` が出る。共有できるのは gitignore 下でも main repo 側に実体を置いた toolchain（`drafts/`）だけで、`node_modules` は各 worktree が持つ。

## 2. 既存実装の役割 — 正本ではなく参照資料

意匠の正本は Claude Design mock（`CLAUDE.md`）であり、既存実装ではない。既存実装から引き継ぐのは次に限る。

- **内容**: 文言・データ・画面が扱うドメインの語彙
- **契約**: 呼んでいる API の request/response 形（`pp` の fixture の出どころになる）
- **挙動**: 状態遷移と操作の結果（states fixture の網羅リストの出どころになる）

引き継がないのは**見た目の実装**である。既存 CSS/DOM を写すと、mock との差分が「意図的差分」なのか「写し損ね」なのか判別できなくなる。差分の扱いは 2 択のみで、実装を直すか `docs/presentation/ui-mock/DESIGN-POLICY.md` に日付付き裁定として登録するかしかない。

既存実装が Claude Design の export そのもの（`<x-dc>` 形式）で本番稼働している場合、突合先は最初から確定しているぶん有利だが、**旧 export をそのまま凍結 mock にはしない**。凍結するのは今回作り直した新しい export である。

## 3. 新しい mock を持ち込む時点

mock の持ち込みは **install.sh の後**である。凍結の置き場（`docs/presentation/ui-mock/export/`）・sha256 台帳・`/mock-freeze`・凍結後の編集を止める hook は、いずれも seed が配るものだからである。先に export を置いても、管理外の場所に置いた file にしかならない。

持ち込みの手順は `/mock-freeze` が正で、export の配置と sha256 の台帳登録を同一 commit にする。凍結せずに実装へ入らない — 突合先がドリフトすると、以降の gate は「今どの mock と比べているのか」を答えられなくなる。

## 4. 順序 — 1 画面ずつ、gate を緑にしてから次へ

画面数が多くても、最初の 1 枚は `seed-docs/walking-skeleton.md` の一周をそのまま踏む。2 枚目以降は `seed-docs/screen-loop.md` の定常ループに乗る。

最初の 1 枚の選び方には裏表がある。

- **最小の画面**: 一周が速い。ただし API を持たない画面を選ぶと `APP_API_FIXTURES` が空のままになり、fixture 経路が未検証で残る
- **API を持つ画面**: 一周は重いが、harness が本当に全部動くことの証明になる

walking skeleton の目的は「harness が動くことの証明」なので、**API を 1 本でも持つ画面**を推す。

## 5. 先に済ませる設定

一周に入る前に確定しておくと手戻りが出ない。

- `pp/src/config.ts` — 基準 viewport 2 点・locale・timezone・固定時刻
- `pp/vendor/` — mock の描画に要る外部資産（JS ライブラリ・フォント）を落として `VENDOR_ROUTES` に登録する。検証中の CDN 取得は `pp/src/net-block.ts` が abort するので、登録漏れは loud に失敗する。取得コマンドは `pp/vendor/README.md` に追記して再取得可能にしておく
- `frontend/src/app.html` ほかの `{{...}}` placeholder — grep で列挙して差し替える

mock が実行時に外部から JS を読む形式（`<x-dc>` + runtime CDN 等）なら、その URL も vendor 対象になる。`npm run lint:mock` が外部参照を検出する。

## 6. seed の更新を受け取る

`tools/install.sh` は **repo に対して 1 回**実行する。branch への伝播は git の仕事なので、作業 branch を持つ worktree に向けて直接実行しない — 同じ seed を 2 か所から入れる形になり、どちらが正かが説明できなくなる。

```bash
<seed>/tools/install.sh .                 # seed を入れた checkout（通常は main）で実行し、commit する
git -C <worktree> merge main              # 作業 branch へ運ぶ
```

install.sh は PJ が育てた file（`pp/src/config.ts`・`frontend/src/app.html`・PJ 語彙を埋めた docs）を触らずに残し、末尾に列挙する。差し替え点を埋めた repo でも機構更新は届く。

merge で衝突するのは、**seed が配る file を作業 branch でも手で置いた場合**だけである（同じ path を両側が別々に追加した add/add 衝突）。seed 側が正なので、その file は main の版を採る。

```bash
git checkout main -- <path>   # index と working tree の両方が解決される（git add は不要）
git commit --no-edit
```

hook 登録を含む `.claude/settings.json` が更新されるので、merge 後に session を 1 回再起動する。

`git cherry-pick` は個別修正を拾う時の手段であって、更新の常道ではない。seed の commit は `README.md`・`SEED-CONTRACT.md` のような PJ 所有 path を含むことがあり、そのまま当たらない。

## 7. seed への戻し方

この作業中に見つかるのは 2 種類で、扱いが違う。

| 見つかるもの | 扱い |
| --- | --- |
| この repo 固有のもの（mock・AST・部品・SELECTOR_MAP の中身・fixture） | この repo に留める。seed へ戻さない |
| seed の機構の欠陥・不足（`pp/src`・spec の骨格・`tools/`・skills・本書を含む docs） | seed へ back-port する。出典 commit を message に記す |

判断に迷ったら「新規プロジェクトでも同じものが要るか」で分ける。要るなら機構、要らないなら固有物である。

## 8. 完了の判定

一周の完了条件は `seed-docs/walking-skeleton.md` と同じで、**全 gate が skip でなく実行されて緑**である。skip は「未検証」であって「合格」ではない。1 spec でも skip のまま「一周した」と宣言しない。

既存実装との比較で「見た目が同じだから完了」としない。同じ pixel でも構造契約（token / clamp / %）が違えば中間幅で崩れる。判定は `pp` が行う。
