# todos

## Critical

## High

### 意匠の判断を機械に強制させていないか、検査を通しで洗う

起票: user 2026-08-29
Goal: 機械が「壊れている」と断定できないものを、gate や凍結の blocker にしない。
Work file: `pp/src/mock-integrity.ts`・`pp/tests/*.spec.ts`・`docs/presentation/ui-mock/README.md`

Exit Criteria:

- [x] `mock:integrity` の文言・token の突合を blocker から外し、気づきとして出す — `201/202/203/205` だけが exit 1 を作る。README 凍結手順 6 も 2 段に書き分けた
- [x] `sample-parity` / `page-parity` / `width-sweep` / `list-identity-sweep` / `modal-geometry-sweep` / `poststate-sweep` / `ast-conformance` を同じ目で洗い、意匠の判断を強制している箇所が他に無いか確かめる — 画面どうしを比べているのは `vocabularyFindings` の 1 か所だけで、他は mock と実装の突合か壊れの検出だった
- [ ] `poststate-sweep.spec.ts:11` の `FORBIDDEN_LITERAL`（`undefined` / `null` / `NaN` / `[object Object]`）に宣言による除外が無い件を、実際に踏んだときに手当てする
- [x] 厳密さを要求してよい範囲を規約に書く — `docs/ui-quality-policy.md` の「デザイン決定権」に 2 項、`docs/presentation/ui-mock/README.md` の凍結手順 6 に 2 段

H.S. 2026-08-29:「文字列の統一は、アドバイス・気づきであり、不具合とは限らない。統一することで、見た目や可読性が壊れることがある。それにも関わらず、無条件に強制しようとしていることがバグ」

H.S. 2026-08-29:「デザインとコードを一緒にするな。コードは１文字違えば動作しない。デザインは人間が分かりやすいことが１番重要。そうじゃなかったら、1px 光学補正なんて存在しなかったろう？」

### 実証 2 回目 — mock を更新して反映する流れ

起票: opus-5 2026-08-28
Goal: 既に実装済みの画面について、mock 更新 → 再凍結 → AST 追従 → 実装反映 → gate 緑 までの往復を通し、1 回目で整えた手順が実際に回ることを確かめる。
Work file: `last-session-handoff.md`（この checkout 限り。`.gitignore` 対象なので、失われたら本 block から起こし直す）

Exit Criteria:

- [ ] 適用先で mock を 1 回更新し、`/mock-freeze` の再凍結手順（前版との棚卸し → 参照スクショ → 台帳）を通す
- [ ] `ast:refresh` で region と provenance が追従し、`COPY_REVIEW` の指摘が実際の文言変更と対応することを確認する
- [ ] 更新後の画面で gate が skip ゼロで緑になる（KEEP_IMPL entry がある場合は、それが `page-parity` の判定に効いていることを含む）
- [ ] 手順どおりに回らなかった箇所を seed 側で直し、2 回目の実測として記録する
- [ ] 依存の bump（vite 8.2.2 ほか）を **mock 更新より先に単独で land** し、その前後で gate を回して差の出所を切り分ける（`seed-docs/adoption.md` §7）
- [ ] app 配信をしない PJ で「既定に入れる」手当てが無害だと確かめる — `serviceWorkers: "block"` を入れた gate が、iac-web で同じ結果になる（app 配信の追補は二巡目の対象外）

ユーザー裁定 2026-08-28: 「iac-web を使った実証実験１回目は、完了とします。もう一回、mock のアップデートと反映の流れをやりますので、そのときに再確認しましょう。」

ユーザー裁定 2026-08-29: mock 更新の向きは **branch + worktree + PR merge + branch 削除** を基本とする。FE 更新を mock へ反映する逆向きは branch を作らなくてよい。実証 2 回目は前者なので branch を切って進める。

2026-08-30 の実測（iac-web）: seed `8bbfb95` を install し、据え置き 12 file を手で移して 7 画面すべて gate 緑（画面ごとに `npm test` rc=0 / `require-no-skips` rc=0、132–134 passed・skip は台帳の宣言分のみ・0 failed）。install.sh が seed の変更を届けられない spec 7 件と、対象列が散文で gate が読めない台帳 3 entry は、これで解消（台帳は 17 行の `img:` 形式）。`mock:integrity` は直すもの 35 件 / 気づき 0 件で、35 件は design system page の横スクロールだけ。残るのは mock 更新の向き。

