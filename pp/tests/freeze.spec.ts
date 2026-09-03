// 再生の途中で focus が smooth scroll を起こすと最終 scrollY が run ごとに変わり、fill 後の geometry が揺れる
import { expect, test } from "@playwright/test";
import { freezePage } from "../src/freeze";

test("freezePage は smooth scroll も止める", async ({ page }) => {
  await page.setContent(`<style>html{scroll-behavior:smooth}</style><div style="height:3000px"></div><input id="f">`);
  await freezePage(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});
