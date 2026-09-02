import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { collectNodes } from "./ast-refresh";
import { MOCK_ROOT } from "./mock-server";
import { performAction, settle } from "./mock-states";
import type { MockStateEdge } from "./mock-states";

export const STATES_DIR = path.join(MOCK_ROOT, "states");

export interface FrozenStateGraph {
  states: Record<string, { depth: number; path: string[]; fingerprint: string; screenshot: string | null }>;
  edges: MockStateEdge[];
}

export interface OverlayTarget {
  nodeId: string;
  nodeRef: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function overlayTargets(screen: unknown): OverlayTarget[] {
  if (!isObject(screen)) return [];
  return collectNodes(screen.overlays).flatMap((node) =>
    typeof node.id === "string" && isObject(node.source) && typeof node.source.nodeRef === "string"
      ? [{ nodeId: node.id, nodeRef: node.source.nodeRef }]
      : [],
  );
}

export function loadStateGraph(
  statesDir: string,
  slug: string,
  viewport: "mobile" | "desktop",
): FrozenStateGraph | null {
  const file = path.join(statesDir, `${slug}.json`);
  if (!existsSync(file)) return null;
  return (JSON.parse(readFileSync(file, "utf8")) as { viewports: Record<string, FrozenStateGraph> }).viewports[viewport] ?? null;
}

export function statesInOrder(graph: FrozenStateGraph): string[] {
  return Object.keys(graph.states).sort(
    (left, right) => graph.states[left]!.depth - graph.states[right]!.depth || left.localeCompare(right),
  );
}

export async function replayTo(page: Page, graph: FrozenStateGraph, stateId: string): Promise<void> {
  const state = graph.states[stateId];
  if (!state) throw new Error(`state-walk: state が見つからない — ${stateId}`);
  for (const edgeId of state.path) {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) throw new Error(`state-walk: edge が見つからない — ${edgeId}`);
    await performAction(page, edge.action);
    await settle(page);
  }
}
