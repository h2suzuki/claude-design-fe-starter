// design-reference/export/ を配る極小 static server。
// file:// 直開きは fetch/dynamic import の制約で壊れるため、mock には実 http origin を与える
import { createServer } from "node:http";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.PP_REPO_ROOT ?? path.resolve(HERE, "..", "..");
export const EXPORT_DIR = path.join(REPO_ROOT, "design-reference", "export");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

let startedPromise: Promise<string> | null = null;

// worker process ごとに 1 server を lazy 起動し、以後の navigation で再利用する
export function ensureMockServer(): Promise<string> {
  if (!startedPromise) {
    startedPromise = new Promise<string>((resolve, reject) => {
      const server: Server = createServer((req, res) => {
        void (async () => {
          try {
            const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
            const rel = urlPath === "/" ? "/index.html" : urlPath;
            const filePath = path.join(EXPORT_DIR, rel);
            if (!filePath.startsWith(EXPORT_DIR)) {
              res.writeHead(403);
              res.end();
              return;
            }
            const body = await readFile(filePath);
            res.writeHead(200, { "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
            res.end(body);
          } catch {
            res.writeHead(404);
            res.end();
          }
        })();
      });
      server.on("error", reject);
      // 検証終了後に server handle が event loop を掴んで process を生かし続けないよう unref する
      server.unref();
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") resolve(`http://127.0.0.1:${addr.port}`);
        else reject(new Error("pp mock-server: failed to bind a port"));
      });
    });
  }
  return startedPromise;
}

export async function getMockUrl(file: string): Promise<string> {
  const base = await ensureMockServer();
  return `${base}/${file}`;
}
