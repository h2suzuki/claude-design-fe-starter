---
name: design-order
description: Assemble a paste-ready order prompt for Claude Design from the seed's order template.
when_to_use: TRIGGER when about to request a design system, a new screen mock, or a mock revision from Claude Design. SKIP for FE implementation orders inside the repo, which follow docs/ui-quality-policy.md instead.
---

# Design Order

Claude Design へ持ち込む発注文を、発注規約込みで組み立てる。規約の正は `seed-docs/design-order-template.md`、例文の正は `seed-docs/first-prompts.md`。

## Process

1. 発注の種類を特定する: (a) design system 生成 / (b) 新画面 mock / (c) 既存 mock の修正
2. (a)(b) は `seed-docs/first-prompts.md` の該当例文を base に `{{...}}` を実値で埋め、発注規約 block を末尾に添付する。docs/ 4 本は repo/agent 側の規約なので持ち込まない
3. (a)(b) は完成後の流れも含める: 完成宣言 → export 一式の取得 → /mock-freeze で凍結
4. (c) は修正手段を使い分ける: 構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集
5. (c) に発注規約 block と完成後の流れを**付けない**。規約は day-0 に渡してあり、修正依頼への再掲は「規約を根拠にデザイン全体へ手を入れる」誘因になる。完成後の流れは発注側の段取りで、デザイナーには関係しない
6. (c) は直す箇所の列挙に加えて **「他の画面・部品は変えない」「同じ形式で再 export する」** の 2 行を必ず書く

## Rules

- (a)(b) の発注文に含める要件: 部品ごとに states 一式（default/focus/disabled/loading/error/empty/長文）を要求する
- (a)(b) の発注文に含める要件: `pp/src/config.ts` の `SWEEP_WIDTHS` の下限〜上限で成立する単一レスポンシブにする（幅別の別 mock を作らせない）
- mock 内に生まれた新部品は design system 側へ登録させる（mock project 内に孤立させない）
- 修正依頼で「ついでに」他を直させない。範囲を広げたくなったら (b) として別に発注する

## Related

- `fe-kickoff` — day-0 セットアップ（2 project 体制の準備を含む）
- `mock-freeze` — 発注が完成宣言に至った後の凍結手順
