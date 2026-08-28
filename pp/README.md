# pp — mock/app parity harness

凍結済み Claude Design mock（`docs/presentation/ui-mock/export/`）と実 frontend を同一条件で描画し、computed-style・geometry・pixel を機械 diff する検証ハーネス。DoD 3 分類（`docs/ui-quality-policy.md`）の機械判定部を担う。

## spec 一覧と DoD 対応

| spec | 検証内容 | DoD 分類 | 有効化条件 |
|---|---|---|---|
| `canvas-diff` | 判定器自身の陽性対照（差の検出と 1px 寸法差の crop） | （前提: 判定器の健全性） | 常に実行される |
| `page-diff` | 判定器自身の陽性対照（差の検出・差の出た行の束ね・寸法差） | （前提: 判定器の健全性） | 常に実行される |
| `mock-integrity` | 凍結前の mock 検査器自身の陽性対照（5 種の破れを合成 mock で踏ませる） | （前提: 判定器の健全性） | 常に実行される |
| `mock-provenance` | 凍結 export と sha256 台帳の一致 | （前提: 突合先の出所） | export が 1 ファイル以上 |
| `ast-provenance` | screen AST の provenance と凍結 export の一致 | （前提: 突合先の出所） | `docs/presentation/ui-ast/screens/` に AST が 1 件以上 |
| `ast-conformance` | 実装の `data-visual-id` tree が AST tree と構造一致（親子関係と出現） | （前提: 木の形） | screen AST + `PP_MOCK_FILE` + `PP_APP_URL` |
| `screen-registry` | 登録点を引く規則の陽性対照（未登録 slug を skip に化けさせない） | （前提: 検証する画面の同定） | 常に実行される |
| `sample-parity` | 全 visual id の style/geometry diff = 0（基準 2 viewport） | 基準幅 | screen AST（または `MANUAL_PAIRS`）+ `PP_MOCK_FILE` + `PP_APP_URL` |
| `page-parity` | 画面まるごとの pixel diff = 0（基準 2 viewport・fullPage。KEEP_IMPL 台帳が名指しした画像の中身だけ除外） | 基準幅 | `PP_MOCK_FILE` + `PP_APP_URL` |
| `width-sweep` | `SWEEP_WIDTHS` 全幅の連続スイープ invariant | 中間幅 | `PP_MOCK_FILE` + `PP_APP_URL` |
| `poststate-sweep` | 操作後状態の未解決 literal 検出 | 状態 | `PP_MOCK_FILE` + `PP_APP_URL` |
| `modal-geometry-sweep` | モーダルの viewport 収まりと操作要素の箱内収まり（基準 2 viewport） | 状態 | 画面の `modals` + `PP_MOCK_FILE` + `PP_APP_URL` |
| `list-identity-sweep` | 状態変更操作後の選択・詳細キー・行順序の不変 | 状態 | 画面の `list` + `edges` + `PP_MOCK_FILE` + `PP_APP_URL` |
| `self-baseline` | 自分の過去 baseline とのスクショ比較 | （回帰網） | `PP_MOCK_FILE` + `PP_APP_URL` |

未充足の条件がある spec は理由付きで skip される（端末の list reporter には理由が出ない — 理由は `artifacts/playwright-report.json` の annotations か、spec 冒頭の skip 条件で確認する）。**skip は「未検証」であって「合格」ではない** — walking skeleton（`seed-docs/walking-skeleton.md`）の一周で skip を全て外してから画面量産に入る。ただし「その画面に検査対象の部品が無い」場合だけは下の宣言で通せる。

この判定は `npm run gate`（= `playwright test` + `scripts/require-no-skips.mjs`）が機械的に行う。未検証の skip が 1 件でも残れば exit 1 になり、残った spec と skip 理由を列挙する。`npm test` 単体は skip を素通しするので、完了判定には `gate` を使う。

## 検査対象の部品が無い gate

