# 画面追加の定常ループ

walking skeleton (seed-docs/walking-skeleton.md) を一周した後、画面を 1 枚追加するたびに回す手順。①〜⑨を順に踏む。

```text
① mock (部品→状態→画面) → ② export 凍結 + provenance pin → ②′ 表示分岐 × BE 経路 → ③ AST 抽出 + 部品候補 3 分類
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
- 凍結の前に、mock 自身が発注どおり成立しているかを `bun run --cwd pp mock:integrity` で確かめる (全幅での横スクロールとはみ出し、dialog の収まり、操作要素の重なり、画面間の文言と token の割れ)。破れは (c) 修正依頼として Claude Design へ差し戻す — **FE 実装の途中で mock を直すより桁違いに安い**
- 完了条件: mock-provenance spec が緑 (検証 gate が今回凍結した正本を向いている証明)。凍結せずに実装へ入らない — 突合先ドリフトの再発源になる

### ②′ 表示分岐 × BE 経路 (凍結直後、AST 更新の前)

- mock の JS は「空1 / 満 / 受付終了 / お休み / 祝日」のような**表示分岐を見本の論理で描いている**。実装はその分岐を BE の応答から作るので、凍結直後に分岐を全部列挙し、分岐ごとに BE の route と条件を表にする (表の雛形と実例: seed-docs/pre-implementation-questions.md「表示分岐と BE 経路」)
- 候補の列挙は `bun run --cwd pp mock:branches` が mock の JS から機械で出す (三項演算の文字列・条件付きの textContent・class 切替・case・固定値との比較)。出力は候補であって分岐そのものではないので、人が表へ写しながら取捨する
- 分岐ごとに 4 分類する: **経路あり** / **BE のバグ** (route はあるが値を落とす等) / **FE の欠落** (BE は返すが FE が使わない) / **到達不能パス** (mock の見本論理にしか無い)。後ろ 3 つは⑨と同じ裁定の場に出す
- 完了条件: 表に空欄が無く、「BE のバグ」「FE の欠落」「到達不能パス」の各行に裁定 (直す / 台帳に残す) が付いている。gate は分岐の欠落を出せない — 満席枠を BE が落としていても fixture に満席があれば緑になる — ので、この表が唯一の網

### ③ AST 抽出 + 部品候補 3 分類

- /ast-extract で凍結 export から docs/presentation/ui-ast/screens/<slug>.ui-ast.json を起こす (層の位置付けと運用: docs/ast-layer.md)
- **1 画面目の前に registry.json を design system の見本 page から起こす。** 空のまま分類に入ると突合先が無く、全部品が「新規」に落ちる (docs/ast-layer.md)
- mock 内の構成要素を「既存部品の再利用 / 新規部品 / ページ固有」に分類する。AST の kind census と registry.json の突合が分類の機械化入力 (tools/ast-viewer の部品一覧が同じ census を描く)
- 分類で確定した新規部品は registry へ追記し、あわせて design system 側へも昇格させる (docs/design-sync.md 1.3)。registry だけ増やすと、次の mock が同じ部品を持たないまま届く
- 判定規準: 同じ見た目 = 同じ部品。既存と似て非なる部品を新設しない
- AST を起こす過程で、**表示が重くなりそうな箇所に目星をつける** (取りに行く回数が多い・資産が重い)。木を一度読み切る段なので、ここで見えたものを④の対策の入力にする
- 完了条件: tools/ast_validate が緑で、分類と uncertainNodes の裁定が発注書 (または PR 説明) に列挙されていること
- 抽出できたら tools/ast-viewer の HTML を Artifact として公開し、link を裁定の場に示す。裁定は文字列でなく画と対応付けて行う

### ④ 実装前ヒアリング

- mock に写らないこと (実データの量・状態の頻度・外部依存・権限・保持) を発注側に聞く。質問票: seed-docs/pre-implementation-questions.md
- **機械で分かることは聞かない**。mock 自身の破れは②の凍結時に検査で出す
- 重い資産は `bun run --cwd pp lint:mock` の MOCK104 が挙げる。**処置は既定で決まっている** (写真の JPEG 化・表示寸法に合わせた解像度・先読み・小さいものの data URI 埋め込み) ので、聞くのは「この既定でよいか」と「粗くしてはいけないものはどれか」。`lint:mock` はこの聞き方を文面として印字するので、言い換えずそのまま貼る
- **mock を読んで、実装するとネットワークが多くなる箇所を挙げる** — 月送りのカレンダー、無限スクロール、絞り込みのたびに取り直す一覧、地図。取りに行く回数は mock を見れば分かる。部品の数は大抵問題にならない
- 重い箇所ごとに **「何が重いか / どう対策するか」を組にして示し、ユーザーの承認を得る**。承認は必須で、口頭で流さず PR 説明に残す
- 完了条件: 質問票の各項目に答えか「未定」が入り、**重い箇所への対策がユーザーに承認されている**こと。空欄や未承認のまま実装へ入らない — 対策は実装の形を決めるので、後から変えると作り直しになる

### ⑤ 新部品の単体実装 (states 込み)

- frontend/src/lib/ui/components/ に、token (frontend/src/lib/ui/tokens/tokens.css) 参照で実装する。直書きの色・寸法を持ち込まない
- states fixture を部品の完成条件にする: default / empty / loading / error / 長文、加えて touch (hover 非存在で操作完結・target 44px)
- fixture データは API schema 派生の単一データセットとし、mock と test が同源を参照する (二重管理はドリフト源)
- mock の規則から fixture を作るときは、mock に現れる変化（枠数の最大・会場の切り替わり・時間帯の端・祝日と稽古の重なり）を落とさない。落とすなら responder の隣に理由を 1 行書く。変化を削った fixture では FE の考慮不足が gate をすり抜ける（実例: picker の fixture から第 2 木曜の 3 枠目を外していて、同日 2 会場と受付窓の端の欠陥 2 件が本番手前まで残った）
- 完了条件: 基準幅 = SELECTOR_MAP 登録 + sample-parity 緑 / 状態 = 全 fixture 状態で挙動一致

### ⑥ page composition

- frontend/src/routes/ は部品の薄い合成に留める。ページにロジックや見た目の実装を書き始めたら、③に戻って部品化する
- 完了条件: page が部品参照のみで組めていること

### ⑦ 機械 gate

- 先に `pp/src/screens.ts` へこの画面を登録する (`PP_MOCK_FILE` の slug を key に、route・描画完了セレクタ・操作・fixture)。登録が無い slug で回すと gate は skip でなく error で止まる
- sample-parity (structural parity) + width-sweep + poststate-sweep + self-baseline スクショ回帰 + mock-provenance を全て実行する
- 状態の検査には browser console の error と捕まえられなかった例外も含める。この検査は登録した操作を **mobile と desktop の両方**で踏むので、`pp/src/screens.ts` の操作に幅で変わる期待値（枠一覧が出るか日セル格子かで数える対象が変わる等）を書いていると、片幅でしか通らない登録がここで初めて落ちる。期待値は幅に依らない形にする（適用先の実測、2026-09-04）
- 画面ごとに gate を終えたら `round:record <n>` をその場で回す。report は run ごとに上書きされるので、まとめて回すと最後の 1 画面しか残らない（`tools/gate-run-all.sh --round <n>` が同じことを機械で行う。分割 run のまとめ方は seed-docs/round-record.md）
- `ssr-first-paint` は `prePaintStates` を登録した画面で走る。SSR しない PJ は `pp/gate-not-applicable.json` で宣言する
- 画面が増えると self-baseline の baseline PNG も増える。`pp/tests/*-snapshots/` は追跡対象なので同じ commit に載せる (追跡しないと比較対象が消えて回帰網が空回りする)
- 状態グラフがある画面では sample-parity / page-parity の状態ごとの test も回す。凍結時と deploy 前は必ず回し、赤なら deploy せず修正へ差し戻す (所要時間の目安と上限は docs/ui-quality-policy.md)
- 完了条件: DoD 3 分類の機械側が全て「実行されて緑」。skip 混じりを緑と報告しない
- 緑になったら `bun run --cwd pp round:record <n>` でこの画面の実測（rc・所要・pass / fail / skip・状態 parity・review・LLM step）を巡の記録 `docs/presentation/ui-mock/rounds/<n>.json` に upsert し、gate と同じ commit に入れる。形式と巡番号の決め方は seed-docs/round-record.md

### ⑧ LLM スクショ一次レビュー + 人間受入

- 機械 gate とは別立ての段であり、省略しない
- LLM 一次: 全状態のスクショを「発注どおりか」ではなく「値は整合しているか・表示は意味が通るか・ユーザーがこの画面で迷わないか」で判定させる
- 人間受入: 実データで動線を歩く。実機確認を行うのはこの段のみ (機械 gate は device emulation で回す)
- 既存実装を置き換えている repo では、land の直前に旧実装との突合を 1 回入れる (seed-docs/adoption.md §2「旧実装との突合」)。pp は mock との一致しか見ないので、旧実装にあって新実装に無い機能は機械側から見えない
- 動線歩き・スクショ採取には環境で利用可能な browser 自動化 tool (agent-browser 等) を使ってよい。決定性が要る機械 gate (⑦) は Playwright 固定で、ここは置き換えない
- **飛ばせない**: LLM 一次の結果は `screen-review` skill が `docs/presentation/ui-review/<slug>.json`（対象 screenshot の sha256・指摘と処置・model / effort・日時）に書く。`bun run --cwd pp review:check` が「見本 page 以外の全画面に記録がある・sha256 が今の screenshot と一致・指摘が 0 か台帳 entry を指す」を rc で判定し、`pp/promote-commands.json` に列挙した promote 系 command は hook がこの rc を見て止める。screenshot が変われば記録は外れ、再レビューが要る
- レビューに使う model / effort は skill 側で固定（難易度 S は `screen-review-s` = opus / medium、M / L は `screen-review` = opus / high）。LLM に任せる step ごとの model / effort と難易度 S / M / L の対応は seed-docs/llm-steps.md
- 所見は `kind` で分ける: `defect`（利用者が誤った行動を取る / 操作が意図と違う結果になる）だけが promote を止める。見た目の好み・情報設計の提案・事実確認は `note`（気づき）で、記録に残して round record と表の見直しの材料にする
- 見本データの変化（枠数・会場・時間帯・曜日の違い、見本カレンダーと見本カードの値の差）は、デザイナーが FE に示唆を与えるために選んで入れたもの。整合性の欠陥として書かず、「この変化を FE が扱えるか」の検査項目（⑤ の fixture の case 候補）として気づきに書く。文字列の統一も気づき（MOCK204 の裁定と同じ線）
- 完了条件: defect ゼロ、または全 defect が⑨の裁定に載っていること。機械側は `review:check` rc 0（note の open は赤にしない）

### ⑨ 差分の裁定

- mock と実装の差分の扱いは 2 択のみ: (a) 実装を直す / (b) KEEP_IMPL 裁定として残す。口頭運用は禁止
- KEEP_IMPL は日付付き裁定として docs/presentation/ui-mock/DESIGN-POLICY.md に記録する
- (b) の entry は恒久例外ではなく「mock へ還流待ち」— 次にその画面の mock を更新するとき、裁定内容を mock へ反映して entry を閉じる (docs/design-sync.md §1.4)
- 完了条件: 未裁定の差分がゼロ

### ⑩ 本番 smoke (promote 直後、deploy する PJ のみ)

- 「全 route が 200」で終わりにしない。fixture が効かない唯一の場所なので、gate の死角 3 種をブラウザで 1 回ずつ通す
  1. **API 応答の内容**: 画面が出す値を BE の実応答と突き合わせる (件数・日付・「満席」「お休み」のような分岐が実データで出るか)。`curl -s <本番 URL>/api/<route> | head -c 2000` で応答の key と件数を見て、画面の表示と照らす
  2. **保存する状態のリロード**: テーマや言語など localStorage / cookie に保存する状態を切り替えて reload し、初回描画から保存値で出るか (一瞬だけ既定値で出ないか) を見る
  3. **history の往復**: overlay を開いた状態から別 page へ移り「戻る」で overlay が復元されるか、hash / pushState を使う画面は URL を直接開いて同じ状態になるかを見る
- 完了条件: 3 項目に赤がゼロ。赤が出たら promote を戻すか止め、修正して⑦から回し直す
- 3 項目の観測値は `docs/presentation/ui-mock/rounds/<n>.json` の `screens.<slug>.smoke` に書く。本番で後から見つかった不具合は同 `escaped` に「何が・なぜ gate が捕れなかったか・どう直したか」を書く（seed-docs/round-record.md）

## 機械 gate 緑 = 完成ではない

⑦が全緑でも⑧は省略できない。意味論バグ — 値の不整合、意味の通らない表示、押しても機能しない操作 — は structural diff もスクショ回帰もすり抜ける。だから⑧は臨時の追加検査ではなく、ループに常設された段である。
