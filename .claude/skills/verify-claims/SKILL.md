---
name: verify-claims
description: Audits a completion report by refuting each claim against repo evidence in a fresh context and writes the verification record that agent-audit reads.
when_to_use: TRIGGER when a completion report (from a subagent, codex, or a session) is about to be accepted, when "完了主張の独立検証" or "/verify-claims <report path>" is requested. SKIP for reports that only announce a start, and when the claims are already pinned by a green gate the caller reran itself.
argument-hint: <report path or pasted claims> [<record name>]
model: opus
effort: high
context: fork
agent: general-purpose
allowed-tools: Read, Bash, Glob, Grep, Write
---

# Verify Claims

完了報告の主張を 1 件ずつ証拠で反証する。実装した agent とは別の fresh context で行い、結果を `docs/presentation/ui-review/verify-<name>.json` に書く（`agent-audit` が model / effort と呼び忘れを機械で確かめる）。

## Process

1. 報告から主張を列挙する（「test が緑」「N 画面で到達不能 0」「commit X に含まれる」等）。1 主張 1 行
2. 主張ごとに反証を試みる: test は自分で再実行して pass 数を取る、commit は `git show --stat` で中身を見る、数値は artifacts か log を Read する。報告の文面を証拠にしない
3. 判定は PASS / FAIL / 未確認 の 3 値。FAIL には「実際は何だったか」の 1 文と証拠の path を付ける
4. 記録を書く: `{ "version": "1", "name": "<name>", "verifiedAt": "<ISO>", "model": "opus", "effort": "high", "agentId": "<呼び出し元が渡した id>", "claims": [{ "text": "…", "verdict": "PASS|FAIL|未確認", "evidence": "…" }] }`
5. 呼び出し元に FAIL と未確認だけを返す（PASS の羅列は返さない）

## Rules

- 実装した agent の報告を、その agent に検証させない。この skill は常に fresh context で起動する
- 「動いた」の主張は自分で動かして確かめる。動かせない主張（本番の挙動など）は 未確認 にし、PASS にしない
- model は opus、effort は high。表は seed-docs/llm-steps.md「完了主張の独立検証」

## Output

- `docs/presentation/ui-review/verify-<name>.json`
- FAIL / 未確認 の一覧（主張 / 実際 / 証拠）

## Related

- `screen-review` — 画面の意味の判定。こちらは報告の真偽
- `gate-diagnose` — gate が赤のときの原因究明
