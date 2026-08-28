// self-baseline スクショ回帰: mock とは独立に、app の見た目を自分の過去 baseline と比較する。
// structural diff が原因を指すのに対し、こちらは「何かが変わった」を面で検出する網。
// 初回と意図的変更時は --update-snapshots で baseline を更新し、差分は commit review で目視する
import { expect, test } from "@playwright/test";
import { APP_CONFIGURED, DESKTOP_CONTEXT_OPTIONS, MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

for (const [label, contextOptions] of BASES) {
  test.describe(`app — self-baseline screenshots (${label})`, () => {
    test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — 検証する画面の slug が決まらない");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

    // 対象は今の画面 1 枚。画面ごとに gate を回すと、全画面ぶんが 1 回ずつ撮られる
    test("matches the stored baseline", async ({ browser }) => {
      const screen = CURRENT_SCREEN!;
      const context = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(context);
        const page = await openScreen(context, screen);
        await expect(page).toHaveScreenshot(`${label}-${screen.entryPath.replaceAll("/", "_")}.png`, { fullPage: true });
      } finally {
        await context.close();
      }
    });
  });
}
