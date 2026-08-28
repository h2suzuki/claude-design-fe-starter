# 画面追加の定常ループ

walking skeleton (seed-docs/walking-skeleton.md) を一周した後、画面を 1 枚追加するたびに回す手順。①〜⑨を順に踏む。

```text
① mock (部品→状態→画面) → ② export 凍結 + provenance pin → ③ AST 抽出 + 部品候補 3 分類
→ ④ 実装前ヒアリング → ⑤ 新部品の単体実装 (states 込み) → ⑥ page composition
→ ⑦ 機械 gate → ⑧ LLM 一次レビュー + 人間受入 → ⑨ 差分の裁定
```

## DoD 3 分類

各段の完了条件は、この 3 分類のいずれかに紐付く。

| 分類 | 検証内容 | gate |
|---|---|---|
| 基準幅 | structural pixel 一致 (token / clamp / % の構造契約で mock と一致) | sample-parity |
| 中間幅 | invariant (`SWEEP_WIDTHS` の全幅で崩れ・衝突・欠落・横スクロールが無い) | width-sweep |
| 状態 | 挙動一致 (全状態の表示と、状態遷移後のレイアウト安定) | states fixture + poststate-sweep |

## 各段の手順と完了条件

### ① mock (Claude Design)

- 部品 → 状態 → 画面の順で発注する。ライブラリ (design system) の部品を参照して組み、新部品が要るなら先に states 込みの部品として提示させてから画面に合成する (プロンプト例: seed-docs/first-prompts.md)
- 完了条件: mock 上でフィードバックが収束し、完成宣言が出ていること。壊れた実装ではなく品質の良い mock にフィードバックを収束させるのがレビュー速度の要

### ② export 凍結 + provenance pin

- /mock-freeze で export 一式を docs/presentation/ui-mock/export/ へ置き、sha256 を docs/presentation/ui-mock/mock-baseline.sha256 に pin する (手順詳細: docs/presentation/ui-mock/README.md)
- 凍結の前に、mock 自身が発注どおり成立しているかを確かめる (下限幅での横スクロールとはみ出し、モーダルの収まり、操作要素の重なり、画面間の文言と token の割れ)。破れは (c) 修正依頼として Claude Design へ差し戻す — **FE 実装の途中で mock を直すより桁違いに安い**
- 完了条件: mock-provenance spec が緑 (検証 gate が今回凍結した正本を向いている証明)。凍結せずに実装へ入らない — 突合先ドリフトの再発源になる

### ③ AST 抽出 + 部品候補 3 分類

- /ast-extract で凍結 export から docs/presentation/ui-ast/screens/<slug>.ui-ast.json を起こす (層の位置付けと運用: docs/ast-layer.md)
- mock 内の構成要素を「既存部品の再利用 / 新規部品 / ページ固有」に分類する。AST の kind census と registry.json の突合が分類の機械化入力 (tools/ast-viewer の部品一覧が同じ census を描く)
- 判定規準: 同じ見た目 = 同じ部品。既存と似て非なる部品を新設しない
- AST を起こす過程で、**表示が重くなりそうな箇所に目星をつける** (取りに行く回数が多い・資産が重い)。木を一度読み切る段なので、ここで見えたものを④の対策の入力にする
- 完了条件: tools/ast_validate が緑で、分類と uncertainNodes の裁定が発注書 (または PR 説明) に列挙されていること
- 抽出できたら tools/ast-viewer の HTML を Artifact として公開し、link を裁定の場に示す。裁定は文字列でなく画と対応付けて行う

### ④ 実装前ヒアリング

