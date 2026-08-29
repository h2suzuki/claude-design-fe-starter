// 画像の「置かれ方」を採る。中身を比較から外すかは KEEP_IMPL 台帳が決めるので、src も採る
import type { Page } from "@playwright/test";
import type { Box } from "./page-diff";

export interface ImageBox extends Box {
  src: string;
}

// 包む要素は数えない。<picture> は <img> をちょうど 1 つ持つので、img を採れば 1 枚 1 箱になる
export const IMAGE_BOX_SELECTOR = "img, video";

export const collectImageBoxes = async (page: Page): Promise<ImageBox[]> =>
  page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll(selector)).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + scrollX,
          y: rect.top + scrollY,
          width: rect.width,
          height: rect.height,
          src: el instanceof HTMLImageElement ? el.currentSrc || el.src : "",
        };
      }),
    IMAGE_BOX_SELECTOR,
  );

// 1px 未満のずれは縮小時の丸めで出る。ここは「マスクを当ててよいか」の判定なので、寸法の厳密比較は parity に任せる
export const boxesAgree = (mock: readonly Box[], app: readonly Box[]): boolean =>
  mock.length === app.length &&
  mock.every((box, index) => {
    const other = app[index]!;
    return (["x", "y", "width", "height"] as const).every((key) => Math.abs(box[key] - other[key]) < 1);
  });

const excludedBoxes = (boxes: readonly ImageBox[], targets: readonly string[]): ImageBox[] =>
  boxes.filter((box) => targets.some((target) => box.src.includes(target)));

// 台帳が全部を外していても gate は緑になる。何箇所を見たのかを毎回出さないと、空の緑と見分けられない
export const describeCoverage = (boxes: readonly ImageBox[], targets: readonly string[]): string => {
  const excluded = excludedBoxes(boxes, targets).length;
  return `画像 ${boxes.length} 箇所 / 台帳が外した ${excluded} 箇所 → 中身を比較した ${boxes.length - excluded} 箇所`;
};

// どの entry が何枚を外したかまで出す。1 行で全画像が外れていても、合計だけでは気づけない
export const describeExcluded = (targets: readonly string[], boxes: readonly ImageBox[]): string =>
  targets.length === 0
    ? "なし"
    : targets.map((target) => `${target} ${boxes.filter((box) => box.src.includes(target)).length} 枚`).join(" / ");
