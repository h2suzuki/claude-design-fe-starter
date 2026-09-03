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
| 共有 toolchain（browser・bun・cache） | `tools/toolchain-dir` | main repo 側に 1 つ置いて全 worktree で共有する。書けない環境では worktree 側へ退避して、その旨を stderr に出す |

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

### 旧実装との突合（land の直前に 1 回）

`pp` が見るのは mock との一致だけで、**旧実装が持っていて新実装が落とした機能は誰も見ていない**。screen-loop ⑧ の判定基準も mock と意味論なので、既存 repo ではこの突合を land の直前に 1 回入れる。見るのは見た目ではなく、覆えているかどうかである。

| 突き合わせるもの | 落ちていたら |
| --- | --- |
| 画面と route の網羅 | 旧実装にあって新実装に無い route を洗い出し、作るか「作らない」を裁定として残す |
| API 配線 | 旧実装が呼んでいた endpoint と request/response 形。fixture ではなく**実 BE**で確かめる |
| 実データの内容 | 件数・並び・日付など、旧実装と同じ値が出るか。fixture では気づけない |
| 異常系 | 不正な method・空入力・権限外の応答。旧実装の挙動を基準に、変えるなら裁定を残す |
| 資産 | favicon・app icon・OGP など、画面に出ないが欠けると分かる file |

**旧実装の既知バグは写さない。** 突合は「同じ振る舞いにする」ためではなく「落としていないか」を見るためのもので、旧実装のバグは再現対象ではない。落ちている機能が見つかったら実装で埋める。旧実装と**意匠**が違うのは当然なので、それは差分として数えない — 意匠の差の扱いは上の 2 択（実装を直すか台帳へ裁定を登録するか）で、比較対象は旧実装ではなく mock である。

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

- `pp/src/config.ts` — 基準 viewport 2 点・locale・timezone・固定時刻・app の mount 点
- `pp/src/screens.ts` — 画面ごとの登録点（route・描画完了セレクタ・操作・fixture）。画面を足すたびに 1 entry 増える。`PP_MOCK_FILE` の slug で引かれるので、gate へ渡す env は 1 つで済む
- `pp/fixtures/be/` — BE の route test が書き出す応答 JSON の置き場。`pp/src/fixtures/` の値はここから写し、`bun run --cwd pp fixture:diff` で「fixture にあって BE に無い値」が 0 件であることを確かめる（規約: docs/design-sync.md 2.3）。手書きで残す fixture は理由を 1 行添える
- `pp/vendor/` — mock の描画に要る外部資産（JS ライブラリ・フォント）を落として `VENDOR_ROUTES` に登録する。検証中の CDN 取得は `pp/src/net-block.ts` が abort するので、登録漏れは loud に失敗する。取得コマンドは `pp/vendor/README.md` に追記して再取得可能にしておく
- `frontend/src/app.html` ほかの `{{...}}` placeholder — grep で列挙し、残る差し替え点を確定させる。`seed-docs/first-prompts.md` の `{{...}}` は `/design-order` が発注ごとに実値で埋める template なので、ここでは差し替えない

mock が実行時に外部から JS を読む形式（`<x-dc>` + runtime CDN 等）なら、その URL も vendor 対象になる。`bun run --cwd pp lint:mock` が外部参照を検出する。

## 6. seed の更新を受け取る

`tools/install.sh` は **repo に対して 1 回**実行する。branch への伝播は git の仕事なので、作業 branch を持つ worktree に向けて直接実行しない — 同じ seed を 2 か所から入れる形になり、どちらが正かが説明できなくなる。

```bash
<seed>/tools/install.sh .                 # seed を入れた checkout（通常は main）で実行し、commit する
git -C <worktree> merge main              # 作業 branch へ運ぶ
```

install.sh は PJ が育てた file（`pp/src/config.ts`・`pp/src/screens.ts`・`frontend/src/app.html`・PJ 語彙を埋めた docs）を触らずに残し、末尾に列挙する。差し替え点を埋めた repo でも機構更新は届く。

