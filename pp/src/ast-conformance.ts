// 実装の data-visual-id tree が AST tree と構造一致するかの判定。pixel を合わせる前に「木の形が違う」を落とす
import { findScreenForMock } from "./ast-screen";
import type { AstNode } from "./ast-screen";
import { walkNodes } from "./ast-selector-map";

export interface VisualNode {
  id: string;
  parent: string | null;
}

export interface ExpectedTree {
  nodes: VisualNode[];
  overlayIds: Set<string>;
  issues: string[];
}

function collect(nodes: AstNode[], parent: string | null, out: VisualNode[]): void {
  for (const node of nodes) {
    const bound = typeof node.binding?.visualId === "string" ? node.binding.visualId : null;
    if (bound) out.push({ id: bound, parent });
    collect(node.children ?? [], bound ?? parent, out);
  }
}

/** base tree を期待値として取り出す。overlay は初期状態で DOM に無いことがあるので別扱いにする */
export function expectedTree(screensDir: string, mockEntryFile: string): ExpectedTree {
  const { match, errors } = findScreenForMock(screensDir, mockEntryFile);
  const nodes: VisualNode[] = [];
  collect(match?.screen?.children ?? [], null, nodes);
  const overlayIds = new Set(
    [...walkNodes(match?.screen?.overlays ?? [])].flatMap((node) =>
      typeof node.binding?.visualId === "string" ? [node.binding.visualId] : [],
    ),
  );
  return { nodes, overlayIds, issues: errors };
}

/** 期待 tree と実装 tree を突き合わせ、出現と親子関係の食い違いを返す */
export function collectConformanceIssues(expected: ExpectedTree, actual: VisualNode[]): string[] {
  const issues = [...expected.issues];
  const seen = new Map<string, VisualNode>();
  for (const node of actual) {
    if (seen.has(node.id)) issues.push(`data-visual-id "${node.id}" が実装に複数ある — 一意にする`);
    else seen.set(node.id, node);
  }

  const expectedIds = new Set(expected.nodes.map((node) => node.id));
  for (const node of expected.nodes) {
    const found = seen.get(node.id);
    if (!found) {
      issues.push(`data-visual-id "${node.id}" が実装に無い`);
      continue;
    }
    // 親が欠落している時の親不一致は派生なので、欠落側だけを報告する
    if (node.parent !== null && !seen.has(node.parent)) continue;
    if (found.parent !== node.parent) {
      issues.push(`"${node.id}" の親が違う（AST: ${node.parent ?? "(root)"} / 実装: ${found.parent ?? "(root)"}）`);
    }
  }

  for (const id of seen.keys()) {
    if (!expectedIds.has(id) && !expected.overlayIds.has(id)) issues.push(`data-visual-id "${id}" が AST に無い`);
  }
  return issues;
}
