<!-- fe-starter:begin -->
# FE 開発規範（mock-first）

- 意匠の正本は Claude Design mock。承認済み export の凍結コピー（docs/presentation/ui-mock/export/ + mock-baseline.sha256）だけを突合先にする。凍結前に frontend/src/lib/ui/・routes/ へ書こうとすると hook が止める
- mock と実装の差分は pp/ が全て落とす。docs/presentation/ui-mock/DESIGN-POLICY.md（KEEP_IMPL 台帳）は日付付きユーザー裁定の記録であって、gate の抜け道ではない
- 完成条件は 3 分類: 基準幅 = structural pixel 一致 / 中間幅（320〜1920）= invariant / 状態 = 挙動一致。判定は `npm --prefix pp run gate` が行い、skip が 1 件でも残れば落ちる
<!-- fe-starter:end -->
