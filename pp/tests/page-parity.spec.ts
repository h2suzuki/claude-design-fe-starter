// 基準 viewport の pixel 一致（DoD の「基準幅」）。sample-parity が対応表に載せた id の
// style/geometry しか見ないのに対し、こちらは画面まるごとを見る。
// 折り返し位置のように箱の寸法へ出ない差が落ちるのはここだけ
import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { Page } from "@playwright/test";
import {
  APP_CONFIGURED,
  APP_ENTRY_PATH,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  MOCK_CONFIGURED,
  MOCK_ENTRY_FILE,
} from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { MOCK_ROOT } from "../src/mock-server";
import { imageTargets, parseKeepImpl } from "../src/keep-impl";
import { openMock } from "../src/targets/mock-target";
import { openApp } from "../src/targets/app-target";
import { diffPagePngs } from "../src/page-diff";
import type { Box, PageDiffResult } from "../src/page-diff";

// mock の描画完了を示すセレクタ。markup は Claude Design 由来なので app 側とは別物になる
const MOCK_READY_SELECTOR = "body";

// app の描画完了を示すセレクタに差し替える。本番 markup に test 都合を混ぜず root の専用属性（data-ready 等）を指す
const APP_READY_SELECTOR = "body";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "page-parity");

// 両側とも DPR 1 で撮る。mobile の DPR 3 は fullPage が数万 px になり、比較にも診断画にも見合わない
const BASES = [
  ["mobile", { ...MOBILE_CONTEXT_OPTIONS, deviceScaleFactor: 1 }],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

const shoot = async (page: Page): Promise<PNG> =>
  PNG.sync.read(await page.screenshot({ type: "png", fullPage: true }));

interface ImageBox extends Box {
  src: string;
}

// 置かれ方は常に比較する。中身を外すかは KEEP_IMPL 台帳が決めるので、src も採る
const imageBoxes = async (page: Page): Promise<ImageBox[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("img, picture, video")).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        src: el instanceof HTMLImageElement ? el.currentSrc || el.src : "",
      };
    }),
  );

// 台帳が名指しした画像だけ中身の比較を外す。載っていない画像の差は落ちる
const keepImplImages = (): string[] => {
  const ledger = path.join(MOCK_ROOT, "DESIGN-POLICY.md");
  return existsSync(ledger) ? imageTargets(parseKeepImpl(readFileSync(ledger, "utf8"))) : [];
};

// 1px 未満のずれは縮小時の丸めで出る。ここは「マスクを当ててよいか」の判定なので、寸法の厳密比較は parity に任せる
const boxesAgree = (mock: readonly Box[], app: readonly Box[]): boolean =>
  mock.length === app.length &&
  mock.every((box, index) => {
    const other = app[index]!;
    return (["x", "y", "width", "height"] as const).every((key) => Math.abs(box[key] - other[key]) < 1);
  });

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
  test.describe(`page pixel parity — ${label}`, () => {
    test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — docs/presentation/ui-mock/export/ 内の突合先ファイル名を渡す");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

    test("full page: pixel diff = 0", async ({ browser }) => {
      const mockCtx = await browser.newContext(contextOptions);
      const appCtx = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(mockCtx);
        await installNetworkGuard(appCtx);
        const mockPage = await openMock(mockCtx, MOCK_ENTRY_FILE, MOCK_READY_SELECTOR);
        const appPage = await openApp(appCtx, { readySelector: APP_READY_SELECTOR, path: APP_ENTRY_PATH });
        // 遅れて届く資産で描画が動くと、撮った時刻の違いがそのまま pixel 差になる
        await Promise.all([mockPage.waitForLoadState("networkidle"), appPage.waitForLoadState("networkidle")]);
        const [mockBoxes, appBoxes] = await Promise.all([imageBoxes(mockPage), imageBoxes(appPage)]);
        expect(
          boxesAgree(mockBoxes, appBoxes),
          `page-parity-${label}: 画像の置かれ方が違う（mock ${mockBoxes.length} 枚 / app ${appBoxes.length} 枚）`,
        ).toBe(true);
        const targets = keepImplImages();
        const excluded = mockBoxes.filter((box) => targets.some((target) => box.src.includes(target)));
        const [mockPng, appPng] = await Promise.all([shoot(mockPage), shoot(appPage)]);
        const result = diffPagePngs(mockPng, appPng, excluded);
        const detail = result.matched
          ? ""
          : `${describeFailure(result)}（KEEP_IMPL で除外した画像 ${excluded.length} 枚）— 画は ${writeArtifacts(`${label}`, mockPng, appPng, result)}`;
        expect(result.matched, `page-parity-${label}: ${detail}`).toBe(true);
      } finally {
        await mockCtx.close();
        await appCtx.close();
      }
    });
  });
}
