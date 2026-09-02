// ready マーカーを待つ gate は hydration 後しか見ず、mount 後に theme を決める実装の 1 フレームの light を素通しする。
// hydration を止めた描画と hydration 後を同じ状態から 2 回開いて突き合わせる
import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";
import { APP_BASE_URL, APP_CONFIGURED, MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED } from "../src/config";
import { describeProbe, paintDiff, readPaintProbe } from "../src/first-paint";
import { APP_API_FIXTURES, APP_API_PATTERNS } from "../src/fixtures/app-fixtures";
import { installApiFixtures } from "../src/fixtures/route-intercept";
import { installNetworkGuard } from "../src/net-block";
import { openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";

// 後着優先。script だけ落として他は先着の guard / fixture へ落とす（continue すると guard を抜ける）
const blockHydration = (context: BrowserContext) =>
  context.route("**/*", async (route, request) => {
    if (request.resourceType() === "script") await route.abort();
    else await route.fallback();
  });

test.describe("app — SSR first paint", () => {
  test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — 検証する画面の slug が決まらない");
  test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
  test.skip(
    !CURRENT_SCREEN?.prePaintStates?.length,
    "prePaintStates 未登録 — 描画前に決める状態が無い、または SSR しない PJ は pp/gate-not-applicable.json で宣言する",
  );

  test("every pre-paint state paints the same before and after hydration", async ({ browser }) => {
    const screen = CURRENT_SCREEN!;
    const failures: string[] = [];
    for (const { name, apply } of screen.prePaintStates!) {
      const firstContext = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
      const hydratedContext = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
      try {
        await installNetworkGuard(firstContext);
        await apply(firstContext);
        await blockHydration(firstContext);
        const firstPage = await firstContext.newPage();
        await installApiFixtures(
          firstPage,
          screen.fixtures ?? APP_API_FIXTURES,
          screen.fixturePatterns ?? APP_API_PATTERNS,
        );
        await firstPage.goto(new URL(screen.entryPath, APP_BASE_URL).toString());
        await firstPage.waitForLoadState("domcontentloaded");
        // hydration が無い分 ready マーカーが立たないので、描画の落ち着きは待ち時間で取る
        await firstPage.waitForTimeout(300);
        const first = await readPaintProbe(firstPage);

        await installNetworkGuard(hydratedContext);
        await apply(hydratedContext);
        const hydrated = await readPaintProbe(await openScreen(hydratedContext, screen));

        const diff = paintDiff(first, hydrated);
        if (diff) failures.push(`state ${name}: ${diff}`);
        console.log(`ssr-first-paint: ${name} — ${diff ?? "差なし"}`);
        console.log(`  first paint: ${describeProbe(first)}`);
        console.log(`  hydrated:    ${describeProbe(hydrated)}`);
      } finally {
        await firstContext.close();
        await hydratedContext.close();
      }
    }
    expect(failures).toEqual([]);
  });
});
