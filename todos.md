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

Exit Criteria:

- [ ] 適用先で mock を 1 回更新し、`/mock-freeze` の再凍結手順（前版との棚卸し → 参照スクショ → 台帳）を通す
- [ ] `ast:refresh` で region と provenance が追従し、`COPY_REVIEW` の指摘が実際の文言変更と対応することを確認する
- [ ] 更新後の画面で gate が skip ゼロで緑になる（KEEP_IMPL entry がある場合は、それが `page-parity` の判定に効いていることを含む）
- [ ] 手順どおりに回らなかった箇所を seed 側で直し、2 回目の実測として記録する

ユーザー裁定 2026-08-28: 「iac-web を使った実証実験１回目は、完了とします。もう一回、mock のアップデートと反映の流れをやりますので、そのときに再確認しましょう。」

1 回目で通したのは「mock を作る → 実装する」の向きで、**更新の向きは通していない**。再凍結・AST 追従・KEEP_IMPL の還流は、いずれも今日この session で整えたばかりで実地を経ていない（`/mock-freeze` の棚卸し段・`ast:refresh`・台帳結線）。着手時期はユーザーの判断。

2026-08-28 の実測（seed から適用先の `pp/` を分類）: install.sh が「PJ のもの」と判定して触らない file が 14 件あり、うち 7 件が spec（`ast-conformance` / `list-identity-sweep` / `modal-geometry-sweep` / `page-parity` / `poststate-sweep` / `self-baseline` / `width-sweep`）。**この 7 件へ seed が入れた変更は install.sh では届かない** — `1164dae` の KEEP_IMPL 結線もこの中。spec を機構だけにする「pp の登録点が 1 画面前提」の解消が、二巡目へ seed 更新を届ける前提になる。

台帳の書式も要調整。適用先の entry #1 の対象列は「全画面の画像 13 枚 (ロゴ 3・写真 10)」という散文で、gate が読む `img: <src の一部>` の形になっていない。現行 seed を入れると、この 13 枚は台帳に無い画像として `page-parity` で赤になる。`img:` 行へ書き直すか、mock 側へ軽量版を取り込んで entry を閉じる（entry 自身が後者を予定と書いている）。

## Medium

### BE 結合済み実装と Claude Design の往復手順が無い

起票: opus-5 2026-08-24
Goal: BE と結合した実装を持つ repo で、mock への書き戻しと mock 由来の変更の取り込みを、文書化された手順で回せるようにする。
Work file: `docs/design-sync.md`・`seed-docs/first-prompts.md`

Exit Criteria:

- [ ] 実装が呼ぶ BE を、書き戻し時に何へ置換するか（`docs/design-sync.md` の「共有 fixture module」が受け皿）と、その変換を書き戻し手順のどこで行うかを書く
- [ ] mock 側の変更を BE 結合済み FE へ戻すとき、fixture と実 BE の両方へ整合させる調整段を書く
- [x] 一周実証の完了後に着手し、文書を先に変えてから文書どおり実行して確認する — 着手条件は 2026-08-28 に満たされた（作業自体はこれから）

適用先からの報告（2026-08-24）。`first-prompts.md:28` は「実装から生成した preview HTML を書き戻す」としか書いておらず、BE 呼び出しの扱いが無い。そのまま書き戻すと Claude Design 上で外部 fetch できず動かない。受け皿の概念（`design-sync.md:14,107` の共有 fixture module）は既にあるので、欠けているのは変換の位置づけ。`design-sync.md` は mock → 実装の読解と pp での pin を定めるが、既に BE と結合した実装へ戻す調整は扱っていない。新規実装では出ず、旧実装と BE を持つ repo でだけ出る。

### 既存 repo 適用の出口が未定義 — 旧実装との regression 段と main への land 手順

起票: opus-5 2026-08-24
Goal: 既存実装のある repo で一周を終えた後、旧実装との突合と main への land を、文書化された手順で完了できるようにする。
Work file: `seed-docs/adoption.md`（§2 と §8）・`seed-docs/screen-loop.md`（⑦）

Exit Criteria:

- [ ] 旧実装をどこまで参照してよいか、参照の結果 mock と差が出たときの扱い（DESIGN-POLICY への裁定登録か実装修正か）を adoption.md §2 に書く
- [ ] 一周完了後に作業 branch を main へ land し、旧実装を退役させるまでの手順を書く。deploy 先の切替と Claude Design 同期の再確立を含む
- [ ] どちらも文書を先に変えてから、その文書どおり実行して確認する