- mock に写らないこと (実データの量・状態の頻度・外部依存・権限・保持) を発注側に聞く。質問票: seed-docs/pre-implementation-questions.md
- **機械で分かることは聞かない**。mock 自身の破れは②の凍結時に検査で出す
- 重い資産は `npm --prefix pp run lint:mock` の MOCK104 が挙げる。**処置は既定で決まっている** (写真の JPEG 化・表示寸法に合わせた解像度・先読み・小さいものの data URI 埋め込み) ので、聞くのは「この既定でよいか」と「粗くしてはいけないものはどれか」
- **mock を読んで、実装するとネットワークが多くなる箇所を挙げる** — 月送りのカレンダー、無限スクロール、絞り込みのたびに取り直す一覧、地図。取りに行く回数は mock を見れば分かる。部品の数は大抵問題にならない
- 重い箇所ごとに **「何が重いか / どう対策するか」を組にして示し、ユーザーの承認を得る**。承認は必須で、口頭で流さず PR 説明に残す
- 完了条件: 質問票の各項目に答えか「未定」が入り、**重い箇所への対策がユーザーに承認されている**こと。空欄や未承認のまま実装へ入らない — 対策は実装の形を決めるので、後から変えると作り直しになる

### ⑤ 新部品の単体実装 (states 込み)

- frontend/src/lib/ui/components/ に、token (frontend/src/lib/ui/tokens/tokens.css) 参照で実装する。直書きの色・寸法を持ち込まない
- states fixture を部品の完成条件にする: default / empty / loading / error / 長文、加えて touch (hover 非存在で操作完結・target 44px)
- fixture データは API schema 派生の単一データセットとし、mock と test が同源を参照する (二重管理はドリフト源)
- 完了条件: 基準幅 = SELECTOR_MAP 登録 + sample-parity 緑 / 状態 = 全 fixture 状態で挙動一致

### ⑥ page composition

- frontend/src/routes/ は部品の薄い合成に留める。ページにロジックや見た目の実装を書き始めたら、③に戻って部品化する
- 完了条件: page が部品参照のみで組めていること

### ⑦ 機械 gate

- 先に `pp/src/screens.ts` へこの画面を登録する (`PP_MOCK_FILE` の slug を key に、route・描画完了セレクタ・操作・fixture)。登録が無い slug で回すと gate は skip でなく error で止まる
- sample-parity (structural parity) + width-sweep + poststate-sweep + self-baseline スクショ回帰 + mock-provenance を全て実行する
- 画面が増えると self-baseline の baseline PNG も増える。`pp/tests/*-snapshots/` は追跡対象なので同じ commit に載せる (追跡しないと比較対象が消えて回帰網が空回りする)
- 完了条件: DoD 3 分類の機械側が全て「実行されて緑」。skip 混じりを緑と報告しない

### ⑧ LLM スクショ一次レビュー + 人間受入

- 機械 gate とは別立ての段であり、省略しない
- LLM 一次: 全状態のスクショを「発注どおりか」ではなく「値は整合しているか・表示は意味が通るか・ユーザーがこの画面で迷わないか」で判定させる
- 人間受入: 実データで動線を歩く。実機確認を行うのはこの段のみ (機械 gate は device emulation で回す)
- 動線歩き・スクショ採取には環境で利用可能な browser 自動化 tool (agent-browser 等) を使ってよい。決定性が要る機械 gate (⑦) は Playwright 固定で、ここは置き換えない
- 完了条件: 指摘ゼロ、または全指摘が⑨の裁定に載っていること

### ⑨ 差分の裁定

- mock と実装の差分の扱いは 2 択のみ: (a) 実装を直す / (b) KEEP_IMPL 裁定として残す。口頭運用は禁止
- KEEP_IMPL は日付付き裁定として docs/presentation/ui-mock/DESIGN-POLICY.md に記録する
- (b) の entry は恒久例外ではなく「mock へ還流待ち」— 次にその画面の mock を更新するとき、裁定内容を mock へ反映して entry を閉じる (docs/design-sync.md §1.4)
- 完了条件: 未裁定の差分がゼロ

## 機械 gate 緑 = 完成ではない

⑦が全緑でも⑧は省略できない。意味論バグ — 値の不整合、意味の通らない表示、押しても機能しない操作 — は structural diff もスクショ回帰もすり抜ける。だから⑧は臨時の追加検査ではなく、ループに常設された段である。
