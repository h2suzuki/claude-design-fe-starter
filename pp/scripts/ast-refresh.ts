// 再凍結した mock の現在値で screen AST の provenance と source.region を追従させる。
// 全画面を /ast-extract し直す代わりに使う。文言の変化は報告するだけで書き換えない（意匠の判断を機械に渡さない）
// Usage: npm --prefix pp run ast:refresh [-- <画面 slug の prefix>...]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { DESKTOP_CONTEXT_OPTIONS, PP_LAUNCH_OPTIONS, SCREENSHOT_BASES, TIMEZONE } from "../src/config";
import { freezePage } from "../src/freeze";
import { MOCK_ROOT, UI_AST_SCREENS_DIR } from "../src/mock-server";
import { installNetworkGuard } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";
import { collectNodes, isObject, mockEntryFile, parseBaseline, propStrings } from "../src/ast-refresh";
import { isolateStorage, waitForScrollRest } from "../src/mock-states";
import { screenSlug, screenshotFile } from "../src/mock-screens";
import { loadStateGraph, overlayTargets, STATES_DIR, walkStatesForTargets } from "../src/state-walk";

const BASELINE_PATH = path.join(MOCK_ROOT, "mock-baseline.sha256");
const AST_SUFFIX = ".ui-ast.json";

// 差し替え点。webfont と遅延描画が落ち着くまでの待ち（短すぎると region が描画途中の値で固まる）
const SETTLE_MS = 1500;

interface Measurement {
  region: number[];
  text: string;
}

const squeeze = (value: string): string => value.replace(/\s+/g, "");

function today(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts();
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
  await waitForScrollRest(page);
  await freezePage(page);
}

// region は page 全体に対する比率で持つ。絶対 px だと viewport を変えた瞬間に全部ずれる
async function measure(page: Page, nodeRef: string, visibleOnly = false): Promise<Measurement | null> {
  return page.evaluate(({ selector, visible }) => {
    const node = document.querySelector(selector);
    if (!node || (visible && node.getClientRects().length === 0)) return null;
    const rect = node.getBoundingClientRect();
    const width = document.documentElement.scrollWidth;
    const height = document.documentElement.scrollHeight;
    const round = (value: number) => Math.round(value * 1e4) / 1e4;
    return {
      region: [
        round((rect.left + scrollX) / width),
        round((rect.top + scrollY) / height),
        round(rect.width / width),
        round(rect.height / height),
      ],
      text: node.textContent ?? "",
    };
  }, { selector: nodeRef, visible: visibleOnly });
}

