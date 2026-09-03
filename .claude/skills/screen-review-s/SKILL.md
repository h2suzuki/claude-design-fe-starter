---
name: screen-review-s
description: Difficulty-S variant of screen-review (medium effort); reviews the frozen screenshots of one simple screen and writes the machine-checkable review record that review:check reads.
when_to_use: TRIGGER when screen-loop step 8 "LLM スクショ一次レビュー" is due for a screen whose difficulty is S in pp/artifacts/difficulty.json, or when "/screen-review-s <slug>" is invoked. SKIP for M / L screens (use screen-review), for pixel or structural comparison (that is pp's job) and for screens whose review record is green in review:check.
argument-hint: <screen slug>
model: opus
effort: medium
context: fork
agent: general-purpose
allowed-tools: Read, Bash, Write, Glob, Grep
---

# Screen Review

screen-loop ⑧ の LLM 一次レビュー。凍結 screenshot を「発注どおりか」ではなく「値は整合しているか / 表示は意味が通るか / ユーザーがこの画面で迷わないか」で判定し、結果を `docs/presentation/ui-review/<slug>.json` に書く。記録が無い・古い・未裁定の指摘があると `bun run --cwd pp review:check` が赤になり、promote 前の hook が止める。

## Process

1. `bun run --cwd pp review:check -- --template <slug>` で雛形（対象 screenshot と sha256 が埋まった JSON）を得る
2. 雛形に載った screenshot を **1 枚ずつ Read で開いて見る**（mobile / desktop、root と各状態）。一覧で済ませない
3. 各 screenshot について次を判定し、疑わしい点を指摘として書く:
   - 値の整合: 件数・日付・金額・残数が画面内で矛盾しないか（例: 「空 3」なのに枠が 2 行）
   - 意味: 文言と状態が噛み合っているか（受付終了なのに押せそうに見える等）
   - 迷わないか: 次に何をすればよいかが一目で分かるか、閉じる手段があるか
   - **指摘しないもの**: 本番で BE の実データに置き換わる見本データの値（②′ の表で BE 由来の表示。見本カレンダーと見本カードの時刻が食い違う等）。文言の言い回し・揃え方の違いは気づきであって不具合ではない（mock:integrity の MOCK204 と同じ線）
4. 指摘ごとに `kind` と処置を付ける。`kind` は `defect`（利用者が誤った行動を取る / 操作が意図と違う結果になる。例: 月を送っても前月の枠で決定される、エラー帯が埋めた項目も列挙する）か `advice`（見た目の好み・情報設計の提案・事実確認の依頼。promote は止めない）。処置は `fixed`（app か mock を直した。直した commit を text に添える）/ `keep-impl:<DESIGN-POLICY.md の entry 文字列>`（日付付き裁定として台帳に載せた）/ `open`（未裁定。defect の open が残ると review:check が赤のまま。advice の open は残してよい）
5. `model` / `effort` / `reviewedAt`（Write する時点の ISO 時刻。`date -u +%Y-%m-%dT%H:%M:%SZ` の値）を埋め、`docs/presentation/ui-review/<slug>.json` に Write する。`agentId` は空文字のままでよい — fork は自分の id を知れないので、`agent-audit` が transcript の `attributionSkill` と `reviewedAt` の時刻で帰属を引く
6. `bun run --cwd pp review:check` を回し、その画面の行が緑になったことを確かめて終える

## Rules

- 判定は上の 3 観点に限る。pixel 一致・寸法・token は機械 gate の領分で、ここで数えない（意匠の判断を機械に強制しない規約と同じ線）
- 指摘の text は「どの画面の / 何が / 誰がどう困るか」の日常語で書く。部品名や selector を主語にしない
- screenshot が変われば sha256 が外れて記録は無効になる。再レビューでは変わった枚だけ見直してよいが、記録は全枚ぶん書き直す
- model / effort は frontmatter が固定する（難易度 S は `screen-review-s`、M / L はこの skill。表は seed-docs/llm-steps.md ⑧）。理由は docs/ui-quality-policy.md「レビューに使う LLM の model と effort」

## Output

- `docs/presentation/ui-review/<slug>.json`（版 1、対象 screenshot と sha256、指摘と処置、model / effort / reviewedAt）
- 呼び出し元への報告: 見た枚数、指摘の件数と処置の内訳、review:check のその画面の行

## Related

- `mock-freeze` — 記録の対象になる screenshot を凍結する手順
- `design-order` — `keep-impl` にせず mock を直す場合の修正依頼の組み立て
