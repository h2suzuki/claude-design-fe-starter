# todos

## Critical

## High

### KEEP_IMPL 台帳が pp と結線されていない

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/DESIGN-POLICY.md` に登録した意図的差分を、gate が「差分」として扱わない形で機械に伝える。
Work file: `docs/presentation/ui-mock/DESIGN-POLICY.md`・`pp/src/diff.ts`・`pp/tests/page-parity.spec.ts`

Exit Criteria:

- [ ] 台帳の entry が `sample-parity` と `page-parity` の判定に効き、登録済みの差分では落ちない
- [ ] 台帳に無い差分は従来どおり落ちることを、陽性・陰性の両方で実測する
- [ ] 台帳の書式（対象 visual id・画面・日付・裁定理由）が schema か spec で機械検査される

着手条件は最初の entry が立つこと。適用先は第 1 版で候補 2 件（calendar modal の 12px はみ出し / index の固定 box）を持っていたが、第 2 版 mock で両方とも mock 側が直り消えた（2026-08-27 報告）。

**`page-parity` は画面まるごとの pixel 一致なので、KEEP_IMPL が 1 件でも立った瞬間に必ず落ちる。** 結線はその前に済ませる必要がある。

2026-08-28: 適用先が画像軽量化で 14 spec を赤にし、台帳 entry を立てた。ただしこれは**画像の中身の差**で、`page-parity` の対象外にする方が筋だったので、img/picture/video の領域を pixel 比較から外した（`fb0a7fd`。置かれ方は比較する）。あわせて DESIGN-POLICY に「既定の処置に従った軽量化は載せない」を規定。**着手条件（意匠の意図的差分が 1 件立つ）はまだ来ていない。**

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

### seed 更新の取り込み経路 — merge のままか rebase へ変えるか

起票: opus-5 2026-08-24
Goal: adoption.md §6 の取り込み経路を、履歴の読みやすさと「文書どおり実行して検証済み」の両方を満たす形で確定する。
Work file: `seed-docs/adoption.md`（§6）

Exit Criteria:

- [x] 一周実証の完了後に判断する（実証中は §6 を動かさない）— 着手条件は 2026-08-28 に満たされた（判断自体はこれから）
- [ ] rebase を採るなら、先に §6 を変えてから文書どおり実行し、gate 緑まで確認する。merge のまま据え置くならその理由を §6 に書く

適用先が §6 どおり merge で取り込んで gate 緑（0 failed / 12 skipped / 7 passed）に到達した後、履歴の形を理由に rebase で作り直し、それを §6 の変更として持ち込んだ（4bec574）。実証の途中で被検証物を差し替える形だったので f3c5b67 で revert し、検証済みの merge に戻した。

**rebase 側の根拠は未特定**。当初 §7 を根拠に挙げたが成立しない — §7 の判断基準は「新規プロジェクトでも同じものが要るか」= 変更の中身であって、履歴の形には触れていない（唯一の commit 言及は back-port message に出典 seed commit を記す件で、適用先の履歴とは無関係）。4bec574 と f3c5b67 の commit message にはこの誤った根拠が残っている。再検討するなら根拠から立て直す。

### mock 自身の破れを凍結前に機械で出す

起票: opus-5 2026-08-27
Goal: 正本にする前に、mock 自身が発注どおり成立しているかを機械で確かめられるようにする。
Work file: `pp/tests/`・`docs/presentation/ui-mock/README.md`・`.claude/skills/mock-freeze/SKILL.md`

Exit Criteria:

- [ ] 凍結 export を `SWEEP_WIDTHS` の下限で描画し、横スクロールとはみ出しが無いことを検査する gate が pp に入る（対象は app でなく mock）
- [ ] モーダルの viewport 収まり・操作要素の重なり・画面間の文言と token の割れを、同じ mock 側 gate で検査する
- [ ] それぞれの破れを持つ合成 fixture を作り、gate が落ちることを実測する
- [ ] 凍結手順（README 手順 4）と `/mock-freeze` skill の step を同じ内容に揃える
- [x] 一周実証の完了後に着手する — 着手条件は 2026-08-28 に満たされた（作業自体はこれから）

`width-sweep` は `PP_APP_URL` を要求するので **app しか見ない**。発注規約は「下限〜上限で成立する単一レスポンシブ HTML」を mock の要件にしているのに、それを検証する段が凍結の前にも後にも無く、違反した mock が正本になる。実装後に横スクロールとして現れるので、mock の欠陥が実装の欠陥に見える。適用先の実測（凍結 7 画面を 320 で描画すると全画面で header の nav が 4px はみ出す）で表面化した。当面は README 手順 4 の目視で埋めているが、目視は gate ではない。

2026-08-28 に検査項目を広げた。適用先が FE 構築の**途中で** mock 修正を 1 回挟み（固定寸法の overflow・モーダルの 12px はみ出し・footer が click を遮る・文言の割れ・token の割れ の 5 件）、H.S. から「mock 自体の整合性の問題は、FE 構築を始める前にできた方が安い」と要望が出た。5 件はいずれも人に聞く話ではなく機械で出せる — 幅・収まり・重なり・値の割れ。`screen-loop.md ②` に「凍結前に確かめる」段を書いたので、この gate はその段の実行手段になる。

資産の重さは `mock-lint` の MOCK104 で実装済み（`d579d79`。個別 1 MB 超を挙げ、合計も出す）。処置の既定（JPEG 化・解像度・先読み・data URI）は `docs/ui-quality-policy.md` と質問票に置いた。

**ネットワークが多くなる箇所は gate にしない。** `screen-loop ④` の手順として、mock を読んで挙げる形にした（2026-08-28）。取りに行く回数は mock を見れば分かり、読むのも実装するのも同じ LLM なので、正規表現の検出器を挟む理由が無い。H.S. 指摘: 「mock を見れば時間の掛かりそうなところは見た目で判別がつく」「結局、FE 実装するのも Opus や Fable なんだから、みただけでは分かりません、という嘘は通りませんよ」。

### pp の登録点が 1 画面前提で、画面が増えると破綻する

起票: opus-5 2026-08-27
Goal: 画面が複数ある PJ でも、pp の差し替え点を画面ごとに解決できる形にする。
Work file: `pp/src/config.ts`・`pp/tests/*.spec.ts`・`pp/README.md`（差し替え点一覧）

Exit Criteria:

- [ ] `READY_SELECTOR` / `MODALS` / `EDGES` / fixture / self-baseline 対象などの登録点が画面ごとに引ける形になり、各 spec は出所の参照だけを持つ
- [ ] 画面を 2 枚以上持つ状態で `npm run gate` を画面ごとに回し、どちらも skip 無しで緑になることを実測する
- [x] 適用先が先行実装した形の結果報告を受け取ってから設計を確定する — 2026-08-27 受領。7 spec の diff は定数の出所だけで assertion / skip 条件は不変、slug 規則も `screenOf` と一致

先方の設計上の注意 2 点: (a) `config.ts` → registry → fixture → `config.ts` の import が循環するので、`MOCK_ENTRY_FILE` / `PP_PINNED_NOW_ISO` のような素の定数は config に残し registry は別 module にする。(b) `SELF_BASELINE_PATHS` は画面横断の 1 配列なので、画面を足すと全画面分の baseline test が増える（画面別にするなら registry の entryPath から組める）。

現行の spec は登録点を spec 内の定数で持つ設計で、画面が 1 枚の間は成立するが、2 枚目からは同じ定数を画面ごとに切り替える先が無い。適用先が `pp/src/screens.ts` に画面別 registry を置き、`PP_MOCK_FILE` の slug（`screenOf` と同じ規則）で選ぶ形を先に実装して結果を報告する予定。seed へ取り込むかはその報告を見てから決める。一周実証の途中で seed の構造を変えると被検証物の差し替えになるため、着手は一周の完了後。

### 凍結の手順はあるが道具が無い — 閉包収集と参照スクショ

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/README.md` が定める凍結の判定則を、手作業でなく seed 同梱の tool で実行できるようにする。
Work file: `docs/presentation/ui-mock/README.md`・`pp/scripts/`

Exit Criteria:

- [ ] 閉包収集（net-block 下で実描画し、404 と abort が 0 になる file 集合を出す）を行う tool が pp に入り、README の判定則から参照される
- [x] 参照スクショを fullPage・DPR 1 で基準 viewport ごとに撮る tool が pp に入る（`npm --prefix pp run mock:screenshots`。引数なしで `export/` 全画面、撮影中の 404 と abort を数えて 1 件でもあれば落ちる）
- [x] 一周実証の完了後に着手し、実際に凍結を 1 回通して確認する — 着手条件は 2026-08-28 に満たされた（作業自体はこれから）

適用先が一周の凍結時に自作した（`pp/scripts/collect-mock-closure.ts` / `pp/scripts/mock-screenshot.ts`、いずれも config の viewport・net-block・mock-server を使うだけで PJ 非依存との報告）。判定則を README に書いた時点で道具は付けていないので、次の PJ も同じ自作をする。

2026-08-27 に参照スクショ側だけ先に入れた（当初は一周の完了を待つ方針だった）。適用先が実際に撮り漏れを踏み（design system page の撮り忘れ）、原因が「seed が道具を配らないので消費側が自作し、その自作が引数必須になる」ことだと判明したため。実証で見つかった欠陥の修正であって、被検証物の差し替えではない。閉包収集（file 集合の出力）は未着手のまま。

### 差し替え点と機構が同じ file に同居し、seed 更新が PJ 編集と必ず衝突する

起票: opus-5 2026-08-27
Goal: seed の機構更新が、PJ が埋めた差し替え点を巻き込まずに届くようにする。
Work file: `pp/src/net-block.ts`・`pp/scripts/mock-lint.mjs`・`tools/install.sh`

Exit Criteria:

- [ ] PJ が埋める値（`VENDOR_ROUTES`・`ALLOWED_EXTERNAL` 等）と機構コードが別 file に分かれ、install.sh の 3 分類で機構側が「旧 seed 版」と判定されて黙って更新される
- [ ] 分離後に、PJ 側の値を埋めた状態で install.sh を再実行し、値が保たれたまま機構だけ更新されることを実測する
- [x] 一周実証の完了後に着手する（分離自体が PJ 側に merge を強いるため）— 着手条件は 2026-08-28 に満たされた（作業自体はこれから）

`pp/src/net-block.ts` は `VENDOR_ROUTES`（差し替え点）と `installNetworkGuard`（機構）を同居させており、PJ が値を埋めた時点で install.sh からは foreign file になる。今回 CORS header の修正を seed に入れたが、適用先はこの理由で seed 版を受け取れず、自分で当てた修正を使い続ける。`pp/scripts/mock-lint.mjs` の `ALLOWED_EXTERNAL` も同型。

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。2026-08-22 に daily-stock-analyzer-25 へ差分と出典 (d7a2863) を送信済み — 実施判断は dsa 側 owner と本人の間で進む。当 session は不介入で、質問への回答のみ行う。