seed を入れた main から作業 branch を切っていれば、更新の merge は衝突しない。差し替え点は install.sh が触らず、機構だけが片側で動くためである（実測: PJ が `pp/src/config.ts` と `frontend/src/app.html` を埋めた作業 branch へ seed の機構更新を merge し、衝突なし・PJ の値は残存・機構更新は到達）。

衝突するのは、**seed を入れる前に作業 branch を切り、seed が配る path を作業 branch でも手で置いた場合**だけである（同じ path を両側が別々に追加した add/add 衝突）。解決はその file の役割で分かれる。

| 衝突した file | 採る側 | コマンド |
| --- | --- | --- |
| 機構（spec・script・hook など、§8 の表で「seed が配っている file」に当たり PJ が値を埋めていないもの） | main（seed 側） | `git checkout main -- <path>` |
| 差し替え点（`pp/src/config.ts`・`pp/src/screens.ts`・`frontend/src/app.html` など、install.sh が「PJ のもの」として末尾に列挙する path） | 作業 branch 側 | `git checkout --ours -- <path>` して `git add <path>` |

```bash
git checkout main -- <path>       # 機構: index と working tree の両方が解決される（git add は不要）
git checkout --ours -- <path>     # 差し替え点: PJ の値を残す。こちらは git add が要る
git commit --no-edit
```

差し替え点で main 側を採ると、day-0 で埋めた値が消えて検証条件が seed の例に戻る。seed 側にその file の変更があるなら、値を保ったまま手で取り込む（install.sh の末尾もそう案内する）。

**取り込みは merge で行い、rebase へは変えない。** 作業 branch には repo を作り替えた履歴が丸ごと乗っており（§1）、seed 更新のたびに rebase すると、そのたびに全 commit の hash が変わる。hash を引いている記述 — `DESIGN-POLICY.md` の裁定、todos の根拠、back-port message の出典 — が更新のたびに参照先を失う。merge の費用は 1 更新あたり merge commit 1 個で、`git log --merges` が「いつ seed が入ったか」をそのまま示し、install.sh が出した「何を更新し、何を PJ のものとして残したか」の報告を後から読み直す起点になる。

hook 登録を含む `.claude/settings.json` が更新されるので、merge 後に session を 1 回再起動する。

`git cherry-pick` は個別修正を拾う時の手段であって、更新の常道ではない。seed の commit は `README.md`・`SEED-CONTRACT.md` のような PJ 所有 path を含むことがあり、そのまま当たらない。

### 差し替え点の形が変わったとき

seed が差し替え点の型や引数を変えると、install.sh は据え置いた file を触らないので **PJ 側だけが旧い形のまま残る**。その状態は `tsc --noEmit` で出る。適用先が実際に当てた移行を、要領として残す（2026-08-29、`screen-registry` 導入時）。

| 触る file | 何をするか |
| --- | --- |
| `pp/src/screens.ts` | 型を `screen-registry` から import し、新しい field 名へ改める。新しい型に無い field は excess property になるので落とす |
| `pp/src/config.ts` | `screens` からの import を落とす。**`screen-registry` が `config` を読むので、`config` が `screens` を読むと循環する** |
| `pp/src/targets/app-target.ts` | seed 側で増えた関数を写す |
| spec | `CURRENT_SCREEN` の import 元を `screen-registry` へ移し、optional になった field を補う |

**型が 0 件になっても移行は終わっていない。** 適用先は `tsc` が通った時点を完了と見て gate で 2 件を踏んだ:

- **既定値を兼ねている export を落とすと、頼っていた側が黙って別の対象を見る。** `APP_ENTRY_PATH` は「config の不要な export」に見えて `openApp` の既定 path でもあり、落とした結果 6 spec がトップを開いた。構造差 107 件と 10 分 timeout として出た。**落とすなら、既定に頼っている呼び出しへ値を明示するのが対で要る**
- **名前の追従だけで移植を終えない。** 据え置き spec を手で移すとき、変数名を合わせただけで中身（画像の箱の照合と台帳による除外）が入っておらず、pixel 差 9.3% で落ちた

型では出ない種類なので、**移行の完了判定は `tsc` ではなく gate に置く**。

