# LLM step の model と effort

screen-loop（seed-docs/screen-loop.md）のうち LLM に任せる step について、使う model と effort を **事前に** 決める。決めておかないと発注側の LLM がその場で選び、判断の質が run ごとに揺れる。決定的に判定できる検査（pixel・寸法・token・sha256・skip）は LLM に投げない（docs/ui-quality-policy.md「レビューに使う LLM の model と effort」）。

## 難易度 S / M / L

画面ごとに 3 段で決める。材料は機械で出る値だけを使う。

| 段 | 状態数（`docs/presentation/ui-mock/states/<slug>.json` の viewport ごとの states） | BE route 数（②′ の表の「経路あり」行の route） | overlay / history / form |
| --- | --- | --- | --- |
| S | 1 | 0 | 無し |
| M | 2〜10 | 1〜2 | dialog 1 つまで |
| L | 11 以上 | 3 以上 | overlay + history（pushState / hash）+ 入力 form のいずれか 2 つ以上 |

1 つでも上の段に当たれば上の段にする（状態 5 でも BE route 3 なら L）。

## executor（誰がやるか）

model の前に executor を決める。3 値で、規則は tool-role-delegation / codex-delegation skill の基準に従う。

| executor | 使う場面 | 決め方 |
| --- | --- | --- |
| Claude 本体 | 委譲境界の内側の実装（2 file 以下かつ 50 行以下、単一 approach、検証 1 回）と、仕様・方向・bug 発見・結果の review | 境界の内側は委譲しない |
| Claude subagent | judgment / vision の step（②′ ③ ⑧ 独立検証 ⑦ の診断）と起草（④ ⑨）と smoke（⑩）。実装した agent と別の fresh context | model / effort は下表 |
| codex（/codex:rescue、`--write`、隔離 worktree） | 委譲境界を超える実装（3 file 以上か 51 行以上か複数 approach）と、高リスク変更（auth / data-loss / race / history）の cross-model review | model は正式 id: S = gpt-5.6-luna（既定 effort）/ M = gpt-5.6-terra（既定）/ L = gpt-5.6-sol high。cross-model review は gpt-5.6-sol xhigh。xhigh は例外用途。codex plugin が無い環境では Claude subagent（下表の ⑤⑥ 列）に fallback し、fallback したことを成果物に書く |

codex の effort 規則は codex-delegation skill のまま: 機械的作業は minimal / low、通常実装は既定、正しさクリティカルや設計判断を含む実装だけ high。

## 対応表（Claude subagent の model / effort）

model は判定の種類（vision / judgment / 起草）で決め、effort は難易度で上げる。`Opus` はその時点で使える最上位の汎用 model、`Sonnet` はその 1 段下を指す。effort は low / medium / high / xhigh の 4 段。

| step | 処理内容 | S | M | L | 根拠 |
| --- | --- | --- | --- | --- | --- |
| ②′ 表示分岐 × BE 経路 | `mock:branches` の候補を route・field・filter に対応付け、無い経路をバグ / 到達不能に分類する | Opus medium | Opus high | Opus high | 取りこぼしが本番バグに直結する（実績: 13 分岐からバグ 3 件）。Sonnet に落とさない |
| ③ AST 抽出（macro / leaf / reconcile） | 構造の分類、nodeRef の一意化、uncertainNodes の判定 | Opus medium | Opus high | Opus xhigh | L では nodeRef の二重一致や状態限定 id が要り、reconcile の見落としは後で「到達不能」として出る |
| ④ 実装前ヒアリング | 質問票の起草（判断はユーザー） | Sonnet medium | Sonnet medium | Opus medium | 起草なので軽い |
| ⑤ 部品実装 / ⑥ page composition（境界超えは codex、これは fallback の列） | 発注書に沿った実装 + TDD | Opus medium | Opus high | Opus xhigh | L（picker・calendar dialog・history）は Opus high でも fix round 2 回。発注書に「定番 library を検索してから」を書かないと model に関係なく自前実装に行く |
| ⑦ 機械 gate の赤の診断 | parity artifacts（style / geometry / pixel）の読み解きと原因特定 | Opus medium | Opus high | Opus xhigh | ±1/255 の差の切り分けは Opus high で 4 run 要した。fresh context の subagent に出す（`gate-diagnose` skill） |
| ⑧ LLM スクショ一次レビュー | 全状態のスクショを「値の整合・意味・迷わないか」で判定 | Opus medium | Opus high | Opus high（状態 10 枚ずつに分割） | vision の判定なので Haiku / Sonnet は使わない。実装した agent とは別の fresh context（`screen-review` skill） |
| ⑨ 裁定文の起草 | KEEP_IMPL entry の文面 | Sonnet medium | Sonnet medium | Sonnet medium | fork 編集 skill は追記を落とすので、起草だけさせて diff は発注側が読む |
| ⑩ 本番 smoke | 本番 URL を browser 自動化で読み、API の値と表示・動線を突き合わせる | Sonnet medium | Opus medium | Opus high | L は動線（dialog → 別 page → 戻る、テーマ保存 → reload）を歩く |
| 完了主張の独立検証 | 完了報告の主張 N 件を証跡で refute する | Opus high | Opus high | Opus high | 実績: 11 主張中 1 件 FAIL を検出。実装 agent と別の fresh context（`verify-claims` skill） |
| /simplify の観点 review | reuse / simplification / efficiency / altitude の 4 観点 | 親継承 medium × 4 | 同 | 同 | 適用は Opus high。tsc / lint は LLM に出さない |

## 横断の規則

1. **実装した agent は自分の成果を審査しない。** ⑧ と独立検証は fresh context の別 agent で行う
2. **審査側の model は実装側と同 tier 以上。** 下位 model の審査は見逃しが増えるだけで費用は大して減らない
3. **effort は難易度で上げ、model は判定の種類で決める。** vision と judgment は Opus、起草は Sonnet でよい
4. **seed が配る実行 skill の frontmatter と表を 1 対 1 にする。** `screen-review`（⑧）・`gate-diagnose`（⑦ の赤）・`verify-claims`（独立検証）は表の L 列（上限）を frontmatter に持つ。S / M で下げるときは呼び出し側が `effort` を落とし、記録（review record 等）にその値を書く
5. **境界を超える実装は codex に出す。** 呼び忘れ（Claude 本体が 3 file 以上を書いた）は agent-audit が commit の trailer（`Agent:` / `Codex-Job:`）の欠落として警告する
6. **難易度は script の出力から読む。** 状態数は `states/<slug>.json`、BE route 数は ②′ の表。目視の印象で S にしない

## 実測で直す

表は 1 PJ（7 画面、1 session、subagent 18 本）の実績から起こした素案で、token・所要・指摘数の実測が集まったら列を直す。直すときはこの doc の表と skill の frontmatter を同じ commit で変える。