seed 側の準備は 2026-08-28 に済んだ。二巡目で取り込んで使うもの:

| 何 | どこ | 二巡目での役割 |
| --- | --- | --- |
| `bun run --cwd pp mock:closure` | `pp/scripts/mock-closure.ts` | 再凍結で `export/` に入れる集合を実測で決める（凍結手順 4） |
| `bun run --cwd pp mock:integrity` | `pp/scripts/mock-integrity.ts` | 再凍結の前に mock 自身の破れを出す（凍結手順 6）。適用先の現行 mock では design system page が 360/390 で横スクロールする |
| §6 の取り込み経路 | `seed-docs/adoption.md` | merge 据え置き。差し替え点で衝突したら作業 branch 側を採る |
| BE 往復の調整段 | `docs/design-sync.md` 2.3 | mock 更新を BE 結合済み FE へ戻すときの 3 か所（mock fixture・pp fixture・実 BE） |
| 依存を上げる手順 | `seed-docs/adoption.md` §7 | bump は install.sh で届かないので適用先が自分で当てる。単独 commit にして前後で gate を回す |
| スタックの構成と出典 | `docs/stack.md` | どの層が何を担うか、2026-08 時点の出典 URL つき |

### overlay（click で開く dialog）が AST の実測と parity 検査の外にある

起票: user 2026-09-02
Goal: mock の状態グラフ（root から click・Escape・swipe・代表値入力で辿れる画面状態と辺）を機械探索して凍結し、AST 抽出・`ast:refresh`・parity 検査がそのグラフを歩くことで、overlay を含む全状態が実測と突合の対象になる。
Work file: `pp/scripts/mock-states.ts`（新規、第 1 段）・`docs/presentation/ui-mock/states/<slug>.json`（凍結出力）・`pp/scripts/ast-refresh.ts`・`pp/tests/sample-parity.spec.ts`・`pp/tests/page-parity.spec.ts`・`.claude/skills/ast-extract/`（状態 json を証拠として写す）・Codex 発注書 `drafts/mock-states-order.md`

Exit Criteria:

- [x] 第 1 段: `bun run --cwd pp mock:states` が画面ごとに状態グラフ（状態 = 文字を除いた可視 DOM の形の hash、辺 = 操作の種類と対象）を探索し、状態 json と状態ごとの viewport 画を凍結物として書く。同じ状態への到達は辺として記録し、反応の無い操作は捨てる — `d193368`（Codex 実装、受け入れ: spec 6 pass・typecheck・既存 38 pass・空 export で rc=0 を発注側で再実行）
- [x] 第 1 段: 探索の上限（深さ・1 状態あたりの辺数・総状態数）は `pp/src/config.ts` の定数で持ち、到達したら「気づき」として出して先へ進む（落とさない）— `d193368`、`MOCK_STATE_LIMITS`。初期値は仮置き（comment に明記）
- [x] 上限の初期値の根拠を iac-web の実測（最大深さ・状態数・辺数）で決め、定数の comment に残す — iac-web 実測 2026-09-02（7 画面 × 2 viewport、最大 深さ 5 / 状態 22 / 辺 162、上限到達 0、合計 14.7 分）→ 12 / 100 / 100 に設定、`pp/src/config.ts`
- [x] 第 1 段: 凍結手順（README・mock-freeze SKILL）に `mock:states` を足す。単体 test（fingerprint・辺の列挙・上限）がある — `d193368`、手順 7b・`pp/tests/mock-states.spec.ts` 6 case
- [ ] 第 2 段: `ast:refresh` が状態 json の辺で overlay を開いてから `source.region` を測り、`40-reconcile-pass.md` の「overlay は省いてよい」を撤回する
- [ ] 第 2 段: sample-parity / page-parity が状態ごとに両側（mock は状態 json の辺、app は対応表で写した辺）を開いて突合する。overlay 配下の id は base 状態では MISS にならない
- [ ] 第 2 段: 深さ 2 以上の状態（dialog の中のタブ切替など）も同じ経路で突合され、iac-web の会場写真 lightbox のタブ 2 枚がその実例として通る
- [ ] 検査時間の増分を計測して `docs/ui-quality-policy.md` に書く
- [ ] iac-web の trial / index / schedule / access で実測し、overlay の部品が structural / pixel の判定に入ることと、探索の最大深さ・状態数を確かめる

