import { expect, test } from "@playwright/test";
import type { Browser, BrowserContextOptions } from "@playwright/test";
import {
  APP_CONFIGURED,
  CONSOLE_ALLOW,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  MOCK_CONFIGURED,
} from "../src/config";
import { blocking, describeFindings, watchContext } from "../src/console-watch";
import type { ConsoleFinding } from "../src/console-watch";
import { installNetworkGuard } from "../src/net-block";
import { CURRENT_SCREEN } from "../src/screen-registry";
import { openScreen } from "../src/targets/app-target";

function blockingMessage(stage: string, findings: readonly ConsoleFinding[]): string {
  return `${stage}: ${findings
    .map((finding) => `${finding.kind}: ${finding.text.slice(0, 200)}`)
    .join(" / ")}`;
}

async function sweepConsole(browser: Browser, options: BrowserContextOptions, viewport: string): Promise<void> {
  const context = await browser.newContext(options);
  try {
    await installNetworkGuard(context);
    // 初期描画と hydration の出力も対象にするため、page を開く前に張る
    const findings = watchContext(context, `${viewport}: ${CURRENT_SCREEN!.entryPath}`, CONSOLE_ALLOW);
    const page = await openScreen(context, CURRENT_SCREEN!);
    const check = (stage: string) => {
      const entries = blocking(findings);
      expect(entries, blockingMessage(stage, entries)).toEqual([]);
    };

    // 陽性対照: 何も描かれていない画面は違反 0 件で「きれいな画面」と見分けがつかない
    expect((await page.locator("body").innerText()).trim(), "nothing rendered — the sweep would pass vacuously").not.toBe("");
    check("initial");
    for (const { name, run } of CURRENT_SCREEN!.interactions) {
      await run(page);
      check(`interaction: ${name}`);
    }
    await page.close();

    // modal と edge は「初期状態から踏む」契約なので、1 枚に重ねず開き直す（modal-geometry-sweep と同じ）
    for (const { name, run } of [...CURRENT_SCREEN!.modals, ...CURRENT_SCREEN!.edges]) {
      const fresh = await openScreen(context, CURRENT_SCREEN!);
      try {
        const list = CURRENT_SCREEN!.list;
        if (list) await fresh.locator(list.rowSelector).first().click();
        await run(fresh);
        check(name);
      } finally {
        await fresh.close();
      }
    }

    console.log(describeFindings(findings));
  } finally {
    await context.close();
  }
}

test.describe("app — console clean", () => {
  test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — 検証する画面の slug が決まらない");
  test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

  test("mobile の全状態で console の error と例外が無い", async ({ browser }) => {
    await sweepConsole(browser, MOBILE_CONTEXT_OPTIONS, "mobile");
  });

  test("desktop の全状態で console の error と例外が無い", async ({ browser }) => {
    await sweepConsole(browser, DESKTOP_CONTEXT_OPTIONS, "desktop");
  });
});
