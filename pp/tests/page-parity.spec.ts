// 基準 viewport の pixel 一致（DoD の「基準幅」）。sample-parity が対応表に載せた id の
// style/geometry しか見ないのに対し、こちらは画面まるごとを見る。
// 折り返し位置のように箱の寸法へ出ない差が落ちるのはここだけ
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { Page } from "@playwright/test";
import {
  APP_CONFIGURED,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  MOCK_CONFIGURED,
  MOCK_ENTRY_FILE,
  PARITY_STATE_LIMIT,
} from "../src/config";
import { findScreenForMock } from "../src/ast-screen";
import { installNetworkGuard } from "../src/net-block";
import { imageTargets, keepImplEntries } from "../src/keep-impl";
import { UI_AST_SCREENS_DIR } from "../src/mock-server";
import { screenSlug } from "../src/mock-screens";
import { openMock } from "../src/targets/mock-target";
import { openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";
import { SELECTOR_MAP } from "../src/selector-map";
import { forEachFrozenState, formatStateFailure, summarizeFailures } from "../src/state-parity";
import { loadStateGraph, STATES_DIR } from "../src/state-walk";
import { BLUR_CHANNEL_TOLERANCE, diffPagePngs } from "../src/page-diff";
import { blurBleed, boxesAgree, collectImageBoxes, describeCoverage, describeExcluded, padBoxes } from "../src/image-boxes";
import type { PageDiffResult } from "../src/page-diff";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "page-parity");
// 失敗した状態ごとに画を 3 枚書くと数十状態で worker の heap が尽きる。診断には先頭の数件で足りる
const STATE_ARTIFACT_LIMIT = 5;
const IDS = Object.keys(SELECTOR_MAP);
const AST_SCREEN = findScreenForMock(UI_AST_SCREENS_DIR, MOCK_ENTRY_FILE).match?.screen;
const AST_NODES = [...(AST_SCREEN?.children ?? []), ...(AST_SCREEN?.overlays ?? [])];

