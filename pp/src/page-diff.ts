// 画面まるごとの pixel 差。SELECTOR_MAP に載せた id しか見ない parity と違い、
// 折り返し位置のように箱の寸法へ出ない差はここにしか現れない
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface RowCluster {
  start: number;
  end: number;
  pixels: number;
}

export interface PageDiffResult {
  matched: boolean;
  diffPixels: number;
  totalPixels: number;
  /** 差の大きい順。どの帯がずれたかを人が追うための診断 */
  clusters: RowCluster[];
  diffPng: Buffer | null;
  error?: string;
}

// 差のある行は飛び飛びに出る。この行数以内の隙間は 1 つのズレとして繋ぐ
const CLUSTER_GAP_ROWS = 20;

// canvas-diff と違い寸法差を吸収しない。page の高さの違いは bbox の丸めでなくレイアウトの差
export function diffPagePngs(mock: PNG, app: PNG): PageDiffResult {
  const totalPixels = mock.width * mock.height;
  if (mock.width !== app.width || mock.height !== app.height) {
    return {
      matched: false,
      diffPixels: -1,
      totalPixels,
      clusters: [],
      diffPng: null,
      error: `pp: page dimension mismatch mock=${mock.width}x${mock.height} app=${app.width}x${app.height}`,
    };
  }
  const { width, height } = mock;
  const dirtyPerRow = new Uint32Array(height);
  let diffPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      if (mock.data.readUInt32BE(i) !== app.data.readUInt32BE(i)) {
        dirtyPerRow[y] += 1;
        diffPixels += 1;
      }
    }
  }
  const clusters: RowCluster[] = [];
  for (let y = 0; y < height; y += 1) {
    const pixels = dirtyPerRow[y]!;
    if (pixels === 0) continue;
    const last = clusters[clusters.length - 1];
    if (last && y - last.end <= CLUSTER_GAP_ROWS) {
      last.end = y;
      last.pixels += pixels;
    } else {
      clusters.push({ start: y, end: y, pixels });
    }
  }
  clusters.sort((a, b) => b.pixels - a.pixels);
  let diffPng: Buffer | null = null;
  if (diffPixels > 0) {
    const heat = new PNG({ width, height });
    pixelmatch(mock.data, app.data, heat.data, width, height, { threshold: 0 });
    diffPng = PNG.sync.write(heat);
  }
  return { matched: diffPixels === 0, diffPixels, totalPixels, clusters, diffPng };
}
