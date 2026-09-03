// 再生の途中で focus が smooth scroll を起こすと最終 scrollY が run ごとに変わり、fill 後の geometry が揺れる
import { expect, test } from "@playwright/test";
import { freezePage } from "../src/freeze";

test("freezePage は smooth scroll も止める", async ({ page }) => {
  await page.setContent(`<style>html{scroll-behavior:smooth}</style><div style="height:3000px"></div><input id="f">`);
  await freezePage(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
});

// fake clock は timer の種別を覚えていて、rAF の id を clearInterval で掃くと throw する。掃きは止まらず走り切る
test("freezePage は fake clock 下で rAF が pending でも throw せず timer を掃く", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-03T00:00:00Z"));
  await page.setContent(`<div style="height:3000px"></div>`);
  await page.evaluate(() => {
    window.requestAnimationFrame(() => {});
    (window as unknown as { ppTicks: number }).ppTicks = 0;
    window.setInterval(() => {
      (window as unknown as { ppTicks: number }).ppTicks += 1;
    }, 10);
  });
  await freezePage(page);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => (window as unknown as { ppTicks: number }).ppTicks)).toBe(0);
});
