// mock 側 target: 凍結 export を mock-server 経由で開き、時計 pin → 描画待ち → freeze してから返す
import type { BrowserContext, Page } from "@playwright/test";
import { freezePage } from "../freeze";
import { PP_PINNED_NOW_ISO } from "../config";
import { getMockUrl } from "../mock-server";

export async function openMock(context: BrowserContext, file: string, readySelector: string): Promise<Page> {
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(PP_PINNED_NOW_ISO));
  await page.goto(await getMockUrl(file));
  await page.locator(readySelector).waitFor({ state: "visible" });
  await freezePage(page);
  return page;
}
