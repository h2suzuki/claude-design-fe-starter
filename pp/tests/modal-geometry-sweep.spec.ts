// モーダル geometry gate（DoD の「状態」）: モーダルは開いて初めて現れるため parity の網に載らない。
// dialog が viewport を溢れず、操作要素が dialog の箱からこぼれないことを基準 2 viewport で検証する
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { APP_CONFIGURED, DESKTOP_CONTEXT_OPTIONS, MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";
// モーダル本体のセレクタ。role=dialog を持たない実装ならここを差し替える
const DIALOG_SELECTOR = "[role=dialog]";
// はみ出しを検査する操作要素。触れる部品が箱の外に出ることが欠陥
const CONTROL_SELECTOR = "button,input,select,textarea,a";


async function assertGeometry(dialog: Locator, label: string): Promise<void> {
  await expect(dialog, `${label}: dialog not visible`).toBeVisible();
  const result = await dialog.evaluate((box, controlSelector) => {
    const bounds = box.getBoundingClientRect();
    const controls = Array.from(box.querySelectorAll<HTMLElement>(controlSelector))
      .filter((control) => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((control) => {
        const rect = control.getBoundingClientRect();
        return {
          label: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? control.tagName.toLowerCase(),
          // ±1px は sub-pixel 丸めの吸収（半端な layout を偽陽性にしない）
          inside: rect.left >= bounds.left - 1 && rect.top >= bounds.top - 1 && rect.right <= bounds.right + 1 && rect.bottom <= bounds.bottom + 1,
        };
      });
    return {
      controls,
      dialogInside: bounds.left >= -1 && bounds.top >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
    };
  }, CONTROL_SELECTOR);
  expect(result.dialogInside, `${label}: dialog outside viewport`).toBe(true);
  expect(result.controls.filter((control) => !control.inside).map((control) => control.label), `${label}: controls outside dialog`).toEqual([]);
  // 陽性対照: 操作要素が 0 個なら、はみ出し検査は空集合どうしの突合で空虚に通る
  expect(result.controls.length, `${label}: no visible controls measured`).toBeGreaterThan(0);
}

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

for (const [label, contextOptions] of BASES) {
  test.describe(`app — modal geometry sweep (${label})`, () => {
    test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — 検証する画面の slug が決まらない");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
    test.skip(CURRENT_SCREEN?.modals.length === 0, "この画面の modals が空 — モーダル第 1 号を登録すると有効化される");

    test("every registered modal fits the viewport and keeps its controls inside", async ({ browser }) => {
      const context = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(context);
        for (const modal of CURRENT_SCREEN!.modals) {
          // モーダルごとに初期状態から開き直す（前の modal の残留状態を持ち込まない）
          const page = await openScreen(context, CURRENT_SCREEN!);
          try {
            await modal.run(page);
            await assertGeometry(page.locator(DIALOG_SELECTOR), `${modal.name} @ ${label}`);
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    });
  });
}
