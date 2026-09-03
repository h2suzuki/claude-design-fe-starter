---
name: gate-diagnose
description: Diagnoses a red pp gate from its artifacts (style, geometry and pixel diffs, unreachable states) in a fresh context and reports the root cause with the evidence line for each finding.
when_to_use: TRIGGER when a pp gate (sample-parity, page-parity, width-sweep, poststate-sweep, self-baseline) is red and the cause is not obvious from the failure line, when "gate の赤を診断" or "/gate-diagnose <slug>" is requested. SKIP when the failure line already names a missing visual id or a missing registration (fix directly), and for green gates.
argument-hint: <screen slug> [<spec name>]
model: opus
effort: high
context: fork
agent: general-purpose
allowed-tools: Read, Bash, Glob, Grep
---

# Gate Diagnose

screen-loop ⑦ の赤を、実装した agent とは別の fresh context で読み解く。成果物は「原因 1 文 + 証拠の行 + 直す場所」の一覧で、code は直さない（直すのは発注側か codex）。

## Process

1. 赤の spec を 1 本だけ再実行し、失敗行と artifacts の path を得る（`npm test --prefix pp -- tests/<spec>.spec.ts`。`PP_MOCK_FILE` と `PP_APP_URL` は呼び出し元から受け取る）
2. artifacts を読む: `pp/artifacts/**` の summary json（style / geometry の diff）、`page-parity` の mock / app / diff PNG（Read で開いて見る）、状態 test なら `docs/presentation/ui-mock/states/<slug>.json` の辺
3. 失敗ごとに次を確かめてから原因を書く: mock と app の CSS 契約（token / clamp / %）の差か、fixture の値の差か、描画の非決定（blur 下の ±1〜3/255、font の読み込み待ち）か、到達不能（visualId の欠落）か
4. 原因 1 文 / 証拠（file:line か artifact の path と数値）/ 直す場所（app の file か mock か fixture か seed の pp）を並べて返す。推測で埋めた箇所は「未確認」と書く

## Rules

- 診断だけ行い、app / mock / pp を書き換えない。書き換えは発注側の判断（境界を超える修正は codex）
- 「軽微」に分類しない。定数と実測の不一致は原因を 1 文で言えるまで軽微ではない（docs/ui-quality-policy.md「land 前の検証」）
- 難易度 L の画面（trial のような picker + calendar + history）では artifacts が数十状態ぶん出る。失敗した状態から 5 件を読み、残りは同型かどうかだけ確かめる
- model は opus、effort は high。表は seed-docs/llm-steps.md ⑦

## Output

失敗ごとの一覧（原因 / 証拠 / 直す場所 / 未確認の点）と、再実行した command と rc

## Related

- `screen-review` — 意味の判定は別 skill。ここは機械 gate の赤の原因だけ
