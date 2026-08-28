# todos

## Critical

## High

### KEEP_IMPL 台帳が pp と結線されていない

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/DESIGN-POLICY.md` に登録した意図的差分を、gate が「差分」として扱わない形で機械に伝える。
Work file: `docs/presentation/ui-mock/DESIGN-POLICY.md`・`pp/src/diff.ts`・`pp/tests/page-parity.spec.ts`

Exit Criteria:

- [ ] 台帳の entry が `sample-parity` と `page-parity` の判定に効き、登録済みの差分では落ちない — 画像の slice だけ `1164dae` で達成（`page-parity` のみ。`sample-parity` と画像以外は未着手）
- [ ] 台帳に無い差分は従来どおり落ちることを、陽性・陰性の両方で実測する — 画像の slice は実測済み（`page-diff.spec.ts` の「マスク内は比較しない / マスク外は数える」・`keep-impl.spec.ts` の「`img:` 行だけが対象 / 空の対象は拒否」）
- [ ] 台帳の書式（対象 visual id・画面・日付・裁定理由）が schema か spec で機械検査される

着手条件は最初の entry が立つこと。適用先は第 1 版で候補 2 件（calendar modal の 12px はみ出し / index の固定 box）を持っていたが、第 2 版 mock で両方とも mock 側が直り消えた（2026-08-27 報告）。

**`page-parity` は画面まるごとの pixel 一致なので、KEEP_IMPL が 1 件でも立った瞬間に必ず落ちる。** 結線はその前に済ませる必要がある。

2026-08-28: 適用先が画像軽量化で 14 spec を赤にし、台帳 entry を立てた。img/picture/video を一律で pixel 比較から外す形（`fb0a7fd`）は承認していない差し替えまで通すので `1164dae` で撤回し、**台帳が `img: <src の一部>` で名指しした画像だけ**を外す形にした（置かれ方＝枚数と箱は常に比較する）。DESIGN-POLICY も同 commit で「既定の処置に従った軽量化**も**載せる」へ改めてある。

残るのは**画像以外**の差分で、こちらは吸収する機構がまだ無い（DESIGN-POLICY に明記）。**着手条件（意匠の意図的差分が 1 件立つ）はまだ来ていない。**

### 実証 2 回目 — mock を更新して反映する流れ

起票: opus-5 2026-08-28
Goal: 既に実装済みの画面について、mock 更新 → 再凍結 → AST 追従 → 実装反映 → gate 緑 までの往復を通し、1 回目で整えた手順が実際に回ることを確かめる。
Work file: `last-session-handoff.md`（この checkout 限り。`.gitignore` 対象なので、失われたら本 block から起こし直す）

Exit Criteria:

- [ ] 適用先で mock を 1 回更新し、`/mock-freeze` の再凍結手順（前版との棚卸し → 参照スクショ → 台帳）を通す
- [ ] `ast:refresh` で region と provenance が追従し、`COPY_REVIEW` の指摘が実際の文言変更と対応することを確認する
- [ ] 更新後の画面で gate が skip ゼロで緑になる（KEEP_IMPL entry がある場合は、それが `page-parity` の判定に効いていることを含む）
- [ ] 手順どおりに回らなかった箇所を seed 側で直し、2 回目の実測として記録する
- [ ] 依存の bump（vite 8.2.2 ほか）を **mock 更新より先に単独で land** し、その前後で gate を回して差の出所を切り分ける（`seed-docs/adoption.md` §7）

ユーザー裁定 2026-08-28: 「iac-web を使った実証実験１回目は、完了とします。もう一回、mock のアップデートと反映の流れをやりますので、そのときに再確認しましょう。」

1 回目で通したのは「mock を作る → 実装する」の向きで、**更新の向きは通していない**。再凍結・AST 追従・KEEP_IMPL の還流は、いずれも今日この session で整えたばかりで実地を経ていない（`/mock-freeze` の棚卸し段・`ast:refresh`・台帳結線）。着手時期はユーザーの判断。

2026-08-28 の実測（seed から適用先の `pp/` を分類）: install.sh が「PJ のもの」と判定して触らない file が 14 件あり、うち 7 件が spec（`ast-conformance` / `list-identity-sweep` / `modal-geometry-sweep` / `page-parity` / `poststate-sweep` / `self-baseline` / `width-sweep`）。**この 7 件へ seed が入れた変更は install.sh では届かない** — `1164dae` の KEEP_IMPL 結線もこの中。spec を機構だけにする「pp の登録点が 1 画面前提」の解消が、二巡目へ seed 更新を届ける前提になる。

台帳の書式も要調整。適用先の entry #1 の対象列は「全画面の画像 13 枚 (ロゴ 3・写真 10)」という散文で、gate が読む `img: <src の一部>` の形になっていない。現行 seed を入れると、この 13 枚は台帳に無い画像として `page-parity` で赤になる。`img:` 行へ書き直すか、mock 側へ軽量版を取り込んで entry を閉じる（entry 自身が後者を予定と書いている）。

seed 側の準備は 2026-08-28 に済んだ。二巡目で取り込んで使うもの:

| 何 | どこ | 二巡目での役割 |
| --- | --- | --- |
| `bun run --cwd pp mock:closure` | `pp/scripts/mock-closure.ts` | 再凍結で `export/` に入れる集合を実測で決める（凍結手順 4） |
| `bun run --cwd pp mock:integrity` | `pp/scripts/mock-integrity.ts` | 再凍結の前に mock 自身の破れを出す（凍結手順 6）。適用先の現行 mock では design system page が 360/390 で横スクロールする |
| `SCREENS` 登録点 | `pp/src/screens.ts` + `screen-registry.ts` | 7 spec を機構だけにしたので、以後 seed の gate 更新が install.sh で届く。適用先は 7 spec の PJ 版を捨てて登録点へ移す |
| KEEP_IMPL の `img:` 結線 | `pp/src/keep-impl.ts` | 台帳が名指しした画像だけ pixel 比較から外れる。適用先の entry #1 は書き直しが要る |
| §6 の取り込み経路 | `seed-docs/adoption.md` | merge 据え置き。差し替え点で衝突したら作業 branch 側を採る |
| BE 往復の調整段 | `docs/design-sync.md` 2.3 | mock 更新を BE 結合済み FE へ戻すときの 3 か所（mock fixture・pp fixture・実 BE） |
| 依存を上げる手順 | `seed-docs/adoption.md` §7 | bump は install.sh で届かないので適用先が自分で当てる。単独 commit にして前後で gate を回す |
| スタックの構成と出典 | `README.md` | どの層が何を担うか、2026-08 時点の出典 URL つき |

seed 側の依存は 2026-08-28 に vite 8.2.2 へ、`pp/` の導入を bun へ揃えた。適用先の `frontend/package.json`・`bun.lock`・`pp/package.json` はいずれも PJ 所有なので、**同じ bump を適用先で当てる作業が二巡目の頭に要る**。

## Medium

### BE 結合済み実装と Claude Design の往復手順が無い

起票: opus-5 2026-08-24
Goal: BE と結合した実装を持つ repo で、mock への書き戻しと mock 由来の変更の取り込みを、文書化された手順で回せるようにする。
Work file: `docs/design-sync.md`・`seed-docs/first-prompts.md`

Exit Criteria:

- [x] 実装が呼ぶ BE を、書き戻し時に何へ置換するか（`docs/design-sync.md` の「共有 fixture module」が受け皿）と、その変換を書き戻し手順のどこで行うかを書く — `design-sync.md 2.3` の「code → mock」。取得層だけを置換し状態機械は残す、置換は `finalize_plan` の前、認証で表示が変わる画面は変種ごとに preview を分ける
- [x] mock 側の変更を BE 結合済み FE へ戻すとき、fixture と実 BE の両方へ整合させる調整段を書く — 同 2.3 の「mock → code」。揃える先は mock の fixture・`pp/src/fixtures/`・実 BE の 3 か所で、後ろ 2 つの間が gate の死角になることを明記した
- [ ] 文書どおり実行して確認する — 適用先で書き戻しを 1 回通す必要があるので、実証 2 回目で行う

適用先からの報告（2026-08-24）。`first-prompts.md:28` は「実装から生成した preview HTML を書き戻す」としか書いておらず、BE 呼び出しの扱いが無い。そのまま書き戻すと Claude Design 上で外部 fetch できず動かない。受け皿の概念（`design-sync.md:14,107` の共有 fixture module）は既にあるので、欠けているのは変換の位置づけ。`design-sync.md` は mock → 実装の読解と pp での pin を定めるが、既に BE と結合した実装へ戻す調整は扱っていない。新規実装では出ず、旧実装と BE を持つ repo でだけ出る。

### 既存 repo 適用の出口が未定義 — 旧実装との regression 段と main への land 手順

起票: opus-5 2026-08-24
Goal: 既存実装のある repo で一周を終えた後、旧実装との突合と main への land を、文書化された手順で完了できるようにする。
Work file: `seed-docs/adoption.md`（§2 と §9）・`seed-docs/screen-loop.md`（⑦）

Exit Criteria:

- [x] 旧実装をどこまで参照してよいか、参照の結果 mock と差が出たときの扱い（DESIGN-POLICY への裁定登録か実装修正か）を adoption.md §2 に書く — 参照範囲と 2 択は §2 にあったので、欠けていた「旧実装との突合（land の直前に 1 回）」を足した。突き合わせるのは画面と route の網羅・API 配線・実データ・異常系・資産の 5 つで、意匠は比較対象にしない
- [x] 一周完了後に作業 branch を main へ land し、旧実装を退役させるまでの手順を書く。deploy 先の切替と Claude Design 同期の再確立を含む — adoption.md §10 に 7 step。本番で確かめてから branch を入れ替える順序、旧 main を消さないこと、worktree 片付け前の退避、`design_sync verify` の張り直しを含む
- [ ] 文書どおり実行して確認する — 適用先の land は文書化より先に済んでいるので、本文はその実行の記録から起こした。「文書 → 実行」の順で確かめるのは次の既存 repo 適用になる

適用先からの報告（2026-08-24）で 2 件とも確認済み。screen-loop ⑧ の判定基準は mock と意味論で、旧実装と比べる段が無い。adoption.md §1 は main を凍結すると書くが、凍結を解いて作り替えた側を main にする手順が無く、§9「完了の判定」も gate が緑になるところで止まっている。いずれも新規 repo では出ない、既存 repo 適用固有の不足。

2026-08-28 に §2 の突合表と §10 の land 手順を書いた。出典は適用先が実際に通した land（本番アドレスへ promote → 7 route 200・稽古予定 4 回とカレンダー 11 件と祝日 1067 件が旧サイトと同じ実データ・申込み API が不正 method に 405・favicon 200 を本番で確認 → 旧 URL の転送は不要と裁定して転送 commit を revert → 旧 main を `old-main` として残し作業 branch を main へ fast-forward → worktree 削除）。

### pp の登録点が 1 画面前提で、画面が増えると破綻する

起票: opus-5 2026-08-27
Goal: 画面が複数ある PJ でも、pp の差し替え点を画面ごとに解決できる形にする。
Work file: `pp/src/config.ts`・`pp/tests/*.spec.ts`・`pp/README.md`（差し替え点一覧）

Exit Criteria:

- [x] `READY_SELECTOR` / `MODALS` / `EDGES` / fixture / self-baseline 対象などの登録点が画面ごとに引ける形になり、各 spec は出所の参照だけを持つ — `pp/src/screens.ts`（表）と `pp/src/screen-registry.ts`（引く機構）に分け、8 spec から定数を外した
- [x] 画面を 2 枚登録して画面ごとに回し、登録点が画面ごとに解決されることを実測する — 2026-08-28 実測。seed の frontend（`/` と `/states`）へ app 側 3 spec を 2 slug 分。どちらも 4 passed / 0 skipped で、self-baseline が別名・別内容の PNG を 4 枚吐いた（16986B と 46126B）＝ route が実際に切り替わっている。未登録 slug は skip でなく error になることも実測
- [ ] 凍結 mock を持つ適用先で `bun run --cwd pp gate` を画面ごとに回し、どちらも skip 無しで緑になることを実測する — seed には凍結 mock が無く mock 側 spec を回せないので、実証 2 回目でここを埋める
- [x] 適用先が先行実装した形の結果報告を受け取ってから設計を確定する — 2026-08-27 受領。7 spec の diff は定数の出所だけで assertion / skip 条件は不変、slug 規則も `screenOf` と一致

先方の設計上の注意 2 点への処置: (a) 循環は型だけの import にして切った（`screens.ts` が型を `screen-registry.ts` から取り、機構が表を取る）。素の定数は `config.ts` に残してある。(b) `SELF_BASELINE_PATHS` は廃止し、self-baseline は今の画面 1 枚だけを撮る — 画面ごとに回せば全画面が 1 回ずつ撮られる。

`PP_APP_PATH` も廃止した。route が slug から引けるので、gate へ渡す env は `PP_MOCK_FILE` + `PP_APP_URL` の 2 つに戻る。

### 凍結の手順はあるが道具が無い — 閉包収集と参照スクショ

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/README.md` が定める凍結の判定則を、手作業でなく seed 同梱の tool で実行できるようにする。
Work file: `docs/presentation/ui-mock/README.md`・`pp/scripts/`

Exit Criteria:

- [x] 閉包収集（net-block 下で実描画し、404 と abort が 0 になる file 集合を出す）を行う tool が pp に入り、README の判定則から参照される — `bun run --cwd pp mock:closure`。引数なしで `export/` 全画面、`pp/artifacts/mock-closure.json` に閉包・外部 embed・取りこぼしを分けて書く
- [x] 参照スクショを fullPage・DPR 1 で基準 viewport ごとに撮る tool が pp に入る（`bun run --cwd pp mock:screenshots`。引数なしで `export/` 全画面、撮影中の 404 と abort を数えて 1 件でもあれば落ちる）
- [x] `/mock-freeze` skill に閉包（`mock:closure`）と破れ検査（`mock:integrity`）の段を入れ、`docs/presentation/ui-mock/README.md` の凍結手順と同じ 9 step に揃える — H.S. の許可（2026-08-28）を得て Edit tool で反映。Bash からは read-only のままだが、dedicated tool は通った
- [ ] 適用先の再凍結で 2 つの tool を実際に通す — 実証 2 回目で行う

適用先が一周の凍結時に自作した（`pp/scripts/collect-mock-closure.ts` / `pp/scripts/mock-screenshot.ts`、いずれも config の viewport・net-block・mock-server を使うだけで PJ 非依存との報告）。判定則を README に書いた時点で道具は付けていないので、次の PJ も同じ自作をする。

2026-08-27 に参照スクショ側だけ先に入れた（当初は一周の完了を待つ方針だった）。適用先が実際に撮り漏れを踏み（design system page の撮り忘れ）、原因が「seed が道具を配らないので消費側が自作し、その自作が引数必須になる」ことだと判明したため。

2026-08-28 に閉包収集を入れ、適用先の凍結 mock（7 画面 + design system page）を `PP_REPO_ROOT` で指して実測した。vendor 未登録では取りこぼし 64 件で exit 1、vendor を登録すると取りこぼし 0 件・閉包 26 file で、適用先が凍結した 26 file と一致した。Google Maps の子 frame は取りこぼしでなく外部 embed として分けて挙がる。

### favicon の規約が元画像の要求で止まっていて、生成と配線が無い

起票: opus-5 2026-08-29
Goal: 元画像 1 枚を渡されたら、必要な形（多重 `.ico`・apple-touch・manifest 用）を seed の道具で生成し、HTML へ配線するところまでを規約が持つ。
Work file: `seed-docs/design-order-template.md`（項目 14）・`seed-docs/pre-implementation-questions.md`（favicon と app icon）・`frontend/src/app.html`・生成 script の置き場（未定）

Exit Criteria:

- [ ] 元画像 1 枚から 16/32/48 を含む多重 `.ico` と apple-touch 用 PNG 180×180 を生成する script が seed に入る。出力先も決める（`frontend/static/` は seed にまだ無い）
- [ ] `app.html` に `rel="icon"`（sizes 併記）と `rel="apple-touch-icon"` の link が入り、生成物と一致する
- [ ] manifest を置くかどうかを規約が決める。置かないなら 512×512 の生成もやめ、形の一覧（`seed-docs/pre-implementation-questions.md:29`）から外す
- [ ] 元が不透過（写真 JPEG など）だったときの救済手順を書く — 円マスクは**縮小前に** alpha へ焼く。apple-touch-icon は不透過のまま残す
- [ ] 生成から配線までを適用先で 1 回通す

現状は**要求と形の一覧まで**しかない。`seed-docs/design-order-template.md:40` が「正方形・余白込み・単色背景の元画像を渡す（透過 PNG または SVG）」と発注側へ求め、`seed-docs/pre-implementation-questions.md:29` が必要な形（`.ico` 16/32/48 の多重 + PNG 180×180 + 512×512）を挙げるが、元画像からその形を作って HTML へ繋ぐ側が無い。

iac-web からの依頼（2026-08-29）。H.S. 裁定の verbatim（出所: iac-web session 経由の伝聞、2026-08-29）:「favicon は、普段は元ネタしか渡せないので、適切なサイズのファイルに変換して配備するルールにしてほしい。fe-starter の仕事なら、そうしてもらって」。**承認 scope は規約をその向きへ改めることまで**で、着手時期は未定 — H.S.（2026-08-29、当 session へ直接）「また後で考えます」。

還流できる実装が iac-web 側にある（commit f631cf4 / 427b85f、そのまま持ち込めるとの報告）:

| 何 | 中身 |
| --- | --- |
| 生成 | sharp で 16/32/48 の PNG を作り、ICO container を自前で詰める。sharp は `.ico` を書けないが、ICO は PNG をそのまま格納できる（6 byte header + 16 byte/枚 の directory + PNG 本体）ので 20 行程度 |
| 配線 | `<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">` と `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| 不透過の救済 | 円形ロゴなら円マスクを縮小前に alpha へ焼くと角の白が落ちる。縮小後にマスクすると縁に白が残る。JPEG のにじみを噛まないよう半径は 2px 内側 |
| manifest | 512 は `manifest.json` が無いと未参照。iac-web は未参照なので生成をやめた |

置き場は `tools/` が第 1 候補。iac-web が `pp/scripts/build-images.mjs` へ置いたのは **sharp を pp の devDependency に入れた都合**であって、pp が道具置き場だからではない（2026-08-29 の申し送り）。seed の `tools/` は既に node script を持つ（`ast-tree` / `ast-viewer` が `#!/usr/bin/env node`）ので言語は合う。ただし **`tools/` に package.json が無く**、npm の家は `frontend/` と `pp/` の 2 つだけなので、sharp をどちらの devDependency へ入れるかは取り込み時に決める（出力は frontend の配信資産）。

### `<picture>` を既定の処置に入れると gap が 1 つ増える

起票: opus-5 2026-08-29
Goal: 重い資産の既定の処置（`docs/ui-quality-policy.md:62`）を `<picture>` を使う形へ広げるときに踏む layout 欠陥を、規約が先に塞ぐ。
Work file: `docs/ui-quality-policy.md`・`seed-docs/pre-implementation-questions.md`（重い資産）

Exit Criteria:

- [ ] `picture { display: contents }` を書くなら `picture > source { display: none }` を対で書く、と規約に入れる
- [ ] `<picture>` を既定の処置に含めるかどうかを決める。含めないなら規約は現状（JPEG 化・表示寸法の 2 倍・先読み・data URI）のままにする

iac-web からの依頼（2026-08-29）。**`picture { display: contents }` だけだと `<source>` が親の flex item として数えられ、gap がもう 1 つ増える。** iac-web ではトップの `hero-logo-badge` が 10px 広がり sample-parity が落ちた。Chromium で `getComputedStyle(source).display` が `block` になることを実測したとの報告。塞ぎ方は `picture > source { display: none }` の併記。

着手時期は未定 — favicon の block と同じく H.S.（2026-08-29）「また後で考えます」。

同日に AVIF + srcset を一周した実測も受け取った（**依頼ではなく材料**）:

- mock が参照する 17 枚を棚卸し → 7 ページ × 幅 360〜1920 で最大表示寸法を実測 → 寸法と AVIF を決定
- AVIF の quality は絵柄ごとに「fallback と同じ PSNR に届く最小値」を二分探索。固定 quality だと絵柄で劣化幅が揺れる
- `sizes` は layout の折れ点の写しなので CSS を変えると黙って古くなる。iac-web は `pp/tests/image-variants.spec.ts`（幅 12 点 × DPR 3 段で「足りて最小の変種が選ばれるか」を検査）を追加し、`sizes` を固定値に壊すと 3 件中 2 件が赤になることを確認済み
- 読み込み済みの `img` は viewport を広げても候補を選び直さないので、この種の検査は幅ごとに開き直す必要がある
- 効果: 稽古案内・料金 1 訪問の画像合計が 2.42 MB → 360px DPR2 で 0.31 MB、1440px DPR2 で 0.97 MB

`sizes` の検査段を seed へ入れるかは、既定の処置を AVIF へ広げると決めてから提案する（**今は未提案**）。

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。2026-08-22 に daily-stock-analyzer-25 へ差分と出典 (d7a2863) を送信済み — 実施判断は dsa 側 owner と本人の間で進む。当 session は不介入で、質問への回答のみ行う。
