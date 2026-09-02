// 承認時点の参照スクショを基準 viewport ごとに撮る。既定は export の全画面（見本帳を除く）
// Usage: npm run mock:screenshots [-- <export 内の file> ...]
// 出力: docs/presentation/ui-mock/screenshots/<画面 slug>.<viewport>.png
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PP_LAUNCH_OPTIONS, SCREENSHOT_BASES } from "../src/config";
import { installNetworkGuard, isEmbedRequest } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";
import { EXPORT_DIR, REFERENCE_PAGES_FILE, SCREENSHOTS_DIR } from "../src/mock-server";
import { listSiteScreens, screenSlug, screenshotFile } from "../src/mock-screens";

async function main(): Promise<void> {
  // 見本帳は画面ではないので撮らない（AST も起こさず、region が指す画を要しない）
  const screens = listSiteScreens(EXPORT_DIR, REFERENCE_PAGES_FILE, process.argv.slice(2));
  if (screens.length === 0) {
    console.log("mock-screenshots: 対象なし（docs/presentation/ui-mock/export/ に画面が無い）");
    return;
  }
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  let unreachable = 0;
  let embeds = 0;
  try {
    for (const screen of screens) {
      for (const [label, contextOptions] of SCREENSHOT_BASES) {
        const context = await browser.newContext(contextOptions);
        try {
          // 取りこぼさないよう navigate 前に張る。取得できない資産があれば export の閉包が足りていない
          context.on("requestfailed", (request) => {
            if (isEmbedRequest(request)) {
              embeds += 1;
              return;
            }
            unreachable += 1;
            console.error(`  abort ${request.url()} — ${request.failure()?.errorText ?? ""}`);
          });
          context.on("response", (response) => {
            if (response.status() !== 404) return;
            unreachable += 1;
            console.error(`  404 ${response.url()}`);
          });
          await installNetworkGuard(context);
          const page = await openMock(context, screen, "body");
          await page.waitForLoadState("networkidle");
          const file = path.join(SCREENSHOTS_DIR, screenshotFile(screenSlug(screen), label));
          writeFileSync(file, await page.screenshot({ type: "png", fullPage: true }));
          console.log(`wrote ${path.relative(process.cwd(), file)}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  if (embeds > 0) {
    console.log(`mock-screenshots: 外部 embed ${embeds} 件（閉包には入らない）`);
  }
  if (unreachable > 0) {
    console.error(`mock-screenshots: 取得できなかった資産が ${unreachable} 件 — export/ の閉包が足りていない`);
    process.exitCode = 1;
  }
}

await main();
