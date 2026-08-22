# todos

## Critical

## High

### 基盤変更 — SvelteKit/Bun スタックと AST 翻訳層の導入

起票: fable-5 2026-08-22
Goal: seed の前提を SvelteKit + Vite + Bun へ移行し、mock → UI AST → shadcn 構成 → FE の翻訳層 (抽出・検証 gate・可視化 tool) を screen-loop に組み込んで walking skeleton 一周で実証する。
Work file: drafts/foundation-upgrade-handoff.md / drafts/research/foundation-upgrade-proposal.md / drafts/research/report-web-research-svelte-bun-ir.md / drafts/research/report-docs-structure-check.md / drafts/research/ir-sample/

Exit Criteria:

- [x] 提案 §5 の裁定 6 点 + 構成 A/B と導入順序の受諾にユーザー裁定が付く (全 8 点確定 2026-08-22): 置き場 = mock 凍結一式は docs/presentation/ui-mock/・AST は docs/presentation/ui-ast/ (対の dir 名 + screen slug 共通鍵で対応を可視化)・top-level の design-reference/ 廃止 / 管理単位 = 語彙 + 画面の 2 層 / shadcn-svelte 採用 / Vercel Node runtime 既定 / stitch repo アーカイブ済 / doc-conventions 採用 / 構成 A 既定 (B は Rust BE 用) / stack 置換の先行。根拠 = drafts/research/report-docs-structure-check.md
- [ ] stack 置換: design-reference/ 一式が docs/presentation/ui-mock/ へ移設され参照 (実測 58 行/19 file) が張り替わる (凍結保護 hook は同一 commit で更新)。frontend/ が SvelteKit + Bun skeleton に置換され、npm 前提 4 file (README.md・docs/design-sync.md・.claude/skills/fe-kickoff/SKILL.md・.claude/skills/mock-freeze/SKILL.md) と design-sync.md:12 の React 記述が更新される。pp は Node + Playwright 固定のまま全 spec が理由付き skip または緑
- [x] AST 基盤: ui-ast schema v0.2 + validate gate + 抽出 pass prompts + ast-tree / ast-viewer が seed に同梱される (置き場 = docs/presentation/ui-ast/、共通語彙 registry.json + 画面別 screens/*.ui-ast.json の 2 層。screen slug を ui-mock/export/*.html と共通鍵にする)。docs/ast-layer.md に背景節 (UI AST の why を研究 repo から輸入 + 将来コモディティ IR への置換可能性) を含む (ユーザー裁定 2026-08-22)
- [ ] pp 結線: SELECTOR_MAP の AST 導出・ast-provenance・ast-conformance が pp に結線される
- [ ] 一周実証: walking skeleton 一周を AST 経由で完走し、全 gate が skip でなく実行されて緑

進捗:

- [x] design 資産の移設と参照張り替え (473edcf: git mv 4 file + 参照 21 file、gates 緑、凍結 hook の新 path 陽性対照済み)。stack 置換の残 = SvelteKit + Bun skeleton (Bun install は terminal-configs へ依頼済み)
- [x] AST 基盤の第 1 増分: ui-ast schema v0.2 + ui-registry schema + tools/ast_validate (5db755c: self-test rc=0・SCHEMA/AST101..106 各 1 発火・ruff/ty 緑)
- [ ] pp 結線: ast-provenance (df27b30・陽性対照 8 件) と SELECTOR_MAP の AST 導出 (0bffa50・陽性対照 10 件) が land。残 = ast-conformance (実装の data-visual-id tree と AST tree の構造一致)
- [x] AST 基盤の残り: ast-tree / ast-viewer / ast-extract skill / docs/ast-layer.md (7e7c51c)。受け入れレビューで source.region の並びの食い違いと node の notes 不能を是正し、screen-loop ③ へ結線。ast-viewer は Chromium 実画面で 3 面・Ctrl+クリック相互ジャンプ・dark theme を実測。registry.json と screens/ の実体は最初の抽出時に生成される

## Medium

### canvas-diff の 1px 混在 offset 対応と dsa back-port

起票: fable-5 2026-08-22 (chat 提案をユーザー採用)
Goal: pp/src/canvas-diff.ts の ±1px 寸法差 crop を対角 2 点から 4 offset 全組合せ (dw=1 かつ dh=1 の混在 offset を含む) に拡張し、陽性対照で検証のうえ dsa の frontend/pp へ back-port する。

Exit Criteria:

- [ ] seed 側: 混在 offset の陽性対照 (例: mock 101x101 vs app 100x100 で余剰が左列 + 下行) が red→green で実測される
- [ ] pp typecheck 緑 + 既存の 1px/2px 陽性対照に回帰なし
- [ ] dsa の frontend/pp/src/canvas-diff.ts へ同変更を back-port し、出典 (seed 側 commit hash) を dsa 側 commit message に記す

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。