async function refreshAst(fileName: string, hashes: Map<string, string>): Promise<boolean> {
  const astPath = path.join(UI_AST_SCREENS_DIR, fileName);
  const ast = JSON.parse(readFileSync(astPath, "utf8")) as Record<string, unknown>;
  if (!isObject(ast.screen) || !isObject(ast.screen.provenance)) {
    console.error(`ERROR ${fileName}: screen.provenance がありません`);
    return false;
  }
  const provenance = ast.screen.provenance;
  const mockFile = provenance.mockFile;
  if (typeof mockFile !== "string") {
    console.error(`ERROR ${fileName}: screen.provenance.mockFile がありません`);
    return false;
  }
  // 台帳と実体が食い違う状態で追従させると、AST が「どの mock の写しか」を言えなくなる
  const actualHash = createHash("sha256").update(readFileSync(path.join(MOCK_ROOT, mockFile))).digest("hex");
  if (hashes.get(mockFile) !== actualHash) {
    console.error(`ERROR ${fileName}: ${mockFile} が mock-baseline.sha256 と一致しません`);
    return false;
  }

  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  try {
    const context = await browser.newContext(DESKTOP_CONTEXT_OPTIONS);
    try {
      await installNetworkGuard(context);
      // tsx (esbuild keepNames) が evaluate へ渡す関数に挿入する __name helper は browser 側に無い
      await context.addInitScript("window.__name = (fn) => fn;");
      await isolateStorage(context);
      const page = await openMock(context, mockEntryFile(mockFile), "body");
      try {
        await settle(page);
        let measured = 0;
        let mismatched = 0;
        let review = 0;
        for (const node of collectNodes(ast.screen.children)) {
          if (!isObject(node.source) || typeof node.source.nodeRef !== "string") continue;
          const nodeId = typeof node.id === "string" ? node.id : "(no-id)";
          const result = await measure(page, node.source.nodeRef);
          if (!result) {
            mismatched += 1;
            console.log(`NODE_REF_MISMATCH ${fileName}#${nodeId} ${node.source.nodeRef}`);
            continue;
          }
          node.source.region = result.region;
          measured += 1;
          const text = squeeze(result.text);
          for (const { pathName, value } of propStrings(node.props)) {
            if (squeeze(value) && !text.includes(squeeze(value))) {
              review += 1;
              console.log(`COPY_REVIEW ${fileName}#${nodeId} ${pathName} ${JSON.stringify(value)}`);
            }
          }
        }
        const targets = overlayTargets(ast.screen);
        const pending = new Map(targets.map((target) => [target.nodeId, target]));
        const slug = screenSlug(mockFile);
        let measuredOverlays = 0;
        let mobileOverlays = 0;
        // desktop で測れない overlay（mobile 専用の一覧など）は mobile の状態グラフでも探す
        const measureOverlays = async (viewport: "mobile" | "desktop", ctx: BrowserContext, rootPage?: Page) => {
          const graph = loadStateGraph(STATES_DIR, slug, viewport);
          if (!graph) return false;
          await walkStatesForTargets(graph, pending, {
            rootPage,
            openPage: async () => {
              const statePage = await openMock(ctx, mockEntryFile(mockFile), "body");
              await settle(statePage);
              return statePage;
            },
            probe: (statePage, nodeRef) => measure(statePage, nodeRef, true),
            found: (_nodeId, entry, stateId, result) => {
              if (!isObject(entry.node.source)) return;
              entry.node.source.region = result.region;
              entry.node.source.file = graph.states[stateId]?.screenshot ?? `screenshots/${screenshotFile(slug, viewport)}`;
              entry.node.source.state = stateId;
              entry.node.source.viewport = viewport;
              measuredOverlays += 1;
              if (viewport === "mobile") mobileOverlays += 1;
            },
          });
          return true;
        };
        if (targets.length > 0) {
          const hasDesktop = await measureOverlays("desktop", context, page);
          if (pending.size > 0) {
            const mobileContext = await browser.newContext(SCREENSHOT_BASES[0][1]);
            try {
              await installNetworkGuard(mobileContext);
              await mobileContext.addInitScript("window.__name = (fn) => fn;");
              await isolateStorage(mobileContext);
              await measureOverlays("mobile", mobileContext);
            } finally {
              await mobileContext.close();
            }
          }
          if (!hasDesktop && pending.size === targets.length) {
            console.log(`OVERLAY_SKIPPED ${fileName} ${targets.length} node（状態グラフ無し）`);
          } else {
            for (const entry of pending.values()) {
              mismatched += 1;
              console.log(`NODE_REF_MISMATCH ${fileName}#${entry.nodeId} ${entry.nodeRef}`);
            }
          }
        }
        provenance.sha256 = actualHash;
        provenance.extractedAt = today();
        writeFileSync(astPath, `${JSON.stringify(ast, null, 2)}\n`);
        console.log(
          `UPDATED ${fileName} region=${measured} nodeRefMismatch=${mismatched} copyReview=${review} overlays=${measuredOverlays}/${targets.length}（mobile ${mobileOverlays}）`,
        );
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return true;
}

async function main(): Promise<void> {
  const prefixes = process.argv.slice(2);
  const files = (existsSync(UI_AST_SCREENS_DIR) ? readdirSync(UI_AST_SCREENS_DIR) : [])
    .filter((name) => name.endsWith(AST_SUFFIX))
    .sort()
    .filter((name) => prefixes.length === 0 || prefixes.some((p) => name.slice(0, -AST_SUFFIX.length).startsWith(p)));
  if (files.length === 0) {
    console.error("ast:refresh: 対象 screen AST がありません");
    process.exitCode = 2;
    return;
  }
  const hashes = parseBaseline(readFileSync(BASELINE_PATH, "utf8"));
  let failed = false;
  for (const fileName of files) {
    try {
      if (!(await refreshAst(fileName, hashes))) failed = true;
    } catch (error) {
      failed = true;
      console.error(`ERROR ${fileName}: ${(error as Error).message}`);
    }
  }
  if (failed) process.exitCode = 1;
}

await main();