条件付き gate（`list-identity-sweep` の `list` / `edges`、`modal-geometry-sweep` の `modals` など）は、その画面に対象の部品が無ければ登録しようがない。そこに無理やり対象を作って通すのは、検査対象が無いところに検査対象を作る行為で、以後「この gate は緑」という誤った安心を残す（轍 #4 と同型）。

この場合だけ `gate-not-applicable.json` に宣言すると、`require-no-skips` が「未検証」でなく「検査対象なし」として扱う。

```json
{
  "version": "1",
  "entries": [
    {
      "spec": "list-identity-sweep",
      "screen": "your-screen",
      "date": "2026-01-31",
      "reason": "この画面の表は静的で、状態遷移をまたいで保つ選択・行順序が無い"
    }
  ]
}
```

- `spec` は spec file 名から `.spec.ts` を除いたもの、`screen` は `PP_MOCK_FILE` の最初の dot までの slug
- **宣言は画面単位**。別の画面を検証するときは効かないので、対象部品を持つ画面が来れば gate は再び落ちる
- 宣言した gate が実際に実行されたら、その宣言は古い。`require-no-skips` が stale として落とすので、宣言を消してから走らせる
- `date` と `reason` は必須。いつ誰の判断で「対象なし」としたかが残らない宣言は、単なる gate の抜け道になる

## self-baseline の baseline は commit する

`tests/self-baseline.spec.ts-snapshots/` に生成される PNG は **追跡して commit する**。commit しないと clone や新しい worktree で毎回再生成され、比較対象が無いまま緑になる — gate は通るのに何も検出していない状態になり、「回帰網」として機能しない。`@playwright/test` を完全固定しているのは、この baseline を環境をまたいで再現させるためである。

`--update-snapshots` は初回生成と、**意図して受け入れる変更**のときだけ使う。実行すると baseline がその場の描画で上書きされるので、更新した PNG の差分を commit で必ずレビューする。無自覚に回すと回帰網を自分で書き換えることになる。

file 名は `<name>-<project>-<platform>.png`（例 `desktop---pp-linux.png`）で platform ごとに別 file になる。gate を回す platform を 1 つ決め、その baseline を正とする。別 platform で回すぶんは別 file として増えるので、混在させるなら「どの platform のものが正か」を PJ 側で決める。

## setup

```bash
cd pp
# 共有 toolchain の置き場。main repo 側を優先し、書けない環境では worktree 側へ退避する
DRAFTS="$(../tools/toolchain-dir)"
# cache もブラウザも repo ローカルへ（sandbox 環境では既定 cache dir が書けず、
# npm install は EROFS で落ちる）
npm_config_cache="$DRAFTS/npm-cache" npm install
PLAYWRIGHT_BROWSERS_PATH="$DRAFTS/pw-browsers" npx playwright install chromium
```

`@playwright/test` は完全固定 version。上げるときは vendor 資産と selector map の再検証をセットで行う（同梱 Chromium の更新は text metrics/AA を揺らす）。

## 実行

app 側 spec は dev server の URL を明示的に渡したときだけ走る。sandbox 環境では server とテストを同一 shell invocation で動かす（invocation ごとに network namespace が分かれる環境があるため。通常環境なら別 terminal でも良い）:

```bash
# 検証対象は「今いる worktree」の frontend なので、こちらは --show-toplevel で正しい
cd "$(git rev-parse --show-toplevel)/frontend"
# host に bun が無い環境では setup 節で drafts へ置いた実体を使う（PATH には載らない）
BUN="$(command -v bun || echo "$(../tools/toolchain-dir)/bun/bun-linux-x64/bun")"
"$BUN" run dev -- --host 127.0.0.1 --port 5173 --strictPort &
VITE_PID=$!
# 起動した PID だけを止める（pkill/fuser/port 指定 kill は使わない）。trap は crash/中断で発火し、
# hang は下の timeout が有限化して EXIT へ到達させる — この 2 段で server を残さない
trap 'kill "$VITE_PID" 2>/dev/null' EXIT INT TERM
until curl -sf http://127.0.0.1:5173 >/dev/null; do sleep 1; done

cd ../pp
PP_APP_URL="http://127.0.0.1:5173" \
PP_MOCK_FILE="your-screen.html" \
  timeout 600 npm run gate
```

