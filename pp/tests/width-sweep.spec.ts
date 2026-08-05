// 中間幅 invariant gate（DoD の「中間幅」）: 320〜1920 の連続スイープで、どの幅でも壊れないことを検証する。
// 最低保証は「描画がある」「横スクロールしない」— PJ 固有の invariant（列の飢餓・ヘッダ高不変等）を足していく
import { expect, test } from "@playwright/test";
import { APP_CONFIGURED, BREAKPOINT_EDGE_WIDTHS, SWEEP_WIDTHS, sweepContextOptions } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openApp } from "../src/targets/app-target";

// app の描画完了を示すセレクタに差し替える
const READY_SELECTOR = "body";
// app の mount 点。静的 body ではなく JS 描画後の中身を陽性対照に使う（差し替え点）
const APP_MOUNT_SELECTOR = "#app";

const WIDTHS = [...SWEEP_WIDTHS, ...BREAKPOINT_EDGE_WIDTHS];

test.describe("app — width sweep", () => {
  test(`layout invariants hold across ${WIDTHS[0]}..${WIDTHS[WIDTHS.length - 1]}`, async ({ browser }) => {
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
    for (const width of WIDTHS) {
      const context = await browser.newContext(sweepContextOptions(width));
      try {
        await installNetworkGuard(context);
        const page = await openApp(context, { readySelector: READY_SELECTOR });
        const layout = await page.evaluate((mountSel) => ({
          mountChildCount: document.querySelector(mountSel)?.childElementCount ?? 0,
          docWidth: document.documentElement.scrollWidth,
        }), APP_MOUNT_SELECTOR);
        // 陽性対照: 空画面はあらゆる invariant を空虚に通す。静的 skeleton でなく JS 描画結果の存在を主張する
        expect(layout.mountChildCount, `@${width}px: ${APP_MOUNT_SELECTOR} is empty — the sweep would pass vacuously`).toBeGreaterThan(0);
        expect(layout.docWidth, `@${width}px: page scrolls horizontally`).toBeLessThanOrEqual(width);
      } finally {
        await context.close();
      }
    }
  });
});
