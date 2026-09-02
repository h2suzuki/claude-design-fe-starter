// 承認時点の参照スクショを基準 viewport ごとに撮る。既定は export の全画面（見本帳を除く）
// Usage: npm run mock:screenshots [-- <export 内の file> ...]
// 出力: docs/presentation/ui-mock/screenshots/<viewport>-<画面 slug>.png
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DESKTOP_CONTEXT_OPTIONS, MOBILE_CONTEXT_OPTIONS, PP_LAUNCH_OPTIONS } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";
import { EXPORT_DIR, MOCK_ROOT } from "../src/mock-server";
import { listSiteScreens, screenSlug } from "../src/mock-screens";

const OUT_DIR = path.join(MOCK_ROOT, "screenshots");

// 人が意匠を見返すための参照。DPR を上げると縦長 fullPage が MB 級になり repo を圧迫する
const BASES = [
  ["mobile", { ...MOBILE_CONTEXT_OPTIONS, deviceScaleFactor: 1 }],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

async function main(): Promise<void> {
  // 見本帳は画面ではないので撮らない（AST も起こさず、region が指す画を要しない）
  const screens = listSiteScreens(EXPORT_DIR, path.join(MOCK_ROOT, "reference-pages.json"), process.argv.slice(2));
  if (screens.length === 0) {
    console.log("mock-screenshots: 対象なし（docs/presentation/ui-mock/export/ に画面が無い）");
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  let unreachable = 0;
  try {
    for (const screen of screens) {
      for (const [label, contextOptions] of BASES) {
        const context = await browser.newContext(contextOptions);
        try {
          // 取りこぼさないよう navigate 前に張る。取得できない資産があれば export の閉包が足りていない
          context.on("requestfailed", (request) => {
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
          const file = path.join(OUT_DIR, `${label}-${screenSlug(screen)}.png`);
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
  if (unreachable > 0) {
    console.error(`mock-screenshots: 取得できなかった資産が ${unreachable} 件 — export/ の閉包が足りていない`);
    process.exitCode = 1;
  }
}

await main();
