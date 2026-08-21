# todos

## Critical

## High

### 基盤変更 — SvelteKit/Bun スタックと AST 翻訳層の導入

起票: fable-5 2026-08-22
Goal: seed の前提を SvelteKit + Vite + Bun へ移行し、mock → UI AST → shadcn 構成 → FE の翻訳層 (抽出・検証 gate・可視化 tool) を screen-loop に組み込んで walking skeleton 一周で実証する。
Work file: drafts/foundation-upgrade-handoff.md / drafts/research/foundation-upgrade-proposal.md / drafts/research/report-web-research-svelte-bun-ir.md / drafts/research/ir-sample/

Exit Criteria:

- [ ] 提案 §5 の残裁定 6 点 (AST 置き場と凍結規律 / AST 管理単位 / shadcn-svelte を実装依存に入れるか / Vercel runtime 既定 / stitch repo の扱い / doc-conventions 採否) + §3.2 構成 A/B と §4 導入順序 (S0 先行) の受諾にユーザー裁定が付く
- [ ] S0: frontend/ が SvelteKit + Bun skeleton に置換され、npm 前提 4 file (README.md・docs/design-sync.md・.claude/skills/fe-kickoff/SKILL.md・.claude/skills/mock-freeze/SKILL.md) と design-sync.md:12 の React 記述が更新される。pp は Node + Playwright 固定のまま全 spec が理由付き skip または緑
- [ ] S1: ui-ast schema v0.2 + validate gate + 抽出 pass prompts + ast-tree / ast-viewer が seed に同梱される
- [ ] S2: SELECTOR_MAP の AST 導出・ast-provenance・ast-conformance が pp に結線される
- [ ] S3: walking skeleton 一周を AST 経由で完走し、全 gate が skip でなく実行されて緑

## Medium
