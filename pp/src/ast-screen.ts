// screen AST の読み出し口。provenance / SELECTOR_MAP 導出 / conformance が同じ探索規則を共有する
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const SCREEN_SUFFIX = ".ui-ast.json";

export interface AstNode {
  binding?: { visualId?: unknown };
  source?: { nodeRef?: unknown };
  children?: AstNode[];
}

export interface AstScreen {
  provenance?: { mockFile?: unknown; sha256?: unknown };
  children?: AstNode[];
  overlays?: AstNode[];
}

export interface LoadedScreen {
  name: string;
  screen?: AstScreen;
  error?: string;
}

export interface ScreenLookup {
  match: LoadedScreen | null;
  errors: string[];
}

export function listScreenAsts(screensDir: string): string[] {
  if (!existsSync(screensDir)) return [];
  return readdirSync(screensDir)
    .filter((name) => name.endsWith(SCREEN_SUFFIX))
    .sort();
}

export function loadScreens(screensDir: string): LoadedScreen[] {
  return listScreenAsts(screensDir).map((name) => {
    try {
      return { name, screen: JSON.parse(readFileSync(path.join(screensDir, name), "utf8"))?.screen };
    } catch (error) {
      return { name, error: `${name}: JSON として読めない（${(error as Error).message}）` };
    }
  });
}

/** PP_MOCK_FILE が指す export を出所とする screen AST を探す。読めなかった file は errors で返す */
export function findScreenForMock(screensDir: string, mockEntryFile: string): ScreenLookup {
  const loaded = mockEntryFile ? loadScreens(screensDir) : [];
  return {
    match: loaded.find((entry) => entry.screen?.provenance?.mockFile === `export/${mockEntryFile}`) ?? null,
    errors: loaded.flatMap((entry) => (entry.error ? [entry.error] : [])),
  };
}
