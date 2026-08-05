// self-baseline スクショ回帰: mock とは独立に、app の見た目を自分の過去 baseline と比較する。
// structural diff が原因を指すのに対し、こちらは「何かが変わった」を面で検出する網。
// 初回と意図的変更時は --update-snapshots で baseline を更新し、差分は commit review で目視する
import { expect, test } from "@playwright/test";
import {
  APP_CONFIGURED,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  SELF_BASELINE_PATHS,
} from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openApp } from "../src/targets/app-target";

// app の描画完了を示すセレクタに差し替える
const READY_SELECTOR = "body";

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

for (const [label, contextOptions] of BASES) {
  test.describe(`app — self-baseline screenshots (${label})`, () => {
    for (const appPath of SELF_BASELINE_PATHS) {
      test(`${appPath}`, async ({ browser }) => {
        test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
        const context = await browser.newContext(contextOptions);
        try {
          await installNetworkGuard(context);
          const page = await openApp(context, { readySelector: READY_SELECTOR, path: appPath });
          await expect(page).toHaveScreenshot(`${label}-${appPath.replaceAll("/", "_")}.png`, { fullPage: true });
        } finally {
          await context.close();
        }
      });
    }
  });
}
