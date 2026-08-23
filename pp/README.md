# pp — mock/app parity harness

凍結済み Claude Design mock（`docs/presentation/ui-mock/export/`）と実 frontend を同一条件で描画し、computed-style・geometry・（canvas 部品があれば）pixel を機械 diff する検証ハーネス。DoD 3 分類（`docs/ui-quality-policy.md`）の機械判定部を担う。

## spec 一覧と DoD 対応

| spec | 検証内容 | DoD 分類 | 有効化条件 |
|---|---|---|---|
| `canvas-diff` | 判定器自身の陽性対照（差の検出と 1px 寸法差の crop） | （前提: 判定器の健全性） | 常に実行される |
| `mock-provenance` | 凍結 export と sha256 台帳の一致 | （前提: 突合先の出所） | export が 1 ファイル以上 |
| `ast-provenance` | screen AST の provenance と凍結 export の一致 | （前提: 突合先の出所） | `docs/presentation/ui-ast/screens/` に AST が 1 件以上 |
| `ast-conformance` | 実装の `data-visual-id` tree が AST tree と構造一致（親子関係と出現） | （前提: 木の形） | screen AST + `PP_MOCK_FILE` + `PP_APP_URL` |
| `sample-parity` | 全 visual id の style/geometry diff = 0（基準 2 viewport） | 基準幅 | screen AST（または `MANUAL_PAIRS`）+ `PP_MOCK_FILE` + `PP_APP_URL` |
| `width-sweep` | 320〜1920 連続スイープの invariant | 中間幅 | `PP_APP_URL` |
| `poststate-sweep` | 操作後状態の未解決 literal 検出 | 状態 | `PP_APP_URL` |
| `modal-geometry-sweep` | モーダルの viewport 収まりと操作要素の箱内収まり（基準 2 viewport） | 状態 | `MODALS` + `PP_APP_URL` |
| `list-identity-sweep` | 状態変更操作後の選択・詳細キー・行順序の不変 | 状態 | `EDGES` + `PP_APP_URL` |
| `self-baseline` | 自分の過去 baseline とのスクショ比較 | （回帰網） | `PP_APP_URL` |

未充足の条件がある spec は理由付きで skip される（端末の list reporter には理由が出ない — 理由は `artifacts/playwright-report.json` の annotations か、spec 冒頭の skip 条件で確認する）。**skip は「未検証」であって「合格」ではない** — walking skeleton（`seed-docs/walking-skeleton.md`）の一周で skip を全て外してから画面量産に入る。

## setup

```bash
cd pp
# 共有 toolchain の置き場。worktree では --show-toplevel が worktree 自身を指すので、
# main repo 側を返す --git-common-dir から引く（通常 repo でも同じ値になる）
REPO_MAIN="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
# cache もブラウザも repo ローカルへ（sandbox 環境では既定 cache dir が書けず、
# npm install は EROFS で落ちる）
npm_config_cache="$REPO_MAIN/drafts/npm-cache" npm install
PLAYWRIGHT_BROWSERS_PATH="$REPO_MAIN/drafts/pw-browsers" npx playwright install chromium
```

`@playwright/test` は完全固定 version。上げるときは vendor 資産と selector map の再検証をセットで行う（同梱 Chromium の更新は text metrics/AA を揺らす）。

## 実行

app 側 spec は dev server の URL を明示的に渡したときだけ走る。sandbox 環境では server とテストを同一 shell invocation で動かす（invocation ごとに network namespace が分かれる環境があるため。通常環境なら別 terminal でも良い）:

```bash
# 検証対象は「今いる worktree」の frontend なので、こちらは --show-toplevel で正しい
cd "$(git rev-parse --show-toplevel)/frontend"
bun run dev -- --host 127.0.0.1 --port 5173 --strictPort &
VITE_PID=$!
# 起動した PID だけを止める（pkill/fuser/port 指定 kill は使わない）。trap は crash/中断で発火し、
# hang は下の timeout が有限化して EXIT へ到達させる — この 2 段で server を残さない
trap 'kill "$VITE_PID" 2>/dev/null' EXIT INT TERM
until curl -sf http://127.0.0.1:5173 >/dev/null; do sleep 1; done

cd ../pp
PLAYWRIGHT_BROWSERS_PATH="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")/drafts/pw-browsers" \
PP_APP_URL="http://127.0.0.1:5173" \
PP_MOCK_FILE="your-screen.html" \
  timeout 600 npm test
```

mock を変更（再凍結）したら必須 gate:

```bash
npm run lint:mock && npm test
```

## 差し替え点（PJ 開始時に確定する）

- `src/config.ts` — 基準 viewport 2 点・スイープ幅・locale/timezone・固定時刻・self-baseline 対象 path
- `src/selector-map.ts` — visual id ↔ selector 対応。既定は `PP_MOCK_FILE` に対応する screen AST からの導出（mock 側 = `source.nodeRef`、app 側 = `data-visual-id` 属性）で、AST から導けない対だけ `MANUAL_PAIRS` に手書きする
- `src/net-block.ts` — vendor 資産の URL 対応表（`vendor/README.md`）
- `src/fixtures/route-intercept.ts` + `tests/sample-parity.spec.ts` の `APP_API_FIXTURES` — app が読む API の fixture（空でも 404 fallback が実 BE への素通りを塞ぐ）
- 各 spec 冒頭の `READY_SELECTOR`（width-sweep は `APP_MOUNT_SELECTOR` も） — app の描画完了セレクタ
- `tests/modal-geometry-sweep.spec.ts` の `MODALS` + `DIALOG_SELECTOR` / `tests/list-identity-sweep.spec.ts` の `EDGES` + 行・詳細キーのセレクタ — 状態系 sweep の登録点（空のうちは理由付き skip）

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
- `npm run overlay-diff` で mock/app の全画面オーバーレイ（mock=赤・app=シアン・一致=灰）と文言キーの字体/箱突合を出す。SELECTOR_MAP に載せ忘れた箇所のズレを面で検出する補完で、map が空の序盤から使える
- 失敗時は `artifacts/<suite>/` の summary/style/geometry JSON を見る。selector・fixture の不一致と実際の parity regression を分けて診断する
- 意図的差分は `docs/presentation/ui-mock/DESIGN-POLICY.md`（KEEP_IMPL 台帳）に裁定を登録し、spec 側の delta pin で吸収する（`docs/pixel-perfect.md`）
- 実測 px を app の CSS へ転記しない。合わせるのは CSS 契約（clamp/%/flex）の構造（`docs/pixel-perfect.md`）
