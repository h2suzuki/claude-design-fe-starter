import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { collectNodes, isObject } from "./ast-refresh";
import type { AstNode } from "./ast-refresh";
import { MOCK_ROOT } from "./mock-server";
import { replayPath } from "./mock-states";
import type { MockStateEdge, MockStateNode } from "./mock-states";

export const STATES_DIR = path.join(MOCK_ROOT, "states");

export interface FrozenStateGraph {
  states: Record<string, MockStateNode>;
  edges: MockStateEdge[];
}

export interface OverlayTarget {
  nodeId: string;
  nodeRef: string;
  node: AstNode;
}

export function overlayTargets(screen: unknown): OverlayTarget[] {
  if (!isObject(screen)) return [];
  return collectNodes(screen.overlays).flatMap((node) =>
    typeof node.id === "string" && isObject(node.source) && typeof node.source.nodeRef === "string"
      ? [{ nodeId: node.id, nodeRef: node.source.nodeRef, node }]
      : [],
  );
}

// 同じ画面の状態グラフを画面 × viewport で何度も読むので、parse 結果を path ごとに残す
const parsedGraphs = new Map<string, { viewports: Record<string, FrozenStateGraph> } | null>();

export function loadStateGraph(
  statesDir: string,
  slug: string,
  viewport: "mobile" | "desktop",
): FrozenStateGraph | null {
  const file = path.join(statesDir, `${slug}.json`);
  let parsed = parsedGraphs.get(file);
  if (parsed === undefined) {
    parsed = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { viewports: Record<string, FrozenStateGraph> })
      : null;
    parsedGraphs.set(file, parsed);
  }
  return parsed?.viewports[viewport] ?? null;
}

export function statesInOrder(graph: FrozenStateGraph): string[] {
  return Object.keys(graph.states).sort(
    (left, right) => graph.states[left]!.depth - graph.states[right]!.depth || left.localeCompare(right),
  );
}

export async function replayTo(page: Page, graph: FrozenStateGraph, stateId: string): Promise<void> {
  const state = graph.states[stateId];
  if (!state) throw new Error(`state-walk: state が見つからない — ${stateId}`);
  await replayPath(page, graph.edges, state.path, undefined, "state-walk:");
}
