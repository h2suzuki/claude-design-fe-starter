// fixture bridge: app の API 呼び出しを schema 準拠の合成 fixture で代替する。
// fixture は API schema 派生の単一データセットとし、mock と test が同源参照する（二重管理はドリフト源）
import type { Page } from "@playwright/test";

// PJ の API prefix に合わせて差し替える
export const API_PREFIX = "/api/";

export type JsonResponder = () => unknown;
export interface PatternFixture { re: RegExp; build: JsonResponder }

export async function installApiFixtures(
  page: Page,
  exact: Record<string, JsonResponder>,
  patterns: PatternFixture[] = [],
): Promise<void> {
  // pathname の先頭でだけ判定する。glob の **/api/** は dev server が配る module URL まで捕まえる
  await page.route((url) => url.pathname.startsWith(API_PREFIX), async (route) => {
    const url = new URL(route.request().url());
    const responder = exact[url.pathname] ?? patterns.find((p) => p.re.test(url.pathname))?.build;
    if (responder) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responder()) });
      return;
    }
    // fixture 漏れの endpoint は実 BE へ流さず、見える形で失敗させる
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `pp: no fixture registered for ${url.pathname}` }),
    });
  });
}
