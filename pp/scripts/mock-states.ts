// 凍結 mock を操作して、画面ごとの到達可能な状態と辺を基準 2 viewport で保存する。
// Usage: npm run mock:states [-- <export 内の file> ...]
// 出力: docs/presentation/ui-mock/states/<画面 slug>.json と screenshots/<状態>.png
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DESKTOP_CONTEXT_OPTIONS, MOBILE_CONTEXT_OPTIONS, MOCK_STATE_LIMITS, PP_LAUNCH_OPTIONS } from "../src/config";
import { exploreStates, isolateStorage } from "../src/mock-states";
import { EXPORT_DIR, MOCK_ROOT } from "../src/mock-server";
import { listMockScreens, listSiteScreens, screenSlug } from "../src/mock-screens";
import { installNetworkGuard, isEmbedRequest } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";

const STATES_DIR = path.join(MOCK_ROOT, "states");
const SCREENSHOTS_DIR = path.join(MOCK_ROOT, "screenshots");
const BASES = [
  ["mobile", { ...MOBILE_CONTEXT_OPTIONS, deviceScaleFactor: 1 }],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

interface FrozenViewport {
  states: Awaited<ReturnType<typeof exploreStates>>["states"];
  edges: Awaited<ReturnType<typeof exploreStates>>["edges"];
  unchanged: number;
  sampled: number;
  boundsHit: Awaited<ReturnType<typeof exploreStates>>["boundsHit"];
}

async function main(): Promise<void> {
  const declaration = path.join(MOCK_ROOT, "reference-pages.json");
  const screens = listSiteScreens(EXPORT_DIR, declaration, process.argv.slice(2));
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
      for (const [viewport, contextOptions] of BASES) {
        const context = await browser.newContext(contextOptions);
        try {
          context.on("requestfailed", (request) => {
            if (!isEmbedRequest(request)) {
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
              const name = `${slug}.${viewport}.${stateId}.png`;
              writeFileSync(path.join(SCREENSHOTS_DIR, name), await page.screenshot({ type: "png", fullPage: false }));
              return `screenshots/${name}`;
            },
            onProgress: (line) => console.log(`  ${line}`),
          });
          viewports[viewport] = {
            states: result.states,
            edges: result.edges,
            unchanged: result.unchanged,
            sampled: result.sampled,
            boundsHit: result.boundsHit,
          };
          const navigate = result.edges.filter((edge) => edge.action.kind === "navigate").length;
          const external = result.edges.filter((edge) => edge.action.kind === "external").length;
          console.log(
            `${screen} ${viewport}: 状態 ${Object.keys(result.states).length} / 辺 ${result.edges.length} / 反応なし ${result.unchanged} / navigate ${navigate} / external ${external} / 代表化 ${result.sampled}`,
          );
          for (const bound of result.boundsHit) notices.push(`${screen} ${viewport}: 探索上限 ${bound}`);
          for (const failure of result.replayFailures) {
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
