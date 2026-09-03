// 画面まるごとの pixel 差。SELECTOR_MAP に載せた id しか見ない parity と違い、
// 折り返し位置のように箱の寸法へ出ない差はここにしか現れない
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** page 全体座標での矩形。fullPage screenshot と同じ原点で持つ */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

// 比較しない領域を敷き詰める。行ごとに区間を塗るので、端をまたぐ矩形が折り返さない
function maskBitmap(width: number, height: number, masks: readonly Box[]): Uint8Array | null {
  if (masks.length === 0) return null;
  const bitmap = new Uint8Array(width * height);
  for (const box of masks) {
    const left = Math.max(0, Math.floor(box.x));
    const right = Math.min(width, Math.ceil(box.x + box.width));
    const top = Math.max(0, Math.floor(box.y));
    const bottom = Math.min(height, Math.ceil(box.y + box.height));
    for (let y = top; y < bottom; y += 1) bitmap.fill(1, y * width + left, y * width + right);
  }
  return bitmap;
}

// backdrop-filter の blur 下では輪郭が run ごとに揺れる（実測: 178 状態で ±1〜3 が 1023 px、4 が 1 px。位置は縁だけ）
export const BLUR_CHANNEL_TOLERANCE = 4;

const withinTolerance = (mock: Buffer, app: Buffer, i: number, tolerance: number): boolean =>
  Math.abs(mock[i]! - app[i]!) <= tolerance &&
  Math.abs(mock[i + 1]! - app[i + 1]!) <= tolerance &&
  Math.abs(mock[i + 2]! - app[i + 2]!) <= tolerance &&
  Math.abs(mock[i + 3]! - app[i + 3]!) <= tolerance;

// canvas-diff と違い寸法差を吸収しない。page の高さの違いは bbox の丸めでなくレイアウトの差
// masks に渡した領域は比較しない（画像は軽量化してよいので、中身の差を数えると規約に従った実装が落ちる）
// tolerance は channel ごとの絶対差の許容で、既定 0 は完全一致。blur の効く状態でだけ呼び手が緩める
export function diffPagePngs(
  mock: PNG,
  app: PNG,
  masks: readonly Box[] = [],
  options: { tolerance?: number } = {},
): PageDiffResult {
  const tolerance = options.tolerance ?? 0;
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
  const skip = maskBitmap(width, height, masks);
  const dirtyPerRow = new Uint32Array(height);
  let diffPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (skip?.[y * width + x]) continue;
      const i = (width * y + x) << 2;
      const same = tolerance === 0 ? mock.data.readUInt32BE(i) === app.data.readUInt32BE(i) : withinTolerance(mock.data, app.data, i, tolerance);
      if (!same) {
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
