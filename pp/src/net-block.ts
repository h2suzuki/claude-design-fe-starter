// 外部 network ゼロの gate。mock/app が参照する外部資産は pp/vendor/ に同梱し、URL→ファイル対応を登録する
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { BrowserContext, Request } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDOR_DIR = path.join(HERE, "..", "vendor");

// 例: { urlPattern: "https://fonts.gstatic.com/**", file: "fonts/YourFont.woff2", contentType: "font/woff2" }
export interface VendorRoute { urlPattern: string; file: string; contentType: string }

// 台帳は mock-lint も読む。ここを配列にすると許可が 2 箇所に割れる
export const VENDOR_ROUTES: VendorRoute[] = JSON.parse(
  readFileSync(path.join(VENDOR_DIR, "routes.json"), "utf8"),
).routes;

// 子 frame の navigation は export の file ではなく live な外部 embed。guard の abort は閉包の欠落ではない
export const isEmbedRequest = (request: Request): boolean =>
  request.isNavigationRequest() && request.frame().parentFrame() !== null;

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
      // SRI 検証と @font-face は CORS mode で読むので、許可 header が無いと vendor 済みでも失敗する
      await route.fulfill({
        status: 200,
        contentType,
        headers: { "access-control-allow-origin": "*" },
        path: vendorPath,
      });
    });
  }
}
