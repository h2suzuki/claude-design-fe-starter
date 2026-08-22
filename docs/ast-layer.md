# UI AST 層

本書は、凍結済み mock と frontend 実装の間に置く UI AST 層の位置付け、権威関係、運用規律を定める。
schema の正は `docs/presentation/ui-ast/ui-ast.schema.json` と
`docs/presentation/ui-ast/ui-registry.schema.json`、機械 gate の正は `tools/ast_validate`、
抽出手順の正は `ast-extract` skill である。
意匠の SSOT は Claude Design project であり（`docs/design-sync.md` §1.1）、本書はその下流を扱う。

## 1. why — なぜ mock と実装の間に層を挟むか

### 1.1 粒度が揃っていない三者

mock（実行可能 HTML による意匠表現）、部品語彙（`shadcn` 系の実装寄り component 名）、
frontend 実装（framework component）は粒度が揃っていない。
この三者を 1 ステップで相互変換しようとすると、翻訳が不安定になる。
中間表現を挟めば工程を段階に割れ、確定できない箇所を `confidence`・`alternatives`・
`uncertainNodes` として保持できる。「分からない」を握りつぶさずに次工程へ渡せることが、
層を挟む最大の利得である。

この構図は、Stitch 出力・Figma・`shadcn/ui` の三者を対象にした先行研究で
「UI AST を中間表現として採用する」判断として整理されたものであり、
本 seed はその判断を mock-first の文脈へ輸入する。

### 1.2 mock-first 文脈での再記述

先行研究の入力はスクリーンショットと Figma captured layer であり、視覚推論への依存が大きかった。
本 seed の mock は静止画ではなく実行可能 HTML であるため、DOM 構造・computed style・
相対 boundingBox という機械証拠を一次情報として採れる。視覚推論への依存は一段減る。

それでも層が要る理由は、**証拠は採れるが意味は書かれていない**からである。

- mock の class 名は意匠都合の名前であり、canonical な部品名ではない
- `div` の入れ子は表現都合であり、部品境界とは一致しない
- 見た目が汎用 button でも、意味が外部 provider の login 起点なら専用 wrapper が正しい
  （見た目より domain semantics を優先する、という判断軸の置き場が要る）
- 重なって見える modal は、視覚的には page の上だが、意味的には page layout ではない
  （overlay を page tree から分離する場所が要る）
- 幅で姿を変える navigation（sidebar ↔ drawer）は別部品ではなく同一部品の変異である
  （viewport をまたぐ semantic identity を持たせる場所が要る）

### 1.3 層が無いと人の記憶に依存する作業

部品 3 分類（既存再利用 / 新規部品 / ページ固有）の判定、pp の `SELECTOR_MAP` 結線、
mock 再凍結時の影響範囲の追跡は、いずれも層が無ければ目視と記憶に依存する。
AST があれば、kind census と wrapper registry の突合、`binding.visualId` からの結線導出、
`logicalId` キーの structural diff として機械が担える。

### 1.4 この層は交換可能な部品である

現時点では「semantic tree・responsive・interaction・provenance・LLM 編集安全性・
diff 可読性・codegen」を同時に満たす公開 IR は存在しないため、自前 schema を正本 IR に置いている。
将来、公開 IR がコモディティ化してこれらを満たしたなら、**この層は差し替える**。

差し替えを可能にしておくための規律は次の 3 点である。

1. §2.1 の権威勾配は schema に依存しない。mock が SSOT である限り AST は再抽出できる
2. AST は派生物であり、手書き資産は注釈だけに留める（§2.3）
3. gate は schema の細部ではなく構造契約を見る。同じ契約を別 schema で満たせば gate は移植できる

したがって本書が定めるのは schema の詳細ではなく、層の権威関係と運用規律である。

## 2. aim — この層が満たすべき性質

### 2.1 一方向の権威勾配

| 層 | 役割 |
| --- | --- |
| mock | 意匠の SSOT（Claude Design project が正本、`export/` は凍結鏡像） |
| UI AST | 構造・意味の派生正本 |
| frontend 実装 | AST の実現 |

