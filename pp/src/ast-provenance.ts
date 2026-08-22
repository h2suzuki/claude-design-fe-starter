// screen AST が現行の凍結 mock を向いているかの判定。spec から切り出してあるのは temp dir で陽性対照を取るため
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadScreens } from "./ast-screen";
import type { LoadedScreen } from "./ast-screen";

async function staleReason(mockRoot: string, loaded: LoadedScreen): Promise<string | null> {
  if (loaded.error) return loaded.error;
  const { mockFile, sha256 } = loaded.screen?.provenance ?? {};
  if (typeof mockFile !== "string" || typeof sha256 !== "string") {
    return `${loaded.name}: screen.provenance が無い — tools/ast_validate を先に通す`;
  }
  // provenance.mockFile は ui-mock/ からの相対（export/<slug>.html）
  const target = path.join(mockRoot, mockFile);
  if (!target.startsWith(mockRoot) || !existsSync(target)) return `${loaded.name}: ${mockFile} が凍結置き場に無い`;
  const digest = createHash("sha256").update(await readFile(target)).digest("hex");
  return digest === sha256 ? null : `${loaded.name}: ${mockFile} は再凍結済み — AST が旧 mock 由来のまま`;
}

/** provenance が指す mock と実体の hash を突き合わせ、stale な screen AST の理由を返す */
export async function collectStaleScreens(screensDir: string, mockRoot: string): Promise<string[]> {
  const reasons = await Promise.all(loadScreens(screensDir).map((loaded) => staleReason(mockRoot, loaded)));
  return reasons.filter((reason): reason is string => reason !== null);
}
