// screen AST の binding.visualId / source.nodeRef から SELECTOR_MAP の対を導出する。
// mock 側と app 側の selector を人が二重に書き写す作業は、structural parity の主要な事故源だった
import { findScreenForMock } from "./ast-screen";
import type { AstNode } from "./ast-screen";
import type { SelectorPair } from "./selector-map";

export interface DerivedSelectorMap {
  pairs: Record<string, SelectorPair>;
  issues: string[];
}

export function* walkNodes(nodes: AstNode[]): Generator<AstNode> {
  for (const node of nodes) {
    yield node;
    yield* walkNodes(node.children ?? []);
  }
}

/** PP_MOCK_FILE が指す export に対応する screen AST から対を導く（対応 AST が無ければ空） */
export function deriveSelectorMap(screensDir: string, mockEntryFile: string): DerivedSelectorMap {
  const { match, errors } = findScreenForMock(screensDir, mockEntryFile);
  const pairs: Record<string, SelectorPair> = {};
  const issues = [...errors];
  const dropped = new Set<string>();

  for (const node of walkNodes([...(match?.screen?.children ?? []), ...(match?.screen?.overlays ?? [])])) {
    const { visualId } = node.binding ?? {};
    const { nodeRef } = node.source ?? {};
    if (typeof visualId !== "string" || typeof nodeRef !== "string") continue;
    if (dropped.has(visualId)) continue;
    // 同じ visualId に別 selector が付いたら、どちらが正か機械には決まらないので両方落として報告する
    if (pairs[visualId] && pairs[visualId].mockSel !== nodeRef) {
      issues.push(`${match?.name}: visualId "${visualId}" に複数の source.nodeRef — 導出から除外した`);
      dropped.add(visualId);
      delete pairs[visualId];
      continue;
    }
    pairs[visualId] = { mockSel: nodeRef, appSel: `[data-visual-id="${visualId}"]` };
  }
  return { pairs, issues };
}