適用先からの報告（2026-08-24）で 2 件とも確認済み。screen-loop ⑧ の判定基準は mock と意味論で、旧実装と比べる段が無い。adoption.md §1 は main を凍結すると書くが、凍結を解いて作り替えた側を main にする手順が無く、§8「完了の判定」も gate が緑になるところで止まっている。いずれも新規 repo では出ない、既存 repo 適用固有の不足。

### mock 自身の破れを凍結前に機械で出す

起票: opus-5 2026-08-27
Goal: 正本にする前に、mock 自身が発注どおり成立しているかを機械で確かめられるようにする。
Work file: `pp/tests/`・`docs/presentation/ui-mock/README.md`・`.claude/skills/mock-freeze/SKILL.md`

Exit Criteria:

- [x] 凍結 export を `SWEEP_WIDTHS` の下限で描画し、横スクロールとはみ出しが無いことを検査する gate が pp に入る（対象は app でなく mock）— `npm --prefix pp run mock:integrity`。下限だけでなく全幅で見る（MOCK201 / MOCK202）
- [x] モーダルの viewport 収まり・操作要素の重なり・画面間の文言と token の割れを、同じ mock 側 gate で検査する — MOCK205 / MOCK203 / MOCK204。click で初めて mount する dialog と本文中のリンク文言は検査外で、範囲は README 手順 6 に明記した
- [x] それぞれの破れを持つ合成 fixture を作り、gate が落ちることを実測する — `pp/tests/mock-integrity.spec.ts` の 13 件。5 種の破れがそれぞれ 1 回だけ発火し、健全な mock と「横スクロールが無いはみ出し」「本文中のリンク」では 0 件
- [x] 凍結手順（README 手順 4）と `/mock-freeze` skill の step を同じ内容に揃える — 双方 9 step の同じ並びで書いた
- [ ] `/mock-freeze` skill に閉包と破れ検査の段を入れる — sandbox から `.claude/skills/` へ書けないので、`drafts/seed-patch/mock-freeze-SKILL.md` を H.S. が cp して commit する
- [x] 一周実証の完了後に着手する — 着手条件は 2026-08-28 に満たされた

`width-sweep` は `PP_APP_URL` を要求するので **app しか見ない**。発注規約は「下限〜上限で成立する単一レスポンシブ HTML」を mock の要件にしているのに、それを検証する段が凍結の前にも後にも無く、違反した mock が正本になる。実装後に横スクロールとして現れるので、mock の欠陥が実装の欠陥に見える。適用先の実測（凍結 7 画面を 320 で描画すると全画面で header の nav が 4px はみ出す）で表面化した。

2026-08-28 に `mock:integrity` として入れ、適用先の凍結 mock（7 画面 + design system page）を `PP_REPO_ROOT` で指して実測した。実装済みの 7 画面は 0 件で、design system page だけが 360px と 390px で横スクロールし（document 476px）、原因の `section` 7 つを名指しした。リンク文言の割れも 1 件（同 page の header が index を「サイトを見る →」と呼ぶ）。**適用先はこれを直していない** — 二巡目の再凍結でこの検査を通す。

2026-08-28 に検査項目を広げた。適用先が FE 構築の**途中で** mock 修正を 1 回挟み（固定寸法の overflow・モーダルの 12px はみ出し・footer が click を遮る・文言の割れ・token の割れ の 5 件）、H.S. から「mock 自体の整合性の問題は、FE 構築を始める前にできた方が安い」と要望が出た。5 件はいずれも人に聞く話ではなく機械で出せる — 幅・収まり・重なり・値の割れ。`screen-loop.md ②` に「凍結前に確かめる」段を書いたので、この gate はその段の実行手段になる。

資産の重さは `mock-lint` の MOCK104 で実装済み（`d579d79`。個別 1 MB 超を挙げ、合計も出す）。処置の既定（JPEG 化・解像度・先読み・data URI）は `docs/ui-quality-policy.md` と質問票に置いた。

**ネットワークが多くなる箇所は gate にしない。** `screen-loop ④` の手順として、mock を読んで挙げる形にした（2026-08-28）。取りに行く回数は mock を見れば分かり、読むのも実装するのも同じ LLM なので、正規表現の検出器を挟む理由が無い。H.S. 指摘: 「mock を見れば時間の掛かりそうなところは見た目で判別がつく」「結局、FE 実装するのも Opus や Fable なんだから、みただけでは分かりません、という嘘は通りませんよ」。

### pp の登録点が 1 画面前提で、画面が増えると破綻する