browser の置き場は `npm test` が `tools/toolchain-dir` から解決するので、env の前置は要らない（`npm run gate` と `test:*` はいずれも `npm test` 経由）。`npx playwright test` を直に叩くときだけ `PLAYWRIGHT_BROWSERS_PATH` を自分で渡す。

完了判定には `npm test` でなく `npm run gate` を使う — `npm test` は skip を素通しする。

mock を変更（再凍結）したら必須 gate:

```bash
npm run lint:mock && npm run gate
```

## 差し替え点（PJ 開始時に確定する）

- `src/config.ts` — 基準 viewport 2 点・スイープ幅・locale/timezone・固定時刻・app の mount 点
- `src/screens.ts` — 画面ごとの登録点の表（下の節）。app の route・描画完了セレクタ・操作・fixture はここが持ち、`PP_MOCK_FILE` の slug で引かれる
- `gate-not-applicable.json` — 「この画面には検査対象の部品が無い」宣言（既定は空。上の節）
- `src/selector-map.ts` — visual id ↔ selector 対応。既定は `PP_MOCK_FILE` に対応する screen AST からの導出（mock 側 = `source.nodeRef`、app 側 = `data-visual-id` 属性）で、AST から導けない対だけ `MANUAL_PAIRS` に手書きする
- `src/net-block.ts` — vendor 資産の URL 対応表（`vendor/README.md`）
- `src/fixtures/app-fixtures.ts` の `APP_API_FIXTURES` / `APP_API_PATTERNS` — app が読む API の fixture。`openApp` が既定でこの bridge を張るので、fixture を渡さない spec も実 BE へは届かない（空でも 404 fallback が塞ぐ）
- `tests/modal-geometry-sweep.spec.ts` の `DIALOG_SELECTOR` — `role=dialog` を持たない実装のときだけ差し替える

spec を足すときは `test.skip(条件, 理由)` を **`test.describe` の直下**に書く。`test()` の本体に置くと `browser` fixture が先に作られるので、条件を満たしていない gate が skip でなく browser 起動の失敗として落ち、原因と無関係な spec が一斉に赤くなる。

## 画面ごとの登録点（`src/screens.ts`）

spec は機構だけを持ち、画面ごとに変わる値は `SCREENS` から引く。画面を足しても spec は変わらず、`PP_MOCK_FILE` を変えるだけで gate の対象が切り替わる。key は `PP_MOCK_FILE` の最初の dot までの slug（`gate-not-applicable.json` の `screen` と同じ規則）。

```ts
export const SCREENS: Record<string, ScreenSpec> = {
  trial: {
    entryPath: "/trial",
    appReadySelector: ".root[data-ready]",
    mockReadySelector: "body",
    interactions: [{ name: "submit-empty", run: async (page) => { await page.locator('[data-visual-id="form-submit"]').click(); } }],
    modals: [],
    edges: [],
  },
};
```

| 欄 | 何を決めるか | 使う spec |
|---|---|---|
| `entryPath` | この画面に対応する app の route | app 側の全 spec |
| `appReadySelector` | app の描画完了セレクタ | app 側の全 spec |
| `mockReadySelector` | mock の描画完了セレクタ | `page-parity`・`overlay-diff` |
| `interactions` | 画面状態を変える操作 | `poststate-sweep` |
| `modals` | モーダルの開き方 | `modal-geometry-sweep` |
| `list` + `edges` | 一覧の行・詳細キーのセレクタと状態変更操作 | `list-identity-sweep` |
| `fixtures` / `fixturePatterns` | 画面固有の API fixture（省略時は共通 fixture） | app 側の全 spec |

