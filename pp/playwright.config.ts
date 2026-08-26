// @playwright/test は ^ なしの完全固定 — 同梱 Chromium の更新は text metrics/AA を揺らし 0-diff gate を壊す
import { defineConfig } from "@playwright/test";
import { MOBILE_VIEWPORT, MOCK_ENTRY_FILE, PP_LAUNCH_OPTIONS } from "./src/config";

export default defineConfig({
  testDir: "./tests",
  // どの画面を検証した run かを report に残す（gate の非適用宣言はこれで画面を突き合わせる）
  metadata: { mockEntryFile: MOCK_ENTRY_FILE },
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // flaky な parity 結果は直すべき harness/selector バグであって retry で消さない
  reporter: [["list"], ["json", { outputFile: "artifacts/playwright-report.json" }]],
  outputDir: "artifacts/playwright-output",
  use: {
    browserName: "chromium",
    viewport: MOBILE_VIEWPORT,
    launchOptions: PP_LAUNCH_OPTIONS,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "pp" }],
});