起票: opus-5 2026-08-27
Goal: 画面が複数ある PJ でも、pp の差し替え点を画面ごとに解決できる形にする。
Work file: `pp/src/config.ts`・`pp/tests/*.spec.ts`・`pp/README.md`（差し替え点一覧）

Exit Criteria:

- [x] `READY_SELECTOR` / `MODALS` / `EDGES` / fixture / self-baseline 対象などの登録点が画面ごとに引ける形になり、各 spec は出所の参照だけを持つ — `pp/src/screens.ts`（表）と `pp/src/screen-registry.ts`（引く機構）に分け、8 spec から定数を外した
- [x] 画面を 2 枚登録して画面ごとに回し、登録点が画面ごとに解決されることを実測する — 2026-08-28 実測。seed の frontend（`/` と `/states`）へ app 側 3 spec を 2 slug 分。どちらも 4 passed / 0 skipped で、self-baseline が別名・別内容の PNG を 4 枚吐いた（16986B と 46126B）＝ route が実際に切り替わっている。未登録 slug は skip でなく error になることも実測
- [ ] 凍結 mock を持つ適用先で `npm run gate` を画面ごとに回し、どちらも skip 無しで緑になることを実測する — seed には凍結 mock が無く mock 側 spec を回せないので、実証 2 回目でここを埋める
- [x] 適用先が先行実装した形の結果報告を受け取ってから設計を確定する — 2026-08-27 受領。7 spec の diff は定数の出所だけで assertion / skip 条件は不変、slug 規則も `screenOf` と一致

先方の設計上の注意 2 点への処置: (a) 循環は型だけの import にして切った（`screens.ts` が型を `screen-registry.ts` から取り、機構が表を取る）。素の定数は `config.ts` に残してある。(b) `SELF_BASELINE_PATHS` は廃止し、self-baseline は今の画面 1 枚だけを撮る — 画面ごとに回せば全画面が 1 回ずつ撮られる。

`PP_APP_PATH` も廃止した。route が slug から引けるので、gate へ渡す env は `PP_MOCK_FILE` + `PP_APP_URL` の 2 つに戻る。

### 凍結の手順はあるが道具が無い — 閉包収集と参照スクショ

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/README.md` が定める凍結の判定則を、手作業でなく seed 同梱の tool で実行できるようにする。
Work file: `docs/presentation/ui-mock/README.md`・`pp/scripts/`

Exit Criteria:

- [x] 閉包収集（net-block 下で実描画し、404 と abort が 0 になる file 集合を出す）を行う tool が pp に入り、README の判定則から参照される — `npm --prefix pp run mock:closure`。引数なしで `export/` 全画面、`pp/artifacts/mock-closure.json` に閉包・外部 embed・取りこぼしを分けて書く
- [x] 参照スクショを fullPage・DPR 1 で基準 viewport ごとに撮る tool が pp に入る（`npm --prefix pp run mock:screenshots`。引数なしで `export/` 全画面、撮影中の 404 と abort を数えて 1 件でもあれば落ちる）
- [ ] `/mock-freeze` skill に閉包と破れ検査の段を入れる — sandbox から `.claude/skills/` へ書けないので、`drafts/seed-patch/mock-freeze-SKILL.md` を H.S. が cp して commit する
- [ ] 適用先の再凍結で 2 つの tool を実際に通す — 実証 2 回目で行う

適用先が一周の凍結時に自作した（`pp/scripts/collect-mock-closure.ts` / `pp/scripts/mock-screenshot.ts`、いずれも config の viewport・net-block・mock-server を使うだけで PJ 非依存との報告）。判定則を README に書いた時点で道具は付けていないので、次の PJ も同じ自作をする。

2026-08-27 に参照スクショ側だけ先に入れた（当初は一周の完了を待つ方針だった）。適用先が実際に撮り漏れを踏み（design system page の撮り忘れ）、原因が「seed が道具を配らないので消費側が自作し、その自作が引数必須になる」ことだと判明したため。

2026-08-28 に閉包収集を入れ、適用先の凍結 mock（7 画面 + design system page）を `PP_REPO_ROOT` で指して実測した。vendor 未登録では取りこぼし 64 件で exit 1、vendor を登録すると取りこぼし 0 件・閉包 26 file で、適用先が凍結した 26 file と一致した。Google Maps の子 frame は取りこぼしでなく外部 embed として分けて挙がる。

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。2026-08-22 に daily-stock-analyzer-25 へ差分と出典 (d7a2863) を送信済み — 実施判断は dsa 側 owner と本人の間で進む。当 session は不介入で、質問への回答のみ行う。
