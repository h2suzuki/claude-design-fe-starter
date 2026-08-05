// 外部 network ゼロの gate。mock/app が参照する外部資産は pp/vendor/ に同梱し、URL→ファイル対応を登録する
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = path.join(HERE, "..", "vendor");

// 例: { urlPattern: "https://fonts.gstatic.com/**", file: "fonts/YourFont.woff2", contentType: "font/woff2" }
export interface VendorRoute { urlPattern: string; file: string; contentType: string }
export const VENDOR_ROUTES: VendorRoute[] = [];

export async function installNetworkGuard(context: BrowserContext): Promise<void> {
  // Playwright の route は後着優先 — 広い catch-all を先に、個別 vendor route を後に登録する
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const isLocal =
      url.protocol === "file:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocal) {
      await route.fallback();
      return;
    }
    // vendor 登録漏れの外部アクセスは黙って通さず失敗させる（非決定性の再侵入防止）
    await route.abort("failed");
  });
  for (const { urlPattern, file, contentType } of VENDOR_ROUTES) {
    const vendorPath = path.join(VENDOR_DIR, file);
    await context.route(urlPattern, async (route) => {
      if (!existsSync(vendorPath)) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ status: 200, contentType, path: vendorPath });
    });
  }
}
