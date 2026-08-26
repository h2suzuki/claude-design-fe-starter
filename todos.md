# todos

## Critical

## High

### 基盤変更 — SvelteKit/Bun スタックと AST 翻訳層の導入

起票: fable-5 2026-08-22
Goal: seed の前提を SvelteKit + Vite + Bun へ移行し、mock → UI AST → shadcn 構成 → FE の翻訳層 (抽出・検証 gate・可視化 tool) を screen-loop に組み込んで walking skeleton 一周で実証する。
Work file: `drafts/foundation-upgrade-handoff.md` / `drafts/research/foundation-upgrade-proposal.md` / `drafts/research/report-web-research-svelte-bun-ir.md` / `drafts/research/report-docs-structure-check.md` / drafts/research/ir-sample/

Exit Criteria:

- [x] 提案 §5 の裁定 6 点 + 構成 A/B と導入順序の受諾にユーザー裁定が付く (全 8 点確定 2026-08-22): 置き場 = mock 凍結一式は docs/presentation/ui-mock/・AST は docs/presentation/ui-ast/ (対の dir 名 + screen slug 共通鍵で対応を可視化)・top-level の design-reference/ 廃止 / 管理単位 = 語彙 + 画面の 2 層 / shadcn-svelte 採用 / Vercel Node runtime 既定 / stitch repo アーカイブ済 / doc-conventions 採用 / 構成 A 既定 (B は Rust BE 用) / stack 置換の先行。根拠 = drafts/research/report-docs-structure-check.md
- [x] stack 置換: design-reference/ 一式が docs/presentation/ui-mock/ へ移設され参照 (実測 58 行/19 file) が張り替わる (凍結保護 hook は同一 commit で更新)。frontend/ が SvelteKit + Bun skeleton に置換され、npm 前提 4 file (README.md・docs/design-sync.md・.claude/skills/fe-kickoff/SKILL.md・.claude/skills/mock-freeze/SKILL.md) が更新される (design-sync.md:12 の「React 相当の DOM 構造」は mock export 自身の性質の記述で、実装スタックとは無関係 — 変更対象ではない)。pp は Node + Playwright 固定のまま全 spec が理由付き skip または緑
- [x] AST 基盤: ui-ast schema v0.2 + validate gate + 抽出 pass prompts + ast-tree / ast-viewer が seed に同梱される (置き場 = docs/presentation/ui-ast/、共通語彙 registry.json + 画面別 screens/*.ui-ast.json の 2 層。screen slug を ui-mock/export/*.html と共通鍵にする)。docs/ast-layer.md に背景節 (UI AST の why を研究 repo から輸入 + 将来コモディティ IR への置換可能性) を含む (ユーザー裁定 2026-08-22)
- [x] pp 結線: SELECTOR_MAP の AST 導出・ast-provenance・ast-conformance が pp に結線される
- [ ] 一周実証: walking skeleton 一周を AST 経由で完走し、全 gate が skip でなく実行されて緑

進捗:

- [x] design 資産の移設と参照張り替え (473edcf: git mv 4 file + 参照 21 file、gates 緑、凍結 hook の新 path 陽性対照済み)
- [x] SvelteKit + bun skeleton へ置換 (7e75f92)。bun は host install を待たず drafts/bun/ に repo-local 配置 (drafts/pw-browsers と同じ方式)。svelte-check 0 errors・build rc=0・dev server 相手に pp が 10 passed / 8 skipped / 0 failed。docs の path 記述と「npm 前提」の実際の対象は fe-kickoff の依存導入 1 行と README の構成表だけで、design-sync.md と mock-freeze の npm は pp 側 (Node 固定) ゆえ変更不要だった
- [x] AST 基盤の第 1 増分: ui-ast schema v0.2 + ui-registry schema + tools/ast_validate (5db755c: self-test rc=0・SCHEMA/AST101..106 各 1 発火・ruff/ty 緑)
- [x] gate 結線の統合リハーサル: PP_REPO_ROOT で scratch root に差し替え、合成 fixture (export + 同 sha を pin した screen AST + data-visual-id 付き静的 app) に対して ast-provenance と ast-conformance が skip でなく green になることを実測。陰性側 (tree の欠落・親違い・AST 外 id / export を触った後の provenance) も期待どおり fail。実 mock を通していないので一周実証の代替にはならない
- [x] pp 結線: ast-provenance (df27b30・陽性対照 8 件)・SELECTOR_MAP の AST 導出 (0bffa50・10 件)・ast-conformance (58e25f7・12 件、screen AST 探索を pp/src/ast-screen.ts へ共通化)。pp typecheck rc=0、suite は 12 spec すべて理由付き skip (mock と AST の実体が入るまで外れない)
- [x] AST 基盤の残り: ast-tree / ast-viewer / ast-extract skill / docs/ast-layer.md (7e7c51c)。受け入れレビューで source.region の並びの食い違いと node の notes 不能を是正し、screen-loop ③ へ結線。ast-viewer は Chromium 実画面で 3 面・Ctrl+クリック相互ジャンプ・dark theme を実測。screens/ の実体は最初の抽出時に生成される（registry.json を /ast-extract は書かないので、空台帳を配る形へ是正した）

## Medium

### BE 結合済み実装と Claude Design の往復手順が無い

起票: opus-5 2026-08-24
Goal: BE と結合した実装を持つ repo で、mock への書き戻しと mock 由来の変更の取り込みを、文書化された手順で回せるようにする。
Work file: `docs/design-sync.md`・`seed-docs/first-prompts.md`

Exit Criteria:

- [ ] 実装が呼ぶ BE を、書き戻し時に何へ置換するか（`docs/design-sync.md` の「共有 fixture module」が受け皿）と、その変換を書き戻し手順のどこで行うかを書く
- [ ] mock 側の変更を BE 結合済み FE へ戻すとき、fixture と実 BE の両方へ整合させる調整段を書く
- [ ] 一周実証の完了後に着手し、文書を先に変えてから文書どおり実行して確認する

適用先からの報告（2026-08-24）。`first-prompts.md:28` は「実装から生成した preview HTML を書き戻す」としか書いておらず、BE 呼び出しの扱いが無い。そのまま書き戻すと Claude Design 上で外部 fetch できず動かない。受け皿の概念（`design-sync.md:14,107` の共有 fixture module）は既にあるので、欠けているのは変換の位置づけ。`design-sync.md` は mock → 実装の読解と pp での pin を定めるが、既に BE と結合した実装へ戻す調整は扱っていない。新規実装では出ず、旧実装と BE を持つ repo でだけ出る。

### 既存 repo 適用の出口が未定義 — 旧実装との regression 段と main への land 手順

起票: opus-5 2026-08-24
Goal: 既存実装のある repo で一周を終えた後、旧実装との突合と main への land を、文書化された手順で完了できるようにする。
Work file: `seed-docs/adoption.md`（§2 と §8）・`seed-docs/screen-loop.md`（⑦）

Exit Criteria:

- [ ] 旧実装をどこまで参照してよいか、参照の結果 mock と差が出たときの扱い（DESIGN-POLICY への裁定登録か実装修正か）を adoption.md §2 に書く
- [ ] 一周完了後に作業 branch を main へ land し、旧実装を退役させるまでの手順を書く。deploy 先の切替と Claude Design 同期の再確立を含む
- [ ] どちらも文書を先に変えてから、その文書どおり実行して確認する

適用先からの報告（2026-08-24）で 2 件とも確認済み。screen-loop ⑦ の判定基準は mock と意味論で、旧実装と比べる段が無い。adoption.md §1 は main を凍結すると書くが、凍結を解いて作り替えた側を main にする手順が無く、§8「完了の判定」も gate が緑になるところで止まっている。いずれも新規 repo では出ない、既存 repo 適用固有の不足。

### seed 更新の取り込み経路 — merge のままか rebase へ変えるか

起票: opus-5 2026-08-24
Goal: adoption.md §6 の取り込み経路を、履歴の読みやすさと「文書どおり実行して検証済み」の両方を満たす形で確定する。
Work file: `seed-docs/adoption.md`（§6）

Exit Criteria:

- [ ] 一周実証の完了後に判断する（実証中は §6 を動かさない）
- [ ] rebase を採るなら、先に §6 を変えてから文書どおり実行し、gate 緑まで確認する。merge のまま据え置くならその理由を §6 に書く

適用先が §6 どおり merge で取り込んで gate 緑（0 failed / 12 skipped / 7 passed）に到達した後、履歴の形を理由に rebase で作り直し、それを §6 の変更として持ち込んだ（4bec574）。実証の途中で被検証物を差し替える形だったので f3c5b67 で revert し、検証済みの merge に戻した。

**rebase 側の根拠は未特定**。当初 §7 を根拠に挙げたが成立しない — §7 の判断基準は「新規プロジェクトでも同じものが要るか」= 変更の中身であって、履歴の形には触れていない（唯一の commit 言及は back-port message に出典 seed commit を記す件で、適用先の履歴とは無関係）。4bec574 と f3c5b67 の commit message にはこの誤った根拠が残っている。再検討するなら根拠から立て直す。

### 凍結の手順はあるが道具が無い — 閉包収集と参照スクショ

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/README.md` が定める凍結の判定則を、手作業でなく seed 同梱の tool で実行できるようにする。
Work file: `docs/presentation/ui-mock/README.md`・`pp/scripts/`

Exit Criteria:

- [ ] 閉包収集（net-block 下で実描画し、404 と abort が 0 になる file 集合を出す）を行う tool が pp に入り、README の判定則から参照される
- [ ] 参照スクショを fullPage・DPR 1 で基準 viewport ごとに撮る tool が pp に入る
- [ ] 一周実証の完了後に着手し、実際に凍結を 1 回通して確認する

適用先が一周の凍結時に自作した（`pp/scripts/collect-mock-closure.ts` / `pp/scripts/mock-screenshot.ts`、いずれも config の viewport・net-block・mock-server を使うだけで PJ 非依存との報告）。判定則を README に書いた時点で道具は付けていないので、次の PJ も同じ自作をする。取り込む際は実装をこちらでレビューしてから入れる。実証の途中で seed に新しい道具を足すのは被検証物の差し替えになるため、一周の完了を待つ。

### 差し替え点と機構が同じ file に同居し、seed 更新が PJ 編集と必ず衝突する

起票: opus-5 2026-08-27
Goal: seed の機構更新が、PJ が埋めた差し替え点を巻き込まずに届くようにする。
Work file: `pp/src/net-block.ts`・`pp/scripts/mock-lint.mjs`・`tools/install.sh`

Exit Criteria:

- [ ] PJ が埋める値（`VENDOR_ROUTES`・`ALLOWED_EXTERNAL` 等）と機構コードが別 file に分かれ、install.sh の 3 分類で機構側が「旧 seed 版」と判定されて黙って更新される
- [ ] 分離後に、PJ 側の値を埋めた状態で install.sh を再実行し、値が保たれたまま機構だけ更新されることを実測する
- [ ] 一周実証の完了後に着手する（分離自体が PJ 側に merge を強いるため）

`pp/src/net-block.ts` は `VENDOR_ROUTES`（差し替え点）と `installNetworkGuard`（機構）を同居させており、PJ が値を埋めた時点で install.sh からは foreign file になる。今回 CORS header の修正を seed に入れたが、適用先はこの理由で seed 版を受け取れず、自分で当てた修正を使い続ける。`pp/scripts/mock-lint.mjs` の `ALLOWED_EXTERNAL` も同型。

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。2026-08-22 に daily-stock-analyzer-25 へ差分と出典 (d7a2863) を送信済み — 実施判断は dsa 側 owner と本人の間で進む。当 session は不介入で、質問への回答のみ行う。
