// 送信後に `scrollTo({behavior:"smooth"})` する app は animation の途中で撮られる。settle は scroll が止まるまで待つ
import { expect, test } from "@playwright/test";
import { settle } from "../src/mock-states";

test("settle は smooth scroll の着地を待ってから戻る", async ({ page }) => {
  await page.setContent(`<div style="height:6000px"></div>`);
  await page.evaluate(() => window.scrollTo({ top: 4000, behavior: "smooth" }));
  await settle(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(4000);
});
