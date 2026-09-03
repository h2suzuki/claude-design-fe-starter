// 判定器そのものの陽性対照。画面まるごとの pixel gate は page-diff に丸ごと依存するため、
// 「差を見逃さない」「差の在り処を行で示す」「寸法差を差として落とす」を合成 PNG で固定する
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { diffPagePngs } from "../src/page-diff";

type Paint = (x: number, y: number) => [number, number, number];

// 位置で色が変わる下地。ずれた比較をすると必ず差が出るので、突合の正しさを検出できる
const gradient: Paint = (x, y) => [(x * 7) % 256, (y * 11) % 256, 60];

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

/** 指定行だけ一様に塗り替えた版（1 行まるごとの差 = 折り返しがずれた行の形） */
const withDirtyRows = (width: number, height: number, dirty: readonly number[]): PNG =>
  makePng(width, height, (x, y) => (dirty.includes(y) ? [0, 0, 0] : gradient(x, y)));

test.describe("page-diff — judge self-check", () => {
  test("identical pages match", () => {
    const result = diffPagePngs(makePng(40, 30, gradient), makePng(40, 30, gradient));
    expect(result.matched).toBe(true);
    expect(result.diffPixels).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  test("a single differing pixel is not swallowed", () => {
    const changed = makePng(40, 30, (x, y) => (x === 20 && y === 15 ? [0, 0, 0] : gradient(x, y)));
    const result = diffPagePngs(makePng(40, 30, gradient), changed);
    expect(result.matched).toBe(false);
    expect(result.diffPixels).toBe(1);
    expect(result.clusters).toEqual([{ start: 15, end: 15, pixels: 1 }]);
  });

  test("distant differing rows are reported as separate clusters", () => {
    // 束ね幅を大きく超える隙間 — 別々のズレとして数えないと、報告が 1 箇所に丸められる
    const result = diffPagePngs(makePng(40, 90, gradient), withDirtyRows(40, 90, [5, 80]));
    expect(result.clusters).toHaveLength(2);
    expect(result.clusters.map((c) => c.start).sort((a, b) => a - b)).toEqual([5, 80]);
  });

  test("nearby differing rows are joined into one cluster", () => {
    // 折り返しがずれた段落は数行おきに差が出る。1 箇所として報告しないと束が細切れになる
    const result = diffPagePngs(makePng(40, 90, gradient), withDirtyRows(40, 90, [5, 9, 14]));
    expect(result.clusters).toEqual([{ start: 5, end: 14, pixels: 120 }]);
  });

  test("the worst cluster comes first", () => {
    const result = diffPagePngs(makePng(40, 90, gradient), withDirtyRows(40, 90, [5, 60, 61, 62]));
    expect(result.clusters[0]?.start).toBe(60);
  });

  test("a masked region is not compared", () => {
    // 画像は軽量化してよい（既定の処置）。中身の差を数えると、規約に従った実装が必ず落ちる
    const changed = makePng(40, 30, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [0, 0, 0] : gradient(x, y)));
    const result = diffPagePngs(makePng(40, 30, gradient), changed, [{ x: 10, y: 5, width: 10, height: 10 }]);
    expect(result.matched).toBe(true);
  });

  test("a difference outside the mask still counts", () => {
    const changed = makePng(40, 30, (x, y) => (x === 35 && y === 25 ? [0, 0, 0] : gradient(x, y)));
    const result = diffPagePngs(makePng(40, 30, gradient), changed, [{ x: 10, y: 5, width: 10, height: 10 }]);
    expect(result.diffPixels).toBe(1);
  });

  test("a mask reaching past the edge is clipped, not wrapped", () => {
    // 端をまたぐ矩形で行が折り返すと、反対側の無関係な pixel まで見なくなる
    const changed = makePng(40, 30, (x, y) => (x === 0 && y === 20 ? [0, 0, 0] : gradient(x, y)));
    const result = diffPagePngs(makePng(40, 30, gradient), changed, [{ x: 35, y: 19, width: 20, height: 3 }]);
    expect(result.diffPixels).toBe(1);
  });

  test("a dimension mismatch is reported, not absorbed", () => {
    // canvas と違い page の寸法差は bbox の丸めでなくレイアウトの差 — crop で隠すと本物の差が消える
    const result = diffPagePngs(makePng(40, 31, gradient), makePng(40, 30, gradient));
    expect(result.matched).toBe(false);
    expect(result.error).toContain("page dimension mismatch");
  });

  // blur の下の角丸の輪郭は run ごとに 1〜3/255 揺れる。許容は呼び手が明示したときだけ効き、既定は完全一致のまま
  test("per-channel tolerance forgives sub-LSB noise only when asked", () => {
    const base = makePng(40, 30, gradient);
    const off3 = makePng(40, 30, (x, y) => (x === 20 && y === 15 ? [gradient(x, y)[0], gradient(x, y)[1], 63] : gradient(x, y)));
    const off4 = makePng(40, 30, (x, y) => (x === 20 && y === 15 ? [gradient(x, y)[0], gradient(x, y)[1], 64] : gradient(x, y)));
    expect(diffPagePngs(base, off3).matched).toBe(false);
    expect(diffPagePngs(base, off3, [], { tolerance: 3 }).matched).toBe(true);
    expect(diffPagePngs(base, off4, [], { tolerance: 3 }).matched).toBe(false);
  });
});
