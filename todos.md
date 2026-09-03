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

H.S. 2026-09-03（iac-web セッション経由、verbatim）:「何を言ってるのか全くわからない。mock がと違ったら、なおせ。が基本だが、何で35件もmockを直せと言ってるの？」— ⑧ の LLM 所見 35 件（見本データの食い違い / 見た目の意見 / 事実確認）が全部「mock を直すか台帳か」の裁定になった件。同じ線で、review 記録は defect / note（気づき）を分け、気づきは promote を止めない

H.S. 2026-09-03 14:58（iac-web セッション経由、verbatim）:「adviceというのもおこがましいな。明らかに mock を作った側を下に見てる言い方に感じる。気づき、ぐらいだね。mock をどうやって作るか一般論を考えたことがありますか？ データはバリエーションを見せるものを選んでいれるんですよ。その方が FE の実装で示唆を得やすいからです。変化の少ないデータのmockは、FE実装で考慮不足になりやすい。」— kind は `note`、表示は「気づき」。見本データの変化は整合性の欠陥ではなく FE の検査項目

H.S. 2026-08-29:「デザインとコードを一緒にするな。コードは１文字違えば動作しない。デザインは人間が分かりやすいことが１番重要。そうじゃなかったら、1px 光学補正なんて存在しなかったろう？」

### 実証 2 回目 — mock を更新して反映する流れ

起票: opus-5 2026-08-28
Goal: 既に実装済みの画面について、mock 更新 → 再凍結 → AST 追従 → 実装反映 → gate 緑 までの往復を通し、1 回目で整えた手順が実際に回ることを確かめる。
Work file: `last-session-handoff.md`（この checkout 限り。`.gitignore` 対象なので、失われたら本 block から起こし直す）

Exit Criteria:

- [x] 適用先で mock を 1 回更新し、`/mock-freeze` の再凍結手順を通した — iac-web `71c6050`（第 3.1 版: 閉包 26 / 取りこぼし 0、integrity 0、screenshots・states・台帳・lint・provenance。export と台帳と design-scale と状態 screenshot を同じ commit に。2026-09-03）
- [x] `ast:refresh` で region と provenance が追従した — iac-web `a224ffb`（凍結直後に 7 画面）と `94c32f4`（overlay の visualId 追加後に 4 画面再 refresh、trial overlays 12/16）。`COPY_REVIEW` は 3.1 版の差分が角丸 CSS のみで文言差 0 のため追従対象なし（2026-09-03）
- [x] 更新後の画面で gate が skip ゼロで緑になった — iac-web 2026-09-03、seed `5f04a44`: 7 画面すべて rc 0 / require-no-skips rc 0、trial は 294 passed（13.4 分、状態 parity 178 件・到達不能 0・diff 0・許容 4、heap 最大 320 MB、既定 heap）。KEEP_IMPL の画像除外は page-parity の状態 test で効いている（`describeExcluded` の行）
- [x] 手順どおりに回らなかった箇所を seed 側で直し、2 回目の実測として記録した — 2026-09-03 に seed で直した 9 件: 画像 mask の座標 / blur の余白と許容（`483552f` で 4） / 状態限定 visualId と祖先 + nth-child / mobile 専用 overlay の実測 / fillAll 辺 / back 辺の ERR_ABORTED / 送信後 smooth scroll の capture race（`3a22aab`） / fake clock 下の timer 掃き（`5f04a44`） / OOM（再現不能、trace と screenshot は off）。実測は iac-web の `rounds/2.json`
- [ ] 依存の bump（vite 8.2.2 ほか）を **mock 更新より先に単独で land** し、その前後で gate を回して差の出所を切り分ける（`seed-docs/adoption.md` §7）— 2 巡目では bump 無し（mode-watcher 1.1.0 の追加は theme 置換と同じ commit `85700c9` で単独 land の検証にならない）。sandbox では `npm outdated` / `bun outdated` が EROFS で動かず候補を列挙できないので、host 側で列挙してから次の巡で行う（iac-web 2026-09-03）
- [x] app 配信をしない PJ で「既定に入れる」手当てが無害だと確かめた — iac-web が `serviceWorkers: "block"` を SHARED に入れ、service worker の登録が無い app で schedule-and-pricing の gate は rc 0（303 passed / 1 declared、4.9 分）のまま。verify-claims の fork の独立再実行も rc 0（2026-09-03）

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

### screen-loop の LLM step ごとの model / effort が事前に決まっていない

