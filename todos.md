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
