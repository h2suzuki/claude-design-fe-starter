// screen AST の binding.visualId / source.nodeRef から SELECTOR_MAP の対を導出する。
// mock 側と app 側の selector を人が二重に書き写す作業は、structural parity の主要な事故源だった
import { readFileSync } from "node:fs";
import path from "node:path";
import { listScreenAsts } from "./ast-provenance";
import type { SelectorPair } from "./selector-map";

interface AstNode {
  binding?: { visualId?: unknown };
  source?: { nodeRef?: unknown };
  children?: AstNode[];
}

export interface DerivedSelectorMap {
  pairs: Record<string, SelectorPair>;
  issues: string[];
}

function* walk(nodes: AstNode[]): Generator<AstNode> {
  for (const node of nodes) {
    yield node;
    yield* walk(node.children ?? []);
  }
}

/** PP_MOCK_FILE が指す export に対応する screen AST から対を導く（対応 AST が無ければ空） */
export function deriveSelectorMap(screensDir: string, mockEntryFile: string): DerivedSelectorMap {
  const pairs: Record<string, SelectorPair> = {};
  const issues: string[] = [];
  if (!mockEntryFile) return { pairs, issues };
  const dropped = new Set<string>();

  for (const name of listScreenAsts(screensDir)) {
    let screen;
    try {
      screen = JSON.parse(readFileSync(path.join(screensDir, name), "utf8"))?.screen;
    } catch (error) {
      issues.push(`${name}: JSON として読めない（${(error as Error).message}）`);
      continue;
    }
    if (screen?.provenance?.mockFile !== `export/${mockEntryFile}`) continue;

    for (const node of walk([...(screen.children ?? []), ...(screen.overlays ?? [])])) {
      const { visualId } = node.binding ?? {};
      const { nodeRef } = node.source ?? {};
      if (typeof visualId !== "string" || typeof nodeRef !== "string") continue;
      // 同じ visualId に別 selector が付いたら、どちらが正か機械には決まらないので両方落として報告する
      if (dropped.has(visualId)) continue;
      if (pairs[visualId] && pairs[visualId].mockSel !== nodeRef) {
        issues.push(`${name}: visualId "${visualId}" に複数の source.nodeRef — 導出から除外した`);
        dropped.add(visualId);
        delete pairs[visualId];
        continue;
      }
      pairs[visualId] = { mockSel: nodeRef, appSel: `[data-visual-id="${visualId}"]` };
    }
  }
  return { pairs, issues };
}