方向は次のとおり固定する。

- mock → AST は抽出する（機械証拠 + 多段 pass）
- AST → mock は生成しない。mock を直す必要が出たら `design-order` で Claude Design へ発注する
- AST → 実装は生成する（skeleton と結線の導出）
- 実装 → AST は生成しない。突合（conformance）だけを行う

逆流を「検証と diff」に限ることで SSOT の二重化を避ける。
AST が mock と意図的に異なる構造を選ぶ場合は、document 直下の `notes`（手書き注釈）から
`docs/presentation/ui-mock/DESIGN-POLICY.md` の KEEP_IMPL 台帳を参照させ、
台帳を単一の裁定置き場のまま保つ（裁定を二重管理しない）。
node には `notes` を置けない（schema が拒否する）。node 単位の補足は `evidence` に書く。

### 2.2 2 層管理

| 層 | ファイル | 中身 | 更新契機 |
| --- | --- | --- | --- |
| 共通語彙 | `docs/presentation/ui-ast/registry.json` | wrapper 名・kind・status・`codeComponent`・registry 構成 | 部品の追加・変更 |
| 画面別 | `docs/presentation/ui-ast/screens/{{SLUG}}.ui-ast.json` | screen tree・overlays・provenance・coverage・uncertainNodes | mock の再凍結 |

slug は `docs/presentation/ui-mock/export/{{SLUG}}.html` と共通鍵である。
dir 名を `ui-mock` / `ui-ast` の対にし、slug で対応を引けるようにする。
`screen.name` と `screen.provenance.mockFile` の slug 一致は AST106 が機械強制する。

責務分離: AST は「画面 tree と wrapper 語彙」、registry は「wrapper から primitive への構成」を持つ。
部品構成表を画面ファイルへ散らさない。

### 2.3 frontend 注釈の 3 層

| 層 | 誰が書くか | 置き場 |
| --- | --- | --- |
| 契約 | 抽出時に機械導出する | AST（`layout` の token 参照・`binding.visualId` / `codeComponent`・`source`・`provenance`） |
| 充足 | どこにも書かない。毎回実測する | pp の spec（computed-style・geometry・pixel の diff） |
| 注釈 | 手書きのみ | AST の `notes` / `uncertainNodes.reason` / `alternatives`、KEEP_IMPL 台帳 |

**充足を AST に書かない**ことが要点である。
実測 px を IR に固定する行為は、`docs/pixel-perfect.md` §1 の失敗
（圧縮描画を実測して CSS へ転記した事例）と同型である — 一度の測定を恒久の期待値へ固める。
AST104 が `layout.gap` と `layout.maxWidth` の生 px を機械的に落とすのはこのためであり、
実測値は node の `evidence` に証拠として残し、合否判定は毎回 pp が実行する。

逆に**注釈を機械生成しない**ことが 3 層目の要点である。
低信頼 node の理由と代案は人が書き、ユーザー裁定の対象として残す。

## 3. how — 運用

### 3.1 抽出

手順の正は `ast-extract` skill である。前提は、対象 slug の mock がユーザー完成宣言済みで凍結され、
`docs/presentation/ui-mock/mock-baseline.sha256` と一致していることである。
未凍結 mock からは抽出しない（突合先がドリフトする）。

採る機械証拠は 4 種 — DOM 構造、computed style、0..1 に正規化した相対 boundingBox（`source.region`）、
状態別スクリーンショット。macro → leaf → reconcile の 3 pass で確定し、gate が緑になるまで直す。

### 3.2 修正の 3 経路

| 経路 | トリガ | 動作 |
| --- | --- | --- |
| 抽出時 repair | `uncertainNodes`・低 confidence・coverage 未達 | 追加 pass の再実行または AST の直接修正。`tools/ast_validate` が機械 gate |
| 実装後 repair | pp の diff やレビュー指摘の原因が構造の読み違いだった場合 | **AST を先に直し**、影響 subtree の実装を追随させる |
| mock 再凍結 | `mock-freeze` の再実行 | AST を再抽出し、旧 AST と `logicalId` キーで structural diff を取り、変更 node だけを実装へ伝播する |

