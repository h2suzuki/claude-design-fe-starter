---
name: design-order
description: Assemble a paste-ready order prompt for Claude Design from the seed's order template.
when_to_use: TRIGGER when about to request a design system, a new screen mock, or a mock revision from Claude Design. SKIP for FE implementation orders inside the repo, which follow docs/ui-quality-policy.md instead.
---

# Design Order

Claude Design へ持ち込む発注文を、発注規約込みで組み立てる。規約の正は `seed-docs/design-order-template.md`、例文の正は `seed-docs/first-prompts.md`。

## Process

1. 発注の種類を特定する: (a) design system 生成 / (b) 新画面 mock / (c) 既存 mock の修正
2. (a)(b) は `seed-docs/first-prompts.md` の該当例文を base に `{{...}}` を実値で埋める
3. 発注規約 block を必ず末尾に添付する。docs/ 4 本は repo/agent 側の規約なので持ち込まない
4. (c) は修正手段を使い分ける: 構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集
5. 完成後の流れを発注文に含める: 完成宣言 → export 一式の取得 → /mock-freeze で凍結

## Rules

- 部品ごとに states 一式（default/focus/disabled/loading/error/empty/長文）を要求する
- 320〜1920 の単一レスポンシブを要件に含める（幅別の別 mock を作らせない）
- mock 内に生まれた新部品は design system 側へ登録させる（mock project 内に孤立させない）

## Related

- `fe-kickoff` — day-0 セットアップ（2 project 体制の準備を含む）
- `mock-freeze` — 発注が完成宣言に至った後の凍結手順