`appReadySelector` は **本番 markup に test 都合を持ち込まない** — `data-visual-id` を mount 後だけ付けるような実装は parity の突合対象そのものを揺らすので、root に `data-ready` のような専用属性を置いてそれを指す。`mockReadySelector` を別欄にしているのは、両側の markup は出所が違って同じセレクタを共有できないため。

引く側の機構（`resolveScreen`）は `src/screen-registry.ts` にある。**登録が無い slug は skip でなく error** にする — 綴り違いが skip に化けると、回したつもりの画面が 1 度も検証されないまま緑になる。

## browser process の残存に注意

前プロジェクトで、親から切り離された chromium が 100 以上滞留する事象が観測された（原因は未特定）。この harness 側は browser を残さない設計にしてある — script は try/finally で `browser.close()` し、Playwright の signal handler（SIGINT/SIGTERM）と pipe 切断時の chromium 自己終了が中断時の網になる — が、繰り返し実行・強制中断の多い運用では定期的に残存を確認する:

```bash
# この repo の pinned browser だけを path で特定する（普段使いの Chrome を誤爆しない）
pgrep -af "drafts/pw-browsers"
```

残っていたら **表示された PID を個別に kill** する。`pkill chrome` / port 指定 kill は host の browser や他プロセスを巻き込むため使わない。dev server（vite）も同じ規律で、起動した shell が記録した PID だけを止める。

滞留の典型は「cleanup trap はあるのに、hang した step が終わらず trap の発火点に到達しない」形（前プロジェクトの codex 委譲 run で実測）。trap は crash 用、hang は `timeout` で有限化する — の 2 段を実行レシピの既定にする。検証 run を別 agent（codex 等）へ委譲するときは、終了後に worktree path で scope した `pgrep -af "$PWD"` の残存検査まで task の完了条件に含める。

## 使い方の型

- mock 側 selector は `npm run verify-selectors` で実在確認してから diff を信じる（MISS/AMBI は selector-map 側のバグとして先に潰す）
- `npm run ast:refresh` で再凍結後の screen AST を追従させる（`source.region` の再計測と `provenance` の更新。全画面 `/ast-extract` のやり直しを避ける）。台帳と実体が一致しない画面は書き戻さず落ちる。文言が描画テキストと合わない props は `COPY_REVIEW` として報告するだけで、書き換えはしない
- `npm run mock:integrity` で凍結前に mock 自身の破れを出す（引数なしで `export/` の全画面。横スクロール・はみ出し・操作要素の重なり・画面間の値の割れ・dialog の収まり。1 件でもあれば落ちる。検査の範囲は `docs/presentation/ui-mock/README.md` 手順 6）
- `npm run mock:closure` で凍結候補の閉包を出す（引数なしで `export/` の全画面。読まれた file の集合と、取りこぼし・外部 embed を分けて挙げる。取りこぼしが 1 件でもあれば落ちる — `export/` に何を入れるかはこの実測で決める）
- `npm run mock:screenshots` で承認時点の参照スクショを撮る（引数なしで `export/` の全画面・基準 2 viewport・fullPage・DPR 1）。資産の 404 と abort を数え、1 件でもあれば落ちる — 凍結する export の閉包が足りているかの機械判定を兼ねる
- `npm run overlay-diff` で mock/app の全画面オーバーレイ（mock=赤・app=シアン・一致=灰）と文言キーの字体/箱突合を出す。SELECTOR_MAP に載せ忘れた箇所のズレを面で検出する補完で、map が空の序盤から使える
- 失敗時は `artifacts/<suite>/` の summary/style/geometry JSON を見る。selector・fixture の不一致と実際の parity regression を分けて診断する
- 意図的差分は `docs/presentation/ui-mock/DESIGN-POLICY.md`（KEEP_IMPL 台帳）に裁定を登録する。**登録しても parity が緑になるわけではない** — 吸収機構はまだ無く、差分は赤のまま残る。解消は mock を直すのが既定（`docs/pixel-perfect.md`）
- 実測 px を app の CSS へ転記しない。合わせるのは CSS 契約（clamp/%/flex）の構造（`docs/pixel-perfect.md`）
