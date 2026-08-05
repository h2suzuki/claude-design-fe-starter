// app 側 target: fixture bridge を navigation 前に入れ、時計 pin → 起動 → 描画待ち → freeze。実 BE には触れない
import type { BrowserContext, Page } from "@playwright/test";
import { freezePage } from "../freeze";
import { APP_BASE_URL, PP_PINNED_NOW_ISO } from "../config";

export interface OpenAppOptions {
  readySelector: string;
  installFixtures?: (page: Page) => Promise<void>;
  baseUrl?: string;
  path?: string;
}

export async function openApp(context: BrowserContext, options: OpenAppOptions): Promise<Page> {
  const page = await context.newPage();
  if (options.installFixtures) await options.installFixtures(page);
  await page.clock.setFixedTime(new Date(PP_PINNED_NOW_ISO));
  await page.goto(new URL(options.path ?? "/", options.baseUrl ?? APP_BASE_URL).toString());
  await page.locator(options.readySelector).waitFor({ state: "visible" });
  await freezePage(page);
  return page;
}
