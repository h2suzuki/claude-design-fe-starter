// canvas/SVG の pixel diff。chart 等の canvas 部品が visual id を登録したときに使う汎用機構
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { Page } from "@playwright/test";

export interface CanvasDiffResult {
  matched: boolean;
  diffPixels: number;
  totalPixels: number;
  width: number;
  height: number;
  diffPng: Buffer | null; // heat-map PNG。diffPixels > 0 のときだけ生成
  error?: string;
}

function dataUrlToPng(dataUrl: string): PNG {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  return PNG.sync.read(Buffer.from(base64, "base64"));
}

// same-origin canvas 前提（両 target ともローカル資産のみ描画するため toDataURL は SecurityError にならない）
// selector 解決を Locator 経由にする理由は dump.ts と同じ（Playwright 拡張 selector 対応）
export async function captureCanvasPng(page: Page, selector: string): Promise<PNG | { error: string }> {
  const locator = page.locator(selector);
  const matchCount = await locator.count();
  if (matchCount !== 1) {
    return { error: `pp: ${selector} matched ${matchCount} elements, expected exactly 1` };
  }
  const dataUrl = await locator.evaluate((el) =>
    el instanceof HTMLCanvasElement ? el.toDataURL("image/png") : null,
  );
  if (!dataUrl) return { error: `pp: ${selector} did not resolve to a <canvas> element` };
  return dataUrlToPng(dataUrl);
}

// gate = 0 pixel。固定 rig で残留 subpixel-AA が実証されたときだけ、文書化した非 0 tolerance を渡す
export function diffCanvasPngs(mockPng: PNG, appPng: PNG, threshold = 0): CanvasDiffResult {
  if (mockPng.width !== appPng.width || mockPng.height !== appPng.height) {
    return {
      matched: false,
      diffPixels: -1,
      totalPixels: mockPng.width * mockPng.height,
      width: mockPng.width,
      height: mockPng.height,
      diffPng: null,
      error: `pp: canvas dimension mismatch mock=${mockPng.width}x${mockPng.height} app=${appPng.width}x${appPng.height}`,
    };
  }
  const { width, height } = mockPng;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(mockPng.data, appPng.data, diff.data, width, height, { threshold });
  return {
    matched: diffPixels === 0,
    diffPixels,
    totalPixels: width * height,
    width,
    height,
    diffPng: diffPixels > 0 ? PNG.sync.write(diff) : null,
  };
}