code-first 修正を禁じる理由は、実装だけを直すと AST と実装が乖離し、
次の再凍結 diff が「AST は変わっていないのに実装が違う」という形で嘘をつくからである。
乖離が一度入ると、以後の差分は影響範囲を示せなくなる。

再凍結の突合を `id` ではなく `logicalId` で行うのは、幅で姿を変える部品を別物として数えないためである。
影響範囲が「意味の単位」で提示され、レイアウト差分と部品の意味差分を分離できる。

### 3.3 gate

| gate | 判定内容 | 状態 |
| --- | --- | --- |
| `ast-schema` | schema 検証 + AST101..106（coverage 閾値・重複 id・低信頼過多・生 px・参照解決・slug 一致） | 実装済み（`tools/ast_validate`） |
| `ast-provenance` | AST の `provenance.sha256` が現行凍結 mock の hash と一致する（再凍結で stale を検出） | 実装済み（`pp/tests/ast-provenance.spec.ts`） |
| `ast-conformance` | 実装の `data-visual-id` tree が AST tree と構造一致する（親子関係と出現） | 実装済み（`pp/tests/ast-conformance.spec.ts`） |

`ast-schema` は単体で走る。

```bash
python3 tools/ast_validate docs/presentation/ui-ast/screens/{{SLUG}}.ui-ast.json
python3 tools/ast_validate --registry docs/presentation/ui-ast/registry.json
python3 tools/ast_validate --self-test
```

`--self-test` は正常系が緑で通り、SCHEMA と AST101..106 が各 1 回発火することを確認する陽性対照である。

`ast-provenance` は screens/ に AST が 1 件も無い間、`ast-conformance` は加えて `PP_APP_URL` が無い間、
それぞれ理由付きで skip する。`pp/README.md` の skip 規律と同じく、skip した gate を「合格」と読み替えない。

`ast-conformance` は pixel ではなく構造を見る。`sample-parity`（基準 2 viewport での style/geometry diff = 0）
の手前に置く網であり、pixel を合わせる前に「木の形そのものが違う」を落とす。
判定は base tree（`screen.children`）が対象で、`binding.visualId` を持たない中間 node は親子関係から飛ばす。
overlay は初期状態で DOM に無いことがあるため、描画されていてもいなくても構造差分として数えない
（overlay の構造は状態を作ってから見る領域であり、`poststate-sweep` 側の担当である）。

### 3.4 pp への結線

`pp/src/selector-map.ts` の `SELECTOR_MAP` は、`PP_MOCK_FILE` が指す export に対応する screen AST から導出する。
mock 側 selector は `source.nodeRef`、app 側は `binding.visualId` から `[data-visual-id="…"]` を組む。
同じ `visualId` に別 selector が付いた場合はどちらが正か機械には決まらないため、両方を導出から外して報告する。
AST から導けない対だけを `MANUAL_PAIRS` に手書きし、手書きは導出より優先する。

### 3.5 可視化

`tools/ast-tree` は screen AST を CLI の ASCII tree として描画し、低 confidence node と
`uncertainNodes` を併記する。
`tools/ast-viewer` は screen AST・registry・スクリーンショットから自己完結 HTML viewer を 1 ファイル生成する。
どちらも判定は行わない。裁定論点をユーザーへ提示するための道具である。

## 4. 関連文書

| 文書 | 役割 |
| --- | --- |
| `docs/design-sync.md` | mock の正本と同期経路（上流） |
| `docs/pixel-perfect.md` | 構造契約の原則と実測値転記の禁止（充足層の手法） |
| `docs/presentation/ui-mock/DESIGN-POLICY.md` | 意図的差分の KEEP_IMPL 台帳（裁定の単一置き場） |
| `pp/README.md` | pp spec 一覧と実行の正規手順 |
| 本書 | AST 層の権威関係と運用規律 |
