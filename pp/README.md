# pp — mock/app parity harness

凍結済み Claude Design mock（`design-reference/export/`）と実 frontend を同一条件で描画し、computed-style・geometry・（canvas 部品があれば）pixel を機械 diff する検証ハーネス。DoD 3 分類（`docs/ui-quality-policy.md`）の機械判定部を担う。

## spec 一覧と DoD 対応

| spec | 検証内容 | DoD 分類 | 有効化条件 |
|---|---|---|---|
| `mock-provenance` | 凍結 export と sha256 台帳の一致 | （前提: 突合先の出所） | export が 1 ファイル以上 |
| `sample-parity` | 全 visual id の style/geometry diff = 0（基準 2 viewport） | 基準幅 | `SELECTOR_MAP` + `PP_MOCK_FILE` + `PP_APP_URL` |
| `width-sweep` | 320〜1920 連続スイープの invariant | 中間幅 | `PP_APP_URL` |
| `poststate-sweep` | 操作後状態の未解決 literal 検出 | 状態 | `PP_APP_URL` |
| `self-baseline` | 自分の過去 baseline とのスクショ比較 | （回帰網） | `PP_APP_URL` |

未充足の条件がある spec は理由付きで skip される（端末の list reporter には理由が出ない — 理由は `artifacts/playwright-report.json` の annotations か、spec 冒頭の skip 条件で確認する）。**skip は「未検証」であって「合格」ではない** — walking skeleton（`seed-docs/walking-skeleton.md`）の一周で skip を全て外してから画面量産に入る。

## setup

```bash
cd pp
npm install
# ブラウザキャッシュを repo ローカルへ（sandbox 環境では既定キャッシュ dir が書けないため）
PLAYWRIGHT_BROWSERS_PATH="$(git rev-parse --show-toplevel)/drafts/pw-browsers" \
  npx playwright install chromium
```

`@playwright/test` は完全固定 version。上げるときは vendor 資産と selector map の再検証をセットで行う（同梱 Chromium の更新は text metrics/AA を揺らす）。

## 実行

app 側 spec は dev server の URL を明示的に渡したときだけ走る。sandbox 環境では server とテストを同一 shell invocation で動かす（invocation ごとに network namespace が分かれる環境があるため。通常環境なら別 terminal でも良い）:

```bash
cd "$(git rev-parse --show-toplevel)/frontend"
npx vite --host 127.0.0.1 --port 5173 --strictPort &
VITE_PID=$!
until curl -sf http://127.0.0.1:5173 >/dev/null; do sleep 1; done

cd ../pp
PLAYWRIGHT_BROWSERS_PATH="$(git rev-parse --show-toplevel)/drafts/pw-browsers" \
PP_APP_URL="http://127.0.0.1:5173" \
PP_MOCK_FILE="your-screen.html" \
  npm test

kill "$VITE_PID"   # 起動した PID だけを止める。pkill/fuser/port 指定 kill は使わない
```

mock を変更（再凍結）したら必須 gate:

```bash
npm run lint:mock && npm test
```

## 差し替え点（PJ 開始時に確定する）

- `src/config.ts` — 基準 viewport 2 点・スイープ幅・locale/timezone・固定時刻・self-baseline 対象 path
- `src/selector-map.ts` — visual id ↔ selector 対応（app 側は `data-visual-id` 属性を部品に付与する）
- `src/net-block.ts` — vendor 資産の URL 対応表（`vendor/README.md`）
- `src/fixtures/route-intercept.ts` + `tests/sample-parity.spec.ts` の `APP_API_FIXTURES` — app が読む API の fixture（空でも 404 fallback が実 BE への素通りを塞ぐ）
- 各 spec 冒頭の `READY_SELECTOR`（width-sweep は `APP_MOUNT_SELECTOR` も） — app の描画完了セレクタ

## 使い方の型

- mock 側 selector は `npm run verify-selectors` で実在確認してから diff を信じる（MISS/AMBI は selector-map 側のバグとして先に潰す）
- `npm run overlay-diff` で mock/app の全画面オーバーレイ（mock=赤・app=シアン・一致=灰）と文言キーの字体/箱突合を出す。SELECTOR_MAP に載せ忘れた箇所のズレを面で検出する補完で、map が空の序盤から使える
- 失敗時は `artifacts/<suite>/` の summary/style/geometry JSON を見る。selector・fixture の不一致と実際の parity regression を分けて診断する
- 意図的差分は `design-reference/DESIGN-POLICY.md`（KEEP_IMPL 台帳）に裁定を登録し、spec 側の delta pin で吸収する（`docs/pixel-perfect.md`）
- 実測 px を app の CSS へ転記しない。合わせるのは CSS 契約（clamp/%/flex）の構造（`docs/pixel-perfect.md`）
