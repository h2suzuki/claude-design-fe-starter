// 描画前に決まる色の対照: hydration を止めた 1 枚目と hydration 後で、
// 外部 script で色を決める page は差が出て、描画前に決める page は差が出ないことを固定する
import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { paintDiff, readPaintProbe } from "../src/first-paint";

const LIGHT_CSS = "html,body{background:rgb(255, 255, 255);color:rgb(17, 17, 17);margin:0}";
const DARKEN = 'document.documentElement.style.background = "rgb(0, 0, 0)";';

const EXTERNAL_PAGE = `<style>${LIGHT_CSS}</style><script src="/theme.js"></script><body>hi</body>`;
const INLINE_PAGE = `<style>${LIGHT_CSS}</style><script>${DARKEN}</script><body>hi</body>`;

const serve = (context: BrowserContext, html: string) =>
  context.route("http://fixture.local/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const script = pathname === "/theme.js";
    await route.fulfill({
      contentType: script ? "text/javascript" : "text/html",
      body: script ? DARKEN : html,
    });
  });

// 後着優先なので、serve の後に張ると script だけ落ちて他は serve へ落ちる
const blockScripts = (context: BrowserContext) =>
  context.route("**/*", async (route, request) => {
    if (request.resourceType() === "script") await route.abort();
    else await route.fallback();
  });


test("外部 script で色を決める page は、script を落とした 1 枚目と hydration 後で差が出る", async ({ browser }) => {
  const blocked = await browser.newContext();
  const hydrated = await browser.newContext();
  try {
    await serve(blocked, EXTERNAL_PAGE);
    await blockScripts(blocked);
    const first = await blocked.newPage();
    await first.goto("http://fixture.local/");
    await first.waitForLoadState("domcontentloaded");
    await first.waitForTimeout(300);
    const firstProbe = await readPaintProbe(first);

    await serve(hydrated, EXTERNAL_PAGE);
    const after = await hydrated.newPage();
    await after.goto("http://fixture.local/");
    await after.waitForLoadState("load");
    const hydratedProbe = await readPaintProbe(after);

    expect(firstProbe.htmlBackgroundColor).toBe("rgb(255, 255, 255)");
    expect(hydratedProbe.htmlBackgroundColor).toBe("rgb(0, 0, 0)");
    const diff = paintDiff(firstProbe, hydratedProbe);
    expect(diff).not.toBeNull();
    expect(diff).toContain("rgb(0, 0, 0)");
  } finally {
    await blocked.close();
    await hydrated.close();
  }
});

test("描画前の inline script で色を決める page は、script を落としても差が出ない", async ({ browser }) => {
  const blocked = await browser.newContext();
  const hydrated = await browser.newContext();
  try {
    await serve(blocked, INLINE_PAGE);
    await blockScripts(blocked);
    const first = await blocked.newPage();
    await first.goto("http://fixture.local/");
    await first.waitForLoadState("domcontentloaded");
    await first.waitForTimeout(300);
    const firstProbe = await readPaintProbe(first);

    await serve(hydrated, INLINE_PAGE);
    const after = await hydrated.newPage();
    await after.goto("http://fixture.local/");
    await after.waitForLoadState("load");
    const hydratedProbe = await readPaintProbe(after);

    expect(firstProbe.htmlBackgroundColor).toBe("rgb(0, 0, 0)");
    expect(paintDiff(firstProbe, hydratedProbe)).toBeNull();
  } finally {
    await blocked.close();
    await hydrated.close();
  }
});

test("同じ probe 同士は差なしになる", () => {
  const probe = {
    htmlBackgroundColor: "rgb(0, 0, 0)",
    htmlColor: "rgb(255, 255, 255)",
    bodyBackgroundColor: "rgb(0, 0, 0)",
    bodyColor: "rgb(255, 255, 255)",
    dataTheme: "dark",
    className: "theme-dark",
  };
  expect(paintDiff(probe, { ...probe })).toBeNull();
});
