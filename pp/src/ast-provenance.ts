// screen AST が現行の凍結 mock を向いているかの判定。spec から切り出してあるのは temp dir で陽性対照を取るため
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const SCREEN_SUFFIX = ".ui-ast.json";

export function listScreenAsts(screensDir: string): string[] {
  if (!existsSync(screensDir)) return [];
  return readdirSync(screensDir)
    .filter((name) => name.endsWith(SCREEN_SUFFIX))
    .sort();
}

async function staleReason(screensDir: string, mockRoot: string, name: string): Promise<string | null> {
  let provenance: { mockFile?: unknown; sha256?: unknown } | undefined;
  try {
    provenance = JSON.parse(await readFile(path.join(screensDir, name), "utf8"))?.screen?.provenance;
  } catch (error) {
    return `${name}: JSON として読めない（${(error as Error).message}）`;
  }
  const { mockFile, sha256 } = provenance ?? {};
  if (typeof mockFile !== "string" || typeof sha256 !== "string") {
    return `${name}: screen.provenance が無い — tools/ast_validate を先に通す`;
  }
  // provenance.mockFile は ui-mock/ からの相対（export/<slug>.html）
  const target = path.join(mockRoot, mockFile);
  if (!target.startsWith(mockRoot) || !existsSync(target)) return `${name}: ${mockFile} が凍結置き場に無い`;
  const digest = createHash("sha256").update(await readFile(target)).digest("hex");
  return digest === sha256 ? null : `${name}: ${mockFile} は再凍結済み — AST が旧 mock 由来のまま`;
}

/** provenance が指す mock と実体の hash を突き合わせ、stale な screen AST の理由を返す */
export async function collectStaleScreens(screensDir: string, mockRoot: string): Promise<string[]> {
  const reasons = await Promise.all(
    listScreenAsts(screensDir).map((name) => staleReason(screensDir, mockRoot, name)),
  );
  return reasons.filter((reason): reason is string => reason !== null);
}