## 7. 依存を上げる

frontend と pp の依存は **install.sh では届かない**。`frontend/package.json`・`frontend/bun.lock`・`pp/package.json`・`pp/bun.lock` はいずれも PJ が育てる file なので、seed 側で上げても「PJ のもの」として触られずに残る（§6 の分類）。**適用先が自分で同じ bump を当てる**。

### 順序

1. seed 側で上げ、seed で通ることを確かめる（build・dev server・`bun run --cwd pp gate`）
2. 適用先で **依存を上げるだけの commit を 1 本**作る。他の変更と混ぜない
3. その commit の前後で gate を回し、差が出たかを見る
4. 差が出たなら原因は upgrade である。他に変更が無いので、実装の drift と切り分ける手間が要らない

**mock 更新と同じ round で上げるときは、依存を先に単独で land する。** 混ぜると、赤が upgrade のせいか mock 変更のせいか切り分けられない。

### 何が赤くなりうるか

| gate | 上げると動く理由 | 出たときの扱い |
| --- | --- | --- |
| `self-baseline` | 描画が 1px でも変われば PNG が変わる | 画を見て、意図した変化と確認できたときだけ `--update-snapshots`。更新した PNG は commit review で目視する |
| `page-parity` / `sample-parity` | app 側だけが動くので mock との差になる | mock は動いていないのだから **app 側の回帰**である。baseline 更新で消してはいけない |
| `width-sweep` | layout 計算が変われば横スクロールが出る | 実装の欠陥として直す |

### Playwright だけは別枠

`@playwright/test` は `^` なしの完全固定である。上げると同梱 Chromium が変わり、text metrics と anti-aliasing が動いて **pixel gate が全面的に赤くなる**。上げるときは vendor 資産と selector map の再検証、self-baseline の作り直しをセットで行う（`pp/README.md`）。他の依存と同じ commit に混ぜない。

### 上げ幅の決め方

- **`bun --bun` は version を変えない。** 実行 runtime を替えるだけで、どの版が入るかは `package.json` と `bun.lock` が決め、決まるのは `bun install` の時点である
- **peer range を満たさない状態を残さない。** `node_modules/<pkg>/package.json` の `peerDependencies` と実装 version を突き合わせる。宣言違反は動いていても、次の解決で別の版に化ける
- **framework の peer が許さない major へは行かない。** 例: `@sveltejs/kit` の peer は `typescript: ^5.3.3 || ^6.0.0` なので、TypeScript 7 は kit が対応するまで取れない
- 構成要素・版・依存宣言・制約の一覧は `docs/stack.md`。構成要素の入れ替えは seed 側で扱い、適用先では行わない

## 8. seed への戻し方

この作業中に見つかるのは 2 種類で、扱いが違う。分類の鍵は dir でなく **seed がその file を配っているか**である。

| 見つかるもの | 扱い |
| --- | --- |
| seed が配っている file の欠陥・不足 | seed へ back-port する。出典 commit を message に記す |
| それ以外（mock・AST・部品・SELECTOR_MAP の中身・fixture、および PJ が自分で足した file） | この repo に留める。seed へ戻さない |

dir 名で判定してはならない。`docs/` `tools/` `.claude/` は `SEED-CONTRACT.md` の **merge 領域**で、seed が配る file と PJ が足した file が同居する（`frontend/` `pp/` `seed-docs/` `docs/presentation/` は seed の占有 dir なので同居しない）。dir で判定すると、PJ が自分で足した tool の修正を seed へ戻そうとする経路が開く。

機械的に確かめる。

```bash
git -C <seed> ls-files --error-unmatch -- <path>   # rc 0 = seed が配っている file
```

判断に迷ったら「新規プロジェクトでも同じものが要るか」で分ける。要るなら機構、要らないなら固有物である。

## 9. 完了の判定

一周の完了条件は `seed-docs/walking-skeleton.md` と同じで、**全 gate が skip でなく実行されて緑**である。skip は「未検証」であって「合格」ではない。1 spec でも skip のまま「一周した」と宣言しない。