ユーザー裁定 2026-09-02（iac-web セッション経由）: 「overlay が正しく扱えない問題は、fe-starter に改善を依頼してください。挙動については、mock で十分に作り込まれています。overlay も pp 対象に含めるべきです。」

ユーザー裁定 2026-09-02: 土台は「mock の clickable を全部 click して状態の tree を先に作り、同じ状態に戻ればループ、押すものが無ければ葉として記録し、AST 構築前に行う」。操作は click だけでなく swipe 等も含める。探索深度には上限を設け、到達したらユーザーに情報だけ出して先に進む。上限の値（30 と仮に言った）は根拠のある値として扱わない。

ユーザー裁定 2026-09-02（iac-web セッション経由）: 「クリックしてモーダルがでる画面、モーダル上にさらにタブがある画面は、よくある画面なので、正しく扱えないのは大きな制約に感じます。」dialog 内のタブは探索が clickable として拾う前提で、第 2 段の突合対象に含める。

iac-web の実測 2026-09-02（`mock:states`）: calendar-dialog（3 画面）・photo-dialog 内のタブ・trial の picker がすべて状態と辺として出た。trial だけ再生 23 件不一致 → mock が localStorage に書く副作用が原因で、storage を空にして開く修正を seed に入れた。実行時間は trial 7.5 分を含め 7 画面 14.7 分（凍結時 1 回）。

iac-web の実測 2026-09-02: trial の picker dialog を overlay 11 node として起こしたが `ast:refresh` は `collectNodes(ast.screen.children)` しか測らず region 無し。sample-parity は初期状態で `SELECTOR_MAP` 全 id を突合するので overlay 配下の `visualId` は必ず MISS。modal-geometry-sweep と poststate-sweep は `modals[].run` で開けている。

## Medium

### BE 結合済み実装と Claude Design の往復手順が無い

起票: opus-5 2026-08-24
Goal: BE と結合した実装を持つ repo で、mock への書き戻しと mock 由来の変更の取り込みを、文書化された手順で回せるようにする。
Work file: `docs/design-sync.md`・`seed-docs/first-prompts.md`

Exit Criteria:

- [x] 実装が呼ぶ BE を、書き戻し時に何へ置換するか（`docs/design-sync.md` の「共有 fixture module」が受け皿）と、その変換を書き戻し手順のどこで行うかを書く — `design-sync.md 2.3` の「code → mock」。取得層だけを置換し状態機械は残す、置換は `finalize_plan` の前、認証で表示が変わる画面は変種ごとに preview を分ける
- [x] mock 側の変更を BE 結合済み FE へ戻すとき、fixture と実 BE の両方へ整合させる調整段を書く — 同 2.3 の「mock → code」。揃える先は mock の fixture・`pp/src/fixtures/`・実 BE の 3 か所で、後ろ 2 つの間が gate の死角になることを明記した
- [ ] 文書どおり実行して確認する — 適用先で書き戻しを 1 回通す必要があるので、実証 2 回目で行う

適用先からの報告（2026-08-24）。`first-prompts.md:28` は「実装から生成した preview HTML を書き戻す」としか書いておらず、BE 呼び出しの扱いが無い。そのまま書き戻すと Claude Design 上で外部 fetch できず動かない。受け皿の概念（`design-sync.md:14,107` の共有 fixture module）は既にあるので、欠けているのは変換の位置づけ。`design-sync.md` は mock → 実装の読解と pp での pin を定めるが、既に BE と結合した実装へ戻す調整は扱っていない。新規実装では出ず、旧実装と BE を持つ repo でだけ出る。

### 既存 repo 適用の出口が未定義 — 旧実装との regression 段と main への land 手順

