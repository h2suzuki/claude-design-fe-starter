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
