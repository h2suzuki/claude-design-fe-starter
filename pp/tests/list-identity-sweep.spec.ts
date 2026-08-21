// 一覧 identity gate（DoD の「状態」）: 状態変更のたびに一覧が再構築され、選択が飛ぶ・行が動く事故を検出する。
// 操作後も「選択行が可視」「詳細の選択キーが不変」「行順序が不変」であることを検証する
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { APP_CONFIGURED, MOBILE_CONTEXT_OPTIONS } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openApp } from "../src/targets/app-target";

// app の描画完了を示すセレクタに差し替える
const READY_SELECTOR = "body";
// 一覧の行セレクタ。行を一意に識別する key 属性を app 側の行に付与して差し替える
const ROW_SELECTOR = "tbody tr[data-row-key]";
const ROW_KEY_ATTRIBUTE = "data-row-key";
// 選択中の行 key を映す詳細側の要素に差し替える
const DETAIL_KEY_SELECTOR = '[data-visual-id="detail-key"]';

// 状態を変える操作を PJ ごとに登録する（act は選択行に対する操作を完了まで進める）
const EDGES: Array<{ name: string; act: (page: Page) => Promise<void> }> = [];

const rowKeys = (page: Page) =>
  page.locator(ROW_SELECTOR).evaluateAll((rows, attribute) => rows.map((row) => row.getAttribute(attribute)), ROW_KEY_ATTRIBUTE);

async function assertListIdentity(page: Page, key: string, before: Array<string | null>, label: string): Promise<void> {
  await expect(page.locator(`${ROW_SELECTOR}[${ROW_KEY_ATTRIBUTE}="${key}"]`), `${label}: selected row is gone`).toBeVisible();
  expect(await page.locator(DETAIL_KEY_SELECTOR).textContent(), `${label}: detail switched to another row`).toContain(key);
  expect(await rowKeys(page), `${label}: row order changed`).toEqual(before);
}

test.describe("app — list identity sweep", () => {
  test("every registered state change keeps selection and row order", async ({ browser }) => {
    test.skip(EDGES.length === 0, "EDGES が空 — 状態変更操作の第 1 号を登録すると有効化される");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
    const context = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
    try {
      await installNetworkGuard(context);
      for (const edge of EDGES) {
        // 操作ごとに初期状態から開き直す（前の edge の結果を出発点にしない）
        const page = await openApp(context, { readySelector: READY_SELECTOR });
        try {
          const row = page.locator(ROW_SELECTOR).first();
          await row.waitFor({ state: "visible" });
          const before = await rowKeys(page);
          // 陽性対照: 行が 0 件なら順序も選択も空虚に一致する
          expect(before.length, `${edge.name}: no rows rendered — the sweep would pass vacuously`).toBeGreaterThan(0);
          const key = await row.getAttribute(ROW_KEY_ATTRIBUTE);
          if (key === null) throw new Error(`pp: ${edge.name}: first row has no ${ROW_KEY_ATTRIBUTE}`);
          await row.click();
          await edge.act(page);
          await assertListIdentity(page, key, before, edge.name);
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  });
});