起票: opus-5 2026-08-24
Goal: 既存実装のある repo で一周を終えた後、旧実装との突合と main への land を、文書化された手順で完了できるようにする。
Work file: `seed-docs/adoption.md`（§2 と §9）・`seed-docs/screen-loop.md`（⑦）

Exit Criteria:

- [x] 旧実装をどこまで参照してよいか、参照の結果 mock と差が出たときの扱い（DESIGN-POLICY への裁定登録か実装修正か）を adoption.md §2 に書く — 参照範囲と 2 択は §2 にあったので、欠けていた「旧実装との突合（land の直前に 1 回）」を足した。突き合わせるのは画面と route の網羅・API 配線・実データ・異常系・資産の 5 つで、意匠は比較対象にしない
- [x] 一周完了後に作業 branch を main へ land し、旧実装を退役させるまでの手順を書く。deploy 先の切替と Claude Design 同期の再確立を含む — adoption.md §10 に 7 step。本番で確かめてから branch を入れ替える順序、旧 main を消さないこと、worktree 片付け前の退避、`design_sync verify` の張り直しを含む
- [ ] 文書どおり実行して確認する — 適用先の land は文書化より先に済んでいるので、本文はその実行の記録から起こした。「文書 → 実行」の順で確かめるのは次の既存 repo 適用になる

適用先からの報告（2026-08-24）で 2 件とも確認済み。screen-loop ⑧ の判定基準は mock と意味論で、旧実装と比べる段が無い。adoption.md §1 は main を凍結すると書くが、凍結を解いて作り替えた側を main にする手順が無く、§9「完了の判定」も gate が緑になるところで止まっている。いずれも新規 repo では出ない、既存 repo 適用固有の不足。

2026-08-28 に §2 の突合表と §10 の land 手順を書いた。出典は適用先が実際に通した land（本番アドレスへ promote → 7 route 200・稽古予定 4 回とカレンダー 11 件と祝日 1067 件が旧サイトと同じ実データ・申込み API が不正 method に 405・favicon 200 を本番で確認 → 旧 URL の転送は不要と裁定して転送 commit を revert → 旧 main を `old-main` として残し作業 branch を main へ fast-forward → worktree 削除）。

### 凍結の手順はあるが道具が無い — 閉包収集と参照スクショ

起票: opus-5 2026-08-27
Goal: `docs/presentation/ui-mock/README.md` が定める凍結の判定則を、手作業でなく seed 同梱の tool で実行できるようにする。
Work file: `docs/presentation/ui-mock/README.md`・`pp/scripts/`

Exit Criteria:

- [x] 閉包収集（net-block 下で実描画し、404 と abort が 0 になる file 集合を出す）を行う tool が pp に入り、README の判定則から参照される — `bun run --cwd pp mock:closure`。引数なしで `export/` 全画面、`pp/artifacts/mock-closure.json` に閉包・外部 embed・取りこぼしを分けて書く
- [x] 参照スクショを fullPage・DPR 1 で基準 viewport ごとに撮る tool が pp に入る（`bun run --cwd pp mock:screenshots`。引数なしで `export/` 全画面、撮影中の 404 と abort を数えて 1 件でもあれば落ちる）
- [x] `/mock-freeze` skill に閉包（`mock:closure`）と破れ検査（`mock:integrity`）の段を入れ、`docs/presentation/ui-mock/README.md` の凍結手順と同じ 9 step に揃える — H.S. の許可（2026-08-28）を得て Edit tool で反映。Bash からは read-only のままだが、dedicated tool は通った
- [ ] 適用先の再凍結で 2 つの tool を実際に通す — 実証 2 回目で行う

適用先が一周の凍結時に自作した（`pp/scripts/collect-mock-closure.ts` / `pp/scripts/mock-screenshot.ts`、いずれも config の viewport・net-block・mock-server を使うだけで PJ 非依存との報告）。判定則を README に書いた時点で道具は付けていないので、次の PJ も同じ自作をする。

2026-08-27 に参照スクショ側だけ先に入れた（当初は一周の完了を待つ方針だった）。適用先が実際に撮り漏れを踏み（design system page の撮り忘れ）、原因が「seed が道具を配らないので消費側が自作し、その自作が引数必須になる」ことだと判明したため。

