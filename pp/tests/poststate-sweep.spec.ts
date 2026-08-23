// 操作後状態スイープ（DoD の「状態」の網）: parity は spec が踏んだ状態しか見ない。
// クリック等で初めて現れる状態を INTERACTIONS に登録して踏み、未解決 literal が画面に出ないことを検証する
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { APP_CONFIGURED, MOBILE_CONTEXT_OPTIONS } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openApp } from "../src/targets/app-target";

// \b は "[" の外側に word 文字を要求するため、bracket 形はグループから分離する（混ぜると素の "[object Object]" を取りこぼす）
const FORBIDDEN_LITERAL = /\b(?:undefined|null|NaN)\b|\[object Object\]/;

// app の描画完了を示すセレクタに差し替える
const READY_SELECTOR = "body";

// 画面状態を変える操作を PJ ごとに登録する（行選択・ソート・タブ切替・モーダル開閉等）。空でも初期状態は検証される
const INTERACTIONS: Array<{ name: string; run: (page: Page) => Promise<void> }> = [];

// display:none 以下を除いた可視テキストを列挙する（画面全体を検査対象にする）
const visibleText = (page: Page) =>
  page.locator("body").evaluate((body) => {
    const out: string[] = [];
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim();
          if (text) out.push(text);
        } else if (child.nodeType === Node.ELEMENT_NODE && getComputedStyle(child as Element).display !== "none") {
          walk(child);
        }
      }
    };
    walk(body);
    return out;
  });

async function assertClean(page: Page, where: string): Promise<void> {
  const texts = await visibleText(page);
  // 陽性対照: 空画面は違反 0 件で「きれいな画面」と見分けがつかない
  expect(texts.length, `${where}: nothing rendered — the sweep would pass vacuously`).toBeGreaterThan(0);
  expect(texts.filter((t) => FORBIDDEN_LITERAL.test(t)), `${where}: unresolved literal`).toEqual([]);
}

test.describe("app — post-interaction state sweep", () => {
  test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

  test("initial state and every registered interaction stay clean", async ({ browser }) => {
    const context = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
    try {
      await installNetworkGuard(context);
      const page = await openApp(context, { readySelector: READY_SELECTOR });
      await assertClean(page, "initial");
      for (const { name, run } of INTERACTIONS) {
        await run(page);
        await assertClean(page, name);
      }
    } finally {
      await context.close();
    }
  });
});
