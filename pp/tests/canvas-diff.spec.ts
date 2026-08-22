// 判定器そのものの陽性対照。canvas の pixel gate は canvas-diff の crop 判断に丸ごと依存するため、
// 「差を見逃さない」と「1px 寸法差を差と誤認しない」の両方を合成 PNG で固定する
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { diffCanvasPngs } from "../src/canvas-diff";

type Paint = (x: number, y: number) => [number, number, number];

// 位置で色が変わる下地。ずれた crop を選ぶと必ず diff が出るので、offset 選択の正しさを検出できる
const gradient: Paint = (x, y) => [(x * 7) % 256, (y * 11) % 256, 60];
const JUNK: [number, number, number] = [255, 0, 255];

function makePng(width: number, height: number, paint: Paint): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      png.data.writeUInt32BE(((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0, (y * width + x) * 4);
    }
  }
  return png;
}

/** content を (offsetX, offsetY) に置き、余白は JUNK で埋めた版 */
const withExcess = (width: number, height: number, offsetX: number, offsetY: number, content: Paint): PNG =>
  makePng(width, height, (x, y) => {
    const [cx, cy] = [x - offsetX, y - offsetY];
    return cx < 0 || cy < 0 || cx >= width - offsetX || cy >= height - offsetY ? JUNK : content(cx, cy);
  });

test.describe("canvas-diff — judge self-check", () => {
  test("identical canvases match", () => {
    expect(diffCanvasPngs(makePng(40, 30, gradient), makePng(40, 30, gradient)).diffPixels).toBe(0);
  });

  test("a real difference is not swallowed", () => {
    const changed = makePng(40, 30, (x, y) => (x === 20 && y === 15 ? [0, 0, 0] : gradient(x, y)));
    const result = diffCanvasPngs(makePng(40, 30, gradient), changed);
    expect(result.matched).toBe(false);
    expect(result.diffPixels).toBeGreaterThan(0);
  });

  test("1px excess on a single axis is cropped away", () => {
    // 右端に余剰列 / 下端に余剰行 — content は原点側
    expect(diffCanvasPngs(withExcess(41, 30, 0, 0, gradient), makePng(40, 30, gradient)).matched).toBe(true);
    expect(diffCanvasPngs(withExcess(40, 31, 0, 0, gradient), makePng(40, 30, gradient)).matched).toBe(true);
  });

  test("1px excess on the far edge is cropped away", () => {
    // 左端 + 上端に余剰 — content は対角側
    expect(diffCanvasPngs(withExcess(41, 31, 1, 1, gradient), makePng(40, 30, gradient)).matched).toBe(true);
  });

  test("mixed 1px excess (left column and bottom row) is cropped away", () => {
    // 片方が両軸で大きく、余剰が対角に揃わない組合せ。対角 2 点だけを試す実装はここで落ちる
    expect(diffCanvasPngs(withExcess(41, 31, 1, 0, gradient), makePng(40, 30, gradient)).matched).toBe(true);
    expect(diffCanvasPngs(withExcess(41, 31, 0, 1, gradient), makePng(40, 30, gradient)).matched).toBe(true);
  });

  test("1px excess split across images on different axes is cropped away", () => {
    // mock が幅・app が高さで大きい配置。各画像の候補が 2 点で足りる側の境界を pin する
    expect(diffCanvasPngs(withExcess(41, 30, 1, 0, gradient), withExcess(40, 31, 0, 1, gradient)).matched).toBe(true);
  });

  test("2px difference is reported as a dimension mismatch", () => {
    const result = diffCanvasPngs(makePng(42, 30, gradient), makePng(40, 30, gradient));
    expect(result.matched).toBe(false);
    expect(result.error).toContain("canvas dimension mismatch");
  });
});