2026-08-28 に閉包収集を入れ、適用先の凍結 mock（7 画面 + design system page）を `PP_REPO_ROOT` で指して実測した。vendor 未登録では取りこぼし 64 件で exit 1、vendor を登録すると取りこぼし 0 件・閉包 26 file で、適用先が凍結した 26 file と一致した。Google Maps の子 frame は取りこぼしでなく外部 embed として分けて挙がる。

### favicon の規約が元画像の要求で止まっていて、生成と配線が無い

起票: opus-5 2026-08-29
Goal: 元画像 1 枚を渡されたら、必要な形（多重 `.ico`・apple-touch・manifest 用）を seed の道具で生成し、HTML へ配線するところまでを規約が持つ。
Work file: `seed-docs/design-order-template.md`（項目 14）・`seed-docs/pre-implementation-questions.md`（favicon と app icon）・`frontend/src/app.html`・生成 script の置き場（未定）

Exit Criteria:

- [x] 元画像 1 枚から 16/32/48 を含む多重 `.ico` と apple-touch 用 PNG 180×180 を生成する script が seed に入る。出力先も決める — `frontend/scripts/make-favicons.mjs`、出力は `frontend/static/`、呼び口は `bun run --cwd frontend favicons`。sharp は frontend の devDependency（出力が frontend の配信資産のため）
- [x] `app.html` に `rel="icon"`（sizes 併記）と `rel="apple-touch-icon"` の link が入り、生成物と一致する — `sizes="16x16 32x32 48x48"` は script の `ICO_SIZES` と一致
- [x] manifest を置くかどうかを規約が決める — **置かない**。512×512 の生成もやめ、形の一覧から外した。PWA を名乗る要件が出た時点で足す
- [x] 元が不透過（写真 JPEG など）だったときの救済手順を書く — `--round` として実装し規約にも書いた。実測で 16px の角 alpha が 255 → 0、中央は 255 のまま
- [ ] 生成から配線までを適用先で 1 回通す — **受け皿は次の適用先**。iac-web は自前実装（`pp/scripts/build-images.mjs`）を H.S. の確認済みで持っており、seed 版へ寄せない判断（2026-08-30）

現状は**要求と形の一覧まで**しかない。`seed-docs/design-order-template.md:40` が「正方形・余白込み・単色背景の元画像を渡す（透過 PNG または SVG）」と発注側へ求め、`seed-docs/pre-implementation-questions.md:29` が必要な形（`.ico` 16/32/48 の多重 + PNG 180×180 + 512×512）を挙げるが、元画像からその形を作って HTML へ繋ぐ側が無い。

iac-web からの依頼（2026-08-29）。H.S. 裁定の verbatim（出所: iac-web session 経由の伝聞、2026-08-29）:「favicon は、普段は元ネタしか渡せないので、適切なサイズのファイルに変換して配備するルールにしてほしい。fe-starter の仕事なら、そうしてもらって」。**承認 scope は規約をその向きへ改めることまで**で、着手時期は未定 — H.S.（2026-08-29、当 session へ直接）「また後で考えます」。

還流できる実装が iac-web 側にある（commit f631cf4 / 427b85f、そのまま持ち込めるとの報告）:

| 何 | 中身 |
| --- | --- |
| 生成 | sharp で 16/32/48 の PNG を作り、ICO container を自前で詰める。sharp は `.ico` を書けないが、ICO は PNG をそのまま格納できる（6 byte header + 16 byte/枚 の directory + PNG 本体）ので 20 行程度 |
| 配線 | `<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">` と `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| 不透過の救済 | 円形ロゴなら円マスクを縮小前に alpha へ焼くと角の白が落ちる。縮小後にマスクすると縁に白が残る。JPEG のにじみを噛まないよう半径は 2px 内側 |
| manifest | 512 は `manifest.json` が無いと未参照。iac-web は未参照なので生成をやめた |

置き場は `tools/` が第 1 候補。iac-web が `pp/scripts/build-images.mjs` へ置いたのは **sharp を pp の devDependency に入れた都合**であって、pp が道具置き場だからではない（2026-08-29 の申し送り）。seed の `tools/` は既に node script を持つ（`ast-tree` / `ast-viewer` が `#!/usr/bin/env node`）ので言語は合う。ただし **`tools/` に package.json が無く**、npm の家は `frontend/` と `pp/` の 2 つだけなので、sharp をどちらの devDependency へ入れるかは取り込み時に決める（出力は frontend の配信資産）。

