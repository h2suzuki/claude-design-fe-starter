<!-- fe-starter:begin -->
# FE 開発規範（mock-first）

- 意匠の正本は Claude Design mock。承認済み export の凍結コピー（docs/presentation/ui-mock/export/ + mock-baseline.sha256）だけを突合先にし、mock 承認前に UI 実装へ入らない
- mock と実装の意図的差分を正当化できるのは docs/presentation/ui-mock/DESIGN-POLICY.md（KEEP_IMPL 台帳・日付付きユーザー裁定のみ）だけ。台帳にない差分は欠陥として扱う
- 完成条件は 3 分類: 基準幅 = structural pixel 一致 / 中間幅（320〜1920）= invariant / 状態 = 挙動一致。判定は pp/ のテストが行い、skip されたままの gate を「完了」と報告しない
- 立ち上げは /fe-kickoff、Claude Design への発注は /design-order、mock 確定時の凍結は /mock-freeze
<!-- fe-starter:end -->
