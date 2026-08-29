// 箱の採り方そのものの自己点検。page-parity は「置かれ方は常に比較する」を箱の件数と位置で判定するので、
// 同じ絵が mock と実装で違う markup になっても 1 枚 1 箱に揃うことをここで固定する
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { boxesAgree, collectImageBoxes } from "../src/image-boxes";

const PIX = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

// gap のある flex 行。<source> が flex item に数えられると位置がずれるので、その欠陥も検出できる
const document_ = (body: string, extraCss = ""): string =>
  `<!doctype html><meta charset="utf-8"><style>
     body { margin: 0 }
     .row { display: flex; gap: 20px; align-items: flex-start }
     img { width: 120px; height: 90px; display: block }
     ${extraCss}
   </style>${body}`;

const bare = (count: number): string =>
  document_(`<div class="row">${`<img src="${PIX}" alt="">`.repeat(count)}</div>`);

const wrapped = (count: number, extraCss: string): string =>
  document_(
    `<div class="row">${`<picture><source type="image/avif" srcset="x.avif"><img src="${PIX}" alt=""></picture>`.repeat(count)}</div>`,
    extraCss,
  );

// 実装側が重い資産の既定の処置で採る形。display: contents と source の非表示は対で書く
const RECOMMENDED = "picture { display: contents } picture > source { display: none }";

const boxesOf = async (page: Page, html: string) => {
  await page.setContent(html);
  return collectImageBoxes(page);
};

test.describe("image-boxes — how placement is counted", () => {
  test("素の img は 1 枚 1 箱", async ({ page }) => {
    expect(await boxesOf(page, bare(2))).toHaveLength(2);
  });

  test("<picture> に包んでも箱は増えない", async ({ page }) => {
    expect(await boxesOf(page, wrapped(2, RECOMMENDED))).toHaveLength(2);
  });

  test("素の img の mock と <picture> の実装は置かれ方が一致する", async ({ page }) => {
    const mock = await boxesOf(page, bare(2));
    const app = await boxesOf(page, wrapped(2, RECOMMENDED));
    expect(boxesAgree(mock, app)).toBe(true);
  });

  test("source を非表示にしないと gap が増え、置かれ方の差として落ちる", async ({ page }) => {
    const mock = await boxesOf(page, bare(2));
    const app = await boxesOf(page, wrapped(2, "picture { display: contents }"));
    expect(boxesAgree(mock, app)).toBe(false);
  });

  test("画像が 1 枚増えれば落ちる", async ({ page }) => {
    const mock = await boxesOf(page, bare(2));
    const app = await boxesOf(page, bare(3));
    expect(boxesAgree(mock, app)).toBe(false);
  });
});