### Capacitor / PWA は opt-in — 発注規約に追補が無い

起票: user 2026-08-31
Goal: 既定の発注（普通の Web サイト）は 18 項目のまま変えず、app 配信を選んだ PJ だけが足せる追補として PWA / Capacitor の要件を持つ。
Work file: `seed-docs/design-order-template.md`（項目 14 と追補）・`.claude/skills/design-order/SKILL.md`（追補を差し込む条件）

Exit Criteria:

- [ ] 追補を発注規約の本体と分けて置き、`/design-order` が app 配信を選んだときだけ差し込む。選ばない PJ の発注文に追補が混ざらない
- [ ] 【既定】項目 14 の元画像を、後から app 化しても撮り直しが要らない形にする — 透過で受け取り、不透過が要る用途では背景色を焼く（`make-favicons.mjs` は apple-touch で既にそうしている）
- [ ] 【追補】safe-area（notch とホームバー）の避け。背景は端まで・操作は内側という切り分けと、inset を design system の変数として持たせる形を要求する
- [ ] 【追補】app icon の maskable 安全域（内接円 80%）とストア用 1024×1024
- [ ] 【追補】起動画面。既定は単色背景 + app icon で足りる（Android 12+ は system が自動で出す）ので、作り込む場合だけ 2732×2732 の元画像とダーク用を要求する
- [ ] 【追補】オフライン時の表示を、部品の状態一式（項目 2）へ足す
- [ ] 【追補】画面の向き（縦固定か回転対応か）。回転対応なら横向きのレイアウトが発注対象になる
- [ ] 【追補】画面内の戻る導線 — app にはブラウザの戻るボタンが無い
- [ ] 【追補】manifest の `theme_color` / `background_color` と iOS のステータスバー表示に、どの意味色を充てるか

### Capacitor / PWA は opt-in — 実装と gate の受け皿が無い

起票: user 2026-08-31
Goal: 既定は普通の Web サイトのままで、後から app 配信へ移る道を塞がない。app 配信を選んだ PJ だけが opt-in で足す。
Work file: `frontend/svelte.config.js`・`pp/src/config.ts`・`docs/ui-quality-policy.md`（land 前の検証）・`docs/stack.md`

Exit Criteria:

- [ ] 【既定】service worker が入っても gate が決定的であることを、選択に関わらず担保する — Playwright の context option `serviceWorkers: "block"` を `pp/src/config.ts` の共有 option へ足す。SW を持たない PJ では挙動が変わらない
- [ ] 【既定】app 化を塞ぐ書き方を避ける — server 側の処理を足すと静的出力にできなくなることを `docs/stack.md` に注記する（現在 server 側の処理は 0 件）
- [ ] 【追補】web（Vercel）と app（静的）の 2 出力を持つ adapter 分岐を用意し、切り替え方を `docs/stack.md` に書く。選ばない PJ は `adapter-auto` のまま
- [ ] 【追補】safe-area の崩れが gate に現れない死角を、`docs/ui-quality-policy.md` の「land 前の検証」へ実機確認の段として足す — 普通のブラウザでは `env(safe-area-inset-*)` が 0 に解決されるので、gate は緑のまま実機だけ崩れる
- [ ] native build（Xcode / Android Studio）を seed の範囲に含めるかを決め、範囲外とするなら `docs/stack.md` にその線を書く

Note: dsa 側の作業は、起動中の dsa セッションへ cross-session (ListAgents → SendMessage) で直接依頼してよい (ユーザー許可 2026-08-22)。2026-08-22 に daily-stock-analyzer-25 へ差分と出典 (d7a2863) を送信済み — 実施判断は dsa 側 owner と本人の間で進む。当 session は不介入で、質問への回答のみ行う。