// 両側とも DPR 1 で撮る。mobile の DPR 3 は fullPage が数万 px になり、比較にも診断画にも見合わない
const BASES = [
  ["mobile", { ...MOBILE_CONTEXT_OPTIONS, deviceScaleFactor: 1 }],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

const shoot = async (page: Page): Promise<PNG> =>
  PNG.sync.read(await page.screenshot({ type: "png", fullPage: true }));

// 落ちた画は必ず残す。pixel 差は数値だけ見ても原因に辿り着けない
function writeArtifacts(tag: string, mock: PNG, app: PNG, result: PageDiffResult): string {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${tag}-mock.png`), PNG.sync.write(mock));
  writeFileSync(path.join(OUT_DIR, `${tag}-app.png`), PNG.sync.write(app));
  if (result.diffPng) writeFileSync(path.join(OUT_DIR, `${tag}-diff.png`), result.diffPng);
  return OUT_DIR;
}

function describeFailure(result: PageDiffResult): string {
  if (result.error) return result.error;
  const share = ((100 * result.diffPixels) / result.totalPixels).toFixed(3);
  const rows = result.clusters.slice(0, 5).map((c) => `${c.start}-${c.end} (${c.pixels}px)`);
  return `diff ${result.diffPixels}px = ${share}% / 差の出た行 ${rows.join(", ")}`;
}

for (const [label, contextOptions] of BASES) {
  const graph = loadStateGraph(STATES_DIR, screenSlug(MOCK_ENTRY_FILE), label);
  test.describe(`page pixel parity — ${label}`, () => {
    test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — docs/presentation/ui-mock/export/ 内の突合先ファイル名を渡す");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

    test("full page: pixel diff = 0", async ({ browser }) => {
      const mockCtx = await browser.newContext(contextOptions);
      const appCtx = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(mockCtx);
        await installNetworkGuard(appCtx);
        const mockPage = await openMock(mockCtx, MOCK_ENTRY_FILE, CURRENT_SCREEN!.mockReadySelector);
        const appPage = await openScreen(appCtx, CURRENT_SCREEN!);
        // 遅れて届く資産で描画が動くと、撮った時刻の違いがそのまま pixel 差になる
        await Promise.all([mockPage.waitForLoadState("networkidle"), appPage.waitForLoadState("networkidle")]);
        const [mockBoxes, appBoxes] = await Promise.all([collectImageBoxes(mockPage), collectImageBoxes(appPage)]);
        expect(
          boxesAgree(mockBoxes, appBoxes),
          `page-parity-${label}: 画像の置かれ方が違う（mock ${mockBoxes.length} 枚 / app ${appBoxes.length} 枚）`,
        ).toBe(true);
        // 台帳が名指しした画像だけ中身の比較を外す。載っていない画像の差は落ちる
        const targets = imageTargets(keepImplEntries());
        const excluded = mockBoxes.filter((box) => targets.some((target) => box.src.includes(target)));
        // 緑でも何箇所を見たのかは残す。台帳が全部を外していると、緑は「見ていない」の意味になる
        console.log(`page-parity-${label}: ${describeCoverage(mockBoxes, targets)}`);
        const [mockPng, appPng] = await Promise.all([shoot(mockPage), shoot(appPage)]);
        const result = diffPagePngs(mockPng, appPng, excluded);
        const detail = result.matched
          ? ""
          : `${describeFailure(result)}（KEEP_IMPL で除外: ${describeExcluded(targets, mockBoxes)}）— 画は ${writeArtifacts(`${label}`, mockPng, appPng, result)}`;
        expect(result.matched, `page-parity-${label}: ${detail}`).toBe(true);
      } finally {
        await mockCtx.close();
        await appCtx.close();
      }
    });

    test("every frozen state: viewport pixel diff = 0", async ({ browser }) => {
      test.skip(graph === null, "状態グラフ無し — bun run --cwd pp mock:states で凍結すると有効化される");
      test.setTimeout(15 * 60_000);
      if (!graph) return;
      let artifactsWritten = 0;
      const failures = await forEachFrozenState<number>(
        {
          browser,
          contextOptions,
          graph,
          nodes: AST_NODES,
          limit: PARITY_STATE_LIMIT,
          artifact: "artifacts なし",
          openMock: (context) => openMock(context, MOCK_ENTRY_FILE, CURRENT_SCREEN!.mockReadySelector),
          openApp: (context) => openScreen(context, CURRENT_SCREEN!),
          inspect: (mockPage) =>
            mockPage.evaluate(
              (selectors) => selectors.filter((selector) => document.querySelector(selector) !== null).length,
              IDS.map((id) => SELECTOR_MAP[id]!.mockSel),
            ),
          ids: (idCount) => idCount,
        },
        async (idCount, mockPage, appPage, stateId) => {
          await Promise.all([mockPage.waitForLoadState("networkidle"), appPage.waitForLoadState("networkidle")]);
          const [mockBoxes, appBoxes] = await Promise.all([
            collectImageBoxes(mockPage, { origin: "viewport" }),
            collectImageBoxes(appPage, { origin: "viewport" }),
          ]);
          const targets = imageTargets(keepImplEntries());
          const bleed = Math.max(...(await Promise.all([blurBleed(mockPage), blurBleed(appPage)])));
          const excluded = padBoxes(mockBoxes.filter((box) => targets.some((target) => box.src.includes(target))), bleed);
          const [mockPng, appPng] = await Promise.all([
            mockPage.screenshot({ type: "png", fullPage: false }).then((png) => PNG.sync.read(png)),
            appPage.screenshot({ type: "png", fullPage: false }).then((png) => PNG.sync.read(png)),
          ]);
          const tolerance = bleed > 0 ? BLUR_CHANNEL_TOLERANCE : 0;
          const result = diffPagePngs(mockPng, appPng, excluded, { tolerance });
          const boxesMatch = boxesAgree(mockBoxes, appBoxes);
          const failed = !boxesMatch || !result.matched;
          const artifact = !failed
            ? ""
            : artifactsWritten < STATE_ARTIFACT_LIMIT
              ? (artifactsWritten += 1, writeArtifacts(`${label}-${stateId}`, mockPng, appPng, result))
              : `artifacts は先頭 ${STATE_ARTIFACT_LIMIT} 状態のみ`;
          const found: string[] = [];
          if (!boxesMatch) {
            found.push(
              formatStateFailure({ stateId, kind: "画像配置", detail: `mock ${mockBoxes.length} / app ${appBoxes.length}`, artifact }),
            );
          }
          // 既存の失敗文言は `）/` に空白を挟まないので、この行だけ組み立てを共有しない
          if (!result.matched) {
            found.push(
              `state ${stateId}: pixel ${describeFailure(result)}（KEEP_IMPL で除外: ${describeExcluded(targets, mockBoxes)}）/ ${artifact}`,
            );
          }
          console.log(`state ${stateId}: ids ${idCount} / diff ${failed ? "あり" : "0"} / 許容 ±${tolerance} / ${describeCoverage(mockBoxes, targets)}`);
          return found;
        },
      );
      expect(summarizeFailures(failures)).toBe("");
    });
  });
}
