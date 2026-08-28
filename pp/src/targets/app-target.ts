// app 側 target: fixture bridge を navigation 前に入れ、時計 pin → 起動 → 描画待ち → freeze。実 BE には触れない
import type { BrowserContext, Page } from "@playwright/test";
import { freezePage } from "../freeze";
import { APP_BASE_URL, PP_PINNED_NOW_ISO } from "../config";
import { installApiFixtures } from "../fixtures/route-intercept";
import { APP_API_FIXTURES, APP_API_PATTERNS } from "../fixtures/app-fixtures";
import type { ScreenSpec } from "../screen-registry";

export interface OpenAppOptions {
  readySelector: string;
  installFixtures?: (page: Page) => Promise<void>;
  baseUrl?: string;
  path?: string;
}

export async function openApp(context: BrowserContext, options: OpenAppOptions): Promise<Page> {
  const page = await context.newPage();
  // 渡し忘れた spec が実 BE へ素通りしないよう、既定でも bridge を張る
  if (options.installFixtures) await options.installFixtures(page);
  else await installApiFixtures(page, APP_API_FIXTURES, APP_API_PATTERNS);
  await page.clock.setFixedTime(new Date(PP_PINNED_NOW_ISO));
  await page.goto(new URL(options.path ?? "/", options.baseUrl ?? APP_BASE_URL).toString());
  await page.locator(options.readySelector).waitFor({ state: "visible" });
  await freezePage(page);
  return page;
}

// 画面の登録点から開く。route・fixture・描画待ちの組を spec ごとに書き写さないための 1 箇所
export async function openScreen(context: BrowserContext, screen: ScreenSpec): Promise<Page> {
  const { fixtures, fixturePatterns } = screen;
  return openApp(context, {
    readySelector: screen.appReadySelector,
    path: screen.entryPath,
    installFixtures:
      fixtures || fixturePatterns
        ? (page) => installApiFixtures(page, fixtures ?? {}, fixturePatterns ?? [])
        : undefined,
  });
}