既存実装との比較で「見た目が同じだから完了」としない。同じ pixel でも構造契約（token / clamp / %）が違えば中間幅で崩れる。判定は `pp` が行う。

**gate を包む層は、1 つ残らず rc を通す。** `bun run --cwd pp gate` は `test` と `require-no-skips` の 2 本で、後者だけが「未検証の skip が残っていないか」を見る。前者の rc だけ返す層を挟むと、**skip 検査が落ちても緑で終わる**。

適用先は**同じ罠を 2 層で踏んだ**（2026-08-30）。1 画面分の runner が `require-no-skips` の rc を捨てており、それを直した後、7 画面をまとめる層が「各画面の rc を印字するだけで自身は最後の `cat` の rc で終わる」形だったことが次の検証で出た。**下の層を直しても、上の層がまだ握り潰す。** 薄い集約 script・log へ流す pipe・並べて表示するだけの wrapper が、どれも 1 層に数えられる。

gate 自体は正しく赤を出していたので、**壊れるのは gate ではなく、その外側で数える側**である。層を足したら、落ちる rc を合成で 1 度流して確かめる。

**緑が何を見たかを読む。** `page-parity` は画面ごとに `画像 N 箇所 / 台帳が外した M 箇所 → 中身を比較した N-M 箇所` を出す。右端が 0 なら、その画面の画像の中身は 1 枚も比較されていない — 台帳の設計どおりの状態だが、緑の意味が「一致した」ではなく「見ていない」に変わる。台帳を縮めるほど右端が増える。

## 10. main へ land し、旧実装を退役させる

§9 の完了判定と §2 の突合が済み、**旧実装を捨てるというユーザーの日付付き裁定**が出てから始める。順序は「本番で確かめてから branch を入れ替える」であり、逆にしない — branch を先に入れ替えると、確認で問題が出たときに戻す先が動いている。

0. **`bun run --cwd pp review:check` が rc 0 であることを確かめる**。screen-loop ⑧ の記録が無い・古い・未裁定の画面があれば promote しない。promote 系 command を `pp/promote-commands.json` に列挙しておくと、hook が rc 0 でない promote を止める。同じ hook が `bun run --cwd pp round:record -- --check` も回す — 全画面の ⑦ が最新の巡の記録（`docs/presentation/ui-mock/rounds/<n>.json`、seed-docs/round-record.md）に載っていなければ promote しない
1. **deploy 先を切り替える**。本番アドレスを新実装の deploy へ promote する。preview URL で確認して終わりにしない
2. **本番アドレスで確かめる**。全 route が 200 を返すか、実データが旧実装と同じ値で出るか（件数・日付まで見る）、API の異常系が期待どおりか、favicon など画面に出ない資産が 200 か。ここは fixture が効かない唯一の場所なので、§2 の突合表をそのまま実行する
   - 続けて `seed-docs/screen-loop.md` ⑩ の smoke 3 項目（API 応答の内容 / 保存する状態のリロード / history の往復）を通す。200 だけを見て promote を終えた PJ で、満席枠の欠落・「戻る」で overlay が戻らない・reload の一瞬の既定テーマ表示の 3 件が本番で見つかった
3. **旧 URL の扱いを裁定する**。転送するか、しないか。決めずに転送を入れない — 入れた転送は後から消しにくい
4. **branch を入れ替える**。旧 main を退役名（`old-main` 等）の branch か tag で残し、作業 branch を main へ fast-forward する。**旧 main は消さない**
5. **worktree を片付ける**。作業 worktree を消す前に、gitignore 下の作業物（`drafts/` 等）を main 側へ退避する。materialize されない資産（`node_modules`・toolchain）は残る checkout 側で取り直しになる
6. **Claude Design 同期を張り直す**。新しい main で `DESIGN_PROJECT_ID` と `tools/design_sync verify` が通ること、凍結 mock と `mock-baseline.sha256` が新 main に載っていることを確認する。以後の書き戻しは `docs/design-sync.md` 2.3
7. **push は別途ユーザーの承認を取る**。branch の入れ替えは remote から見ると履歴の付け替えになる
