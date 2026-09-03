// 凍結 mock を操作して、画面ごとの到達可能な状態と辺を基準 2 viewport で保存する。
// Usage: npm run mock:states [-- <export 内の file> ...]
// 出力: docs/presentation/ui-mock/states/<画面 slug>.json と screenshots/<状態>.png
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MOCK_STATE_LIMITS, PP_LAUNCH_OPTIONS, SCREENSHOT_BASES } from "../src/config";
import { exploreStates, isolateStorage } from "../src/mock-states";
import type { MockStateGraph } from "../src/mock-states";
import { EXPORT_DIR, REFERENCE_PAGES_FILE, SCREENSHOTS_DIR } from "../src/mock-server";
import { listMockScreens, listSiteScreens, screenSlug, screenshotFile } from "../src/mock-screens";
import { installNetworkGuard, isAbortedByNavigation, isEmbedRequest } from "../src/net-block";
import { STATES_DIR } from "../src/state-walk";
import { openMock } from "../src/targets/mock-target";

// replayFailures は診断であって凍結物ではない
type FrozenViewport = Omit<MockStateGraph, "replayFailures">;

async function main(): Promise<void> {
  const screens = listSiteScreens(EXPORT_DIR, REFERENCE_PAGES_FILE, process.argv.slice(2));
  if (screens.length === 0) {
    console.log("mock-states: 対象なし（docs/presentation/ui-mock/export/ に画面が無い）");
    return;
  }
  mkdirSync(STATES_DIR, { recursive: true });
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const siteFiles = new Set(listMockScreens(EXPORT_DIR, []));
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  const defects: string[] = [];
  const notices: string[] = [];
  const unreadable = new Set<string>();
  try {
    for (const screen of screens) {
      const viewports: Record<string, FrozenViewport> = {};
      for (const [viewport, contextOptions] of SCREENSHOT_BASES) {
        const context = await browser.newContext(contextOptions);
        try {
          context.on("requestfailed", (request) => {
            if (!isEmbedRequest(request) && !isAbortedByNavigation(request)) {
              unreadable.add(`${viewport} ${screen}: ${request.url()}（${request.failure()?.errorText ?? "failed"}）`);
            }
          });
          context.on("response", (response) => {
            if (response.status() === 404) unreadable.add(`${viewport} ${screen}: ${response.url()}（HTTP 404）`);
          });
          await installNetworkGuard(context);
          // tsx (esbuild keepNames) が evaluate へ渡す関数に挿入する __name helper は browser 側に無い
          await context.addInitScript("window.__name = (fn) => fn;");
          await isolateStorage(context);
          const slug = screenSlug(screen);
          const result = await exploreStates({
            open: () => openMock(context, screen, "body"),
            viewport,
            limits: MOCK_STATE_LIMITS,
            siteFiles,
            capture: async (page, stateId) => {
              const name = screenshotFile(slug, viewport, stateId);
              writeFileSync(path.join(SCREENSHOTS_DIR, name), await page.screenshot({ type: "png", fullPage: false }));
              return `screenshots/${name}`;
            },
            onProgress: (line) => console.log(`  ${line}`),
          });
          const { replayFailures, ...frozen } = result;
          viewports[viewport] = frozen;
          const navigate = result.edges.filter((edge) => edge.action.kind === "navigate").length;
          const external = result.edges.filter((edge) => edge.action.kind === "external").length;
          console.log(
            `${screen} ${viewport}: 状態 ${Object.keys(result.states).length} / 辺 ${result.edges.length} / 反応なし ${result.unchanged} / navigate ${navigate} / external ${external} / 代表化 ${result.sampled}`,
          );
          for (const bound of result.boundsHit) notices.push(`${screen} ${viewport}: 探索上限 ${bound}`);
          for (const failure of replayFailures) {
            defects.push(
              `${screen} ${viewport} ${failure.state}: 再生後の fingerprint が不一致（期待 ${failure.expected} / 実際 ${failure.actual}）`,
            );
          }
        } finally {
          await context.close();
        }
      }
      writeFileSync(
        path.join(STATES_DIR, `${screenSlug(screen)}.json`),
        `${JSON.stringify({ version: "1", file: screen, limits: MOCK_STATE_LIMITS, viewports }, null, 2)}\n`,
      );
    }
  } finally {
    await browser.close();
  }
  defects.push(...[...unreadable].map((failure) => `読めない export: ${failure}`));
  if (notices.length > 0) {
    console.log("\n[気づき]");
    for (const notice of notices) console.log(notice);
  }
  if (defects.length > 0) {
    console.log("\n[直してから凍結する]");
    for (const defect of defects) console.log(defect);
    process.exitCode = 1;
  }
}

await main();
