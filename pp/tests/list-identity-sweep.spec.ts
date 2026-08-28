// 一覧 identity gate（DoD の「状態」）: 状態変更のたびに一覧が再構築され、選択が飛ぶ・行が動く事故を検出する。
// 操作後も「選択行が可視」「詳細の選択キーが不変」「行順序が不変」であることを検証する
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { APP_CONFIGURED, MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";
import type { ListRegistration } from "../src/screen-registry";

const rowKeys = (page: Page, list: ListRegistration) =>
  page
    .locator(list.rowSelector)
    .evaluateAll((rows, attribute) => rows.map((row) => row.getAttribute(attribute)), list.rowKeyAttribute);

async function assertListIdentity(
  page: Page,
  list: ListRegistration,
  key: string,
  before: Array<string | null>,
  label: string,
): Promise<void> {
  await expect(
    page.locator(`${list.rowSelector}[${list.rowKeyAttribute}="${key}"]`),
    `${label}: selected row is gone`,
  ).toBeVisible();
  expect(await page.locator(list.detailKeySelector).textContent(), `${label}: detail switched to another row`).toContain(key);
  expect(await rowKeys(page, list), `${label}: row order changed`).toEqual(before);
}

test.describe("app — list identity sweep", () => {
  test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — 検証する画面の slug が決まらない");
  test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
  test.skip(CURRENT_SCREEN?.list === undefined, "この画面に list の登録が無い — 一覧を持つ画面で登録すると有効化される");
  test.skip(CURRENT_SCREEN?.edges.length === 0, "この画面の edges が空 — 状態変更操作の第 1 号を登録すると有効化される");

  test("every registered state change keeps selection and row order", async ({ browser }) => {
    const screen = CURRENT_SCREEN!;
    const list = screen.list!;
    const context = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
    try {
      await installNetworkGuard(context);
      for (const edge of screen.edges) {
        // 操作ごとに初期状態から開き直す（前の edge の結果を出発点にしない）
        const page = await openScreen(context, screen);
        try {
          const row = page.locator(list.rowSelector).first();
          await row.waitFor({ state: "visible" });
          const before = await rowKeys(page, list);
          // 陽性対照: 行が 0 件なら順序も選択も空虚に一致する
          expect(before.length, `${edge.name}: no rows rendered — the sweep would pass vacuously`).toBeGreaterThan(0);
          const key = await row.getAttribute(list.rowKeyAttribute);
          if (key === null) throw new Error(`pp: ${edge.name}: first row has no ${list.rowKeyAttribute}`);
          await row.click();
          await edge.run(page);
          await assertListIdentity(page, list, key, before, edge.name);
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  });
});