起票: user 2026-09-03
Goal: LLM に任せる step ごとに使う model と effort を、画面の難易度（S / M / L）で幅を持たせて事前に定義し、seed が配る skill の frontmatter と 1 対 1 に対応させる。
Work file: `last-session-handoff.md`（同名 section）・`seed-docs/llm-steps.md`（対応表と横断規則）・`.claude/skills/screen-review/SKILL.md`・`.claude/skills/gate-diagnose/SKILL.md`・`.claude/skills/verify-claims/SKILL.md`・`docs/ui-quality-policy.md`「レビューに使う LLM の model と effort」

Exit Criteria:

- [x] `fe5db76` 対応表（step × S/M/L → model / effort、備考に根拠）と横断規則（実装した agent は自分を審査しない / 審査側は実装側と同 tier 以上 / effort は難易度、model は判定の種類で決める）が `seed-docs/llm-steps.md` にある
- [x] 難易度 S/M/L の判定材料（状態数・BE route 数・overlay の有無）と出所（mock:states の json、②′ の表）が同じ doc にある — `fe5db76`
- [x] seed が実行 skill として配る step（⑧ screen-review / ⑦ 赤の診断 / 完了主張の独立検証）の frontmatter の model / effort が表と一致する — `fe5db76` / `bba2e66`（3 skill とも opus / high / context: fork。表の L 列 = 上限）
- [x] `5103bc2` 難易度 S / M / L は人や LLM が選ばず script が出す: `bun run --cwd pp difficulty` が状態数（states json の viewport 最大）・BE route 数（screens.ts の fixture 登録）・history の有無（mock:branches）から画面ごとの段と根拠を `pp/artifacts/difficulty.json` に書く。上げ下げは日付付き理由が要る
- [x] `5103bc2` 表どおりの model / effort で実行されたかを機械で確かめる: ⑧ の記録と独立検証の報告に `agentId` を必須にし、`bun run --cwd pp agent-audit` が session transcript からその agent の model / effort を引いて表と突合し、親 session の model で書かれた成果物（subagent の呼び忘れ）を赤、表より上位を警告にする
- [x] `380e4a3` / `5103bc2` 逸脱は警告でなく止める（hook の deny 経路 7 通りを手動 payload で確認: 宣言なし・model 違い・model 未指定・codex step を subagent に、が rc 2、表どおり・fork が rc 0）: agent-audit は表より上位の model / effort も赤にし、発注時点では PreToolUse hook が Agent tool の呼び出しに `llm-step: <step> <slug>` の宣言と表どおりの model を要求して deny する（`bun run --cwd pp llm-step -- --expect <step> <slug>` が写す値を印字）
- [x] `5103bc2` 表を実績で見直す: agent-audit が `pp/artifacts/agent-log.jsonl` に executor / model / effort / token / 所要 / 判定を追記し、`bun run --cwd pp llm-steps:review` が cell ごとに「上げる候補 / 下げる候補」を出す。採否は日付付きで `seed-docs/llm-steps.md` に残す
- [x] iac-web が表どおりに ⑧ と独立検証を走らせ、実測で表を直した — ⑧ は 7 画面（agent-audit 8 件 / 赤 2 件、赤は skill 分割前に S 画面を high で回した実績）。S 画面の `/screen-review-s` は「表どおり opus/medium」。独立検証は `/verify-claims`（opus / high）で 2 巡目の完了報告 11 主張を検証し 8 PASS / 2 FAIL / 未確認 1（FAIL は古い数字と notes の矛盾行で、記録を訂正）、audit「表どおり」、142,470 token / 59 tool / 625 秒。表の見直しは S 画面の分割（`62e6073`）として反映済み（2026-09-03）

ユーザー指示 2026-09-03（iac-web セッション経由、verbatim）: 「LLMによるステップと、モデル・エフォートの対応付けは、処理内容を鑑みて、事前に定義してほしいです。画面の複雑度やBEとのインタラクションの多さ等により難易度が変わるなら、幅を持たせてもよいです。」素案は iac-web の 1 session の実績（subagent 18 本、重い 1 本は 186 tool / 327k token / 2.9 時間）から。 追補 2026-09-03 11:02（verbatim）: 「幅は持たせてよいが、ある程度の基準をきめて、LLMによるブレを抑えてほしいということです。例えば、sonnet medium で済むレベルの複雑さを fable 5.1 high でやるのはちょっともったいない。（中略）sonnet のサブエージェントを呼び忘れて、fable 5.1 でやってしまうことはあるかもしれない。そのため、チェックが必要に思います。」 追補 3 同日 11:08（verbatim）: 「あなた自分で決めたことから逸脱すると思うなら、メカニカルチェックによる強制が必要です。また、モデル・エフォートは時々見直しも必要です。現実にそぐわなければ、意味がありません。バグを作り込みすぎたり、トークンの消費が過剰だったり。」iac-web の実測: 基準を書いた直後の 18 本のうち基準どおりは 6 本。

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
