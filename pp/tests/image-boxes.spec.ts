// 箱の採り方そのものの自己点検。page-parity は「置かれ方は常に比較する」を箱の件数と位置で判定するので、
// 同じ絵が mock と実装で違う markup になっても 1 枚 1 箱に揃うことをここで固定する
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { blurBleed, boxesAgree, collectImageBoxes, describeCoverage, describeExcluded, padBoxes } from "../src/image-boxes";

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

// 適用先が採っている形。display: contents だけ書くと source が flex item に数えられる
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

test.describe("describeCoverage", () => {
  const boxes = [{ x: 0, y: 0, width: 1, height: 1, src: "assets/a.png" }, { x: 0, y: 0, width: 1, height: 1, src: "uploads/b.png" }];

  test("台帳が全部外していれば、比較した枚数が 0 と読める", () => {
    // 緑でも中身は 1 枚も見ていない。log に出ないと、適用先はそれを見分けられない
    expect(describeCoverage(boxes, ["assets/a.png", "uploads/b.png"])).toBe("画像 2 箇所 / 台帳が外した 2 箇所 → 中身を比較した 0 箇所");
  });

  test("台帳が空なら全部が比較対象と読める", () => {
    expect(describeCoverage(boxes, [])).toBe("画像 2 箇所 / 台帳が外した 0 箇所 → 中身を比較した 2 箇所");
  });

  test("画像が 1 枚も無い画面も、そう読める", () => {
    expect(describeCoverage([], [])).toBe("画像 0 箇所 / 台帳が外した 0 箇所 → 中身を比較した 0 箇所");
  });
});

test.describe("describeExcluded", () => {
  const boxes = [{ x: 0, y: 0, width: 1, height: 1, src: "assets/a.png" }, { x: 0, y: 0, width: 1, height: 1, src: "assets/b.png" }];

  test("entry ごとの枚数を出す", () => {
    expect(describeExcluded(["assets/"], boxes)).toBe("assets/ 2 枚");
  });

  test("台帳が空なら「なし」", () => {
    expect(describeExcluded([], boxes)).toBe("なし");
  });

  // 状態 test は viewport screenshot に mask を当てるので、scroll した状態では page 座標の箱が絵の外にずれる
  test("origin viewport は scroll 分を引いた座標で箱を返す", async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 200 });
    await page.setContent(document_(`<div style="height:1000px"></div><img src="${PIX}" alt="">`));
    const scrolled = await page.evaluate(() => (window.scrollTo(0, 1000), scrollY));
    const [pageBox] = await collectImageBoxes(page);
    const [viewportBox] = await collectImageBoxes(page, { origin: "viewport" });
    expect(scrolled).toBeGreaterThan(0);
    expect(pageBox!.y).toBe(1000);
    expect(viewportBox!.y).toBe(1000 - scrolled);
  });
});

// dialog の backdrop-filter は mask の箱の外へ blur 半径ぶん滲むので、その状態では箱を広げないと縁が比較に残る
test.describe("blur bleed", () => {
  test("有効な backdrop-filter / filter の最大 blur 半径を返し、無ければ 0", async ({ page }) => {
    await page.setContent(document_(`<img src="${PIX}" alt="">`));
    expect(await blurBleed(page)).toBe(0);
    await page.setContent(
      document_(
        `<img src="${PIX}" alt=""><div style="position:fixed;inset:0;backdrop-filter:blur(3px)"></div><div style="filter:blur(5px)">x</div><div hidden style="filter:blur(9px)"></div>`,
      ),
    );
    expect(await blurBleed(page)).toBe(5);
  });

  test("padBoxes は四方に余白を足し、0 なら箱を変えない", () => {
    const box = { x: 10, y: 20, width: 30, height: 40, src: "a" };
    expect(padBoxes([box], 3)).toEqual([{ x: 7, y: 17, width: 36, height: 46, src: "a" }]);
    expect(padBoxes([box], 0)).toEqual([box]);
  });
});
