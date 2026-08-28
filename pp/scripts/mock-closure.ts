// 凍結候補を net-block 下で実描画し、実際に読まれた file の集合と 404 / abort を出す。
// Usage: npm run mock:closure [-- <export 内の file> ...]
// 出力: pp/artifacts/mock-closure.json（closure / embeds / misses）
import { chromium } from "@playwright/test";
import type { Request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP_CONTEXT_OPTIONS, MOBILE_CONTEXT_OPTIONS, PP_LAUNCH_OPTIONS, PP_PINNED_NOW_ISO } from "../src/config";
import { EXPORT_DIR, ensureMockServer } from "../src/mock-server";
import { installNetworkGuard } from "../src/net-block";
import { listMockScreens } from "../src/mock-screens";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "mock-closure.json");

// runtime CDN 形式の mock は networkidle の後に描画するので、そこから出る要求の出尽くしを待つ
const SETTLE_MS = 1500;

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

interface Miss {
  screen: string;
  viewport: string;
  url: string;
  why: string;
}

// 子 frame の navigation は export の file ではなく live な外部 embed。閉包の取りこぼしと分けて数える
const isEmbed = (request: Request): boolean =>
  request.isNavigationRequest() && request.frame().parentFrame() !== null;

async function main(): Promise<void> {
  const screens = listMockScreens(EXPORT_DIR, process.argv.slice(2));
  if (screens.length === 0) {
    console.log("mock-closure: 対象なし（docs/presentation/ui-mock/export/ が空）");
    return;
  }
  const base = await ensureMockServer();
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  const closure = new Set<string>();
  const embeds = new Set<string>();
  const misses: Miss[] = [];
  try {
    for (const [viewport, contextOptions] of BASES) {
      const context = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(context);
        for (const screen of screens) {
          const page = await context.newPage();
          page.on("requestfailed", (request) => {
            if (isEmbed(request)) embeds.add(request.url());
            else misses.push({ screen, viewport, url: request.url(), why: request.failure()?.errorText ?? "failed" });
          });
          page.on("response", (response) => {
            const url = response.url();
            if (!url.startsWith(`${base}/`)) return;
            const rel = decodeURIComponent(url.slice(base.length + 1));
            if (response.status() === 200) closure.add(rel);
            else misses.push({ screen, viewport, url: rel, why: `HTTP ${response.status()}` });
          });
          page.on("pageerror", (error) => misses.push({ screen, viewport, url: screen, why: `pageerror: ${error.message}` }));
          await page.clock.setFixedTime(new Date(PP_PINNED_NOW_ISO));
          await page.goto(`${base}/${screen}`, { waitUntil: "networkidle" });
          await page.waitForTimeout(SETTLE_MS);
          await page.waitForLoadState("networkidle");
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const files = [...closure].sort();
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ screens, closure: files, embeds: [...embeds].sort(), misses }, null, 2)}\n`);
  for (const file of files) console.log(`OK    ${file}`);
  for (const embed of embeds) console.log(`EMBED ${embed}`);
  for (const miss of misses) console.log(`MISS  ${miss.viewport} ${miss.screen}: ${miss.url}（${miss.why}）`);
  console.log(`\n閉包 ${files.length} file / 外部 embed ${embeds.size} 件 / 取りこぼし ${misses.length} 件 -> ${path.relative(process.cwd(), OUT)}`);
  if (misses.length > 0) process.exitCode = 1;
}

await main();
