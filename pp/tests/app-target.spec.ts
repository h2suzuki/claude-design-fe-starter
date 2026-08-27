// fixture bridge を渡し忘れた spec が実 BE へ素通ししないことの陽性対照。
// 素通しすると BE のデータが変わるたびに gate が赤くなり、検証結果が BE の状態に従属する
import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openApp } from "../src/targets/app-target";

// 実 BE を模す。API に応じたら「素通しした」ことの証拠になる
async function startBackendLikeServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ from: "the real backend" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<html><body><div id="ready">ready</div></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe("openApp — fixture bridge", () => {
  test("a caller that passes no fixtures still cannot reach a real backend", async ({ browser }) => {
    const backend = await startBackendLikeServer();
    const context = await browser.newContext();
    try {
      const page = await openApp(context, { readySelector: "#ready", baseUrl: backend.url });
      const body = await page.evaluate(async () => (await fetch("/api/anything")).json());
      expect(JSON.stringify(body)).toContain("no fixture registered");
    } finally {
      await context.close();
      await backend.close();
    }
  });
});
