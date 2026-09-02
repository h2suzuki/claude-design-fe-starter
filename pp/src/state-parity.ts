import type { Browser, BrowserContext, BrowserContextOptions, Page } from "@playwright/test";
import { walkNodes } from "./ast-selector-map";
import type { AstNode } from "./ast-screen";
import { isolateStorage, performAction, replayPath, settle, swipe } from "./mock-states";
import type { MockStateEdge } from "./mock-states";
import { installNetworkGuard } from "./net-block";
import { statesInOrder } from "./state-walk";
import type { FrozenStateGraph } from "./state-walk";

export type AppAction =
  | { kind: "click"; appSel: string }
  | { kind: "fill"; appSel: string; value: string }
  | { kind: "backdrop" }
  | { kind: "key"; key: "Escape" }
  | { kind: "swipe"; direction: "left" | "right" };

export interface MappedPath {
  steps: AppAction[];
  unmapped: { edgeId: string; reason: string }[];
}

interface AppSelectorCandidate {
  nodeRef: string;
  visualId: string | null;
}

const selectorCandidates = (nodes: AstNode[]): AppSelectorCandidate[] =>
  [...walkNodes(nodes)].flatMap((node) =>
    typeof node.source?.nodeRef === "string"
      ? [{ nodeRef: node.source.nodeRef, visualId: typeof node.binding?.visualId === "string" ? node.binding.visualId : null }]
      : [],
  );

// day cell のような index 指定の兄弟は 1 node = 1 visualId に収まらないので、最寄り祖先からの相対 path で指す
const appSelectorForAction = async (
  page: Page,
  selector: string,
  candidates: AppSelectorCandidate[],
): Promise<string | null> =>
  page.evaluate(
    ({ selector: mockSelector, candidates: mapped }) => {
      let element: Element | null = null;
      try {
        element = document.querySelector(mockSelector);
      } catch {
        return null;
      }
      if (!element) return null;
      // 祖先 × 候補で querySelector を回すと段数ぶん重なるので、要素 → visualId を 1 度だけ引く
      const idByElement = new Map<Element, string>();
      for (const candidate of mapped) {
        if (!candidate.visualId) continue;
        let matches: NodeListOf<Element>;
        try {
          matches = document.querySelectorAll(candidate.nodeRef);
        } catch {
          continue;
        }
        for (const match of matches) {
          if (!idByElement.has(match)) idByElement.set(match, candidate.visualId);
        }
      }
      const own = idByElement.get(element);
      if (own) return `[data-visual-id=${JSON.stringify(own)}]`;
      const segments: string[] = [];
      for (let node: Element = element; node.parentElement; node = node.parentElement) {
        const parent = node.parentElement;
        segments.unshift(` > ${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
        const ancestor = idByElement.get(parent);
        if (ancestor) return `[data-visual-id=${JSON.stringify(ancestor)}]${segments.join("")}`;
      }
      return null;
    },
    { selector, candidates },
  );

const mappedSelectorAction = async (
  page: Page,
  edge: MockStateEdge,
  candidates: AppSelectorCandidate[],
): Promise<AppAction | null> => {
  const action = edge.action;
  if (action.kind !== "click" && action.kind !== "fill") return null;
  if (action.kind === "click" && action.selector === null) return { kind: "backdrop" };
  const appSel = await appSelectorForAction(page, action.selector, candidates);
  if (!appSel) return null;
  return action.kind === "fill" ? { kind: "fill", appSel, value: action.value } : { kind: "click", appSel };
};

// 探索が書く selector は body からの full path で、失敗一覧では末尾だけあれば要素を特定できる
export const shortSelector = (selector: string, keep = 3): string => {
  const parts = selector.split(" > ");
  return parts.length <= keep ? selector : `… > ${parts.slice(-keep).join(" > ")}`;
};

export async function mapPathToApp(
  mockPage: Page,
  graph: FrozenStateGraph,
  stateId: string,
  nodes: AstNode[],
): Promise<MappedPath> {
  const state = graph.states[stateId];
  if (!state) throw new Error(`state-parity: state が見つからない — ${stateId}`);
  const candidates = selectorCandidates(nodes);
  const result: MappedPath = { steps: [], unmapped: [] };
  await replayPath(
    mockPage,
    graph.edges,
    state.path,
    async (edge) => {
      const { action } = edge;
      if (action.kind === "click" || action.kind === "fill") {
        const mapped = await mappedSelectorAction(mockPage, edge, candidates);
        if (mapped) result.steps.push(mapped);
        else result.unmapped.push({ edgeId: edge.id, reason: `visualId 無し: ${shortSelector(action.selector ?? "")} ${edge.label}` });
      } else if (action.kind === "fillAll") {
        const steps: AppAction[] = [];
        for (const fill of action.fills) {
          const appSel = await appSelectorForAction(mockPage, fill.selector, candidates);
          if (appSel) steps.push({ kind: "fill", appSel, value: fill.value });
          else result.unmapped.push({ edgeId: edge.id, reason: `visualId 無し: ${shortSelector(fill.selector)} ${edge.label}` });
        }
        if (steps.length === action.fills.length) result.steps.push(...steps);
      } else if (action.kind === "key") {
        result.steps.push({ kind: "key", key: action.key });
      } else if (action.kind === "swipe") {
        result.steps.push({ kind: "swipe", direction: action.direction });
      } else {
        result.unmapped.push({ edgeId: edge.id, reason: "遷移辺" });
      }
    },
    "state-parity:",
  );
  return result;
}

export async function replayOnApp(appPage: Page, steps: AppAction[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === "click") {
      await appPage.locator(step.appSel).click();
    } else if (step.kind === "backdrop") {
      await performAction(appPage, { kind: "click", selector: null, backdrop: true });
    } else if (step.kind === "key") {
      await appPage.keyboard.press(step.key);
    } else if (step.kind === "swipe") {
      await swipe(appPage, step.direction);
    } else {
      const locator = appPage.locator(step.appSel);
      if (await locator.evaluate((element) => element instanceof HTMLSelectElement)) {
        await locator.selectOption(step.value);
      } else {
        await locator.fill(step.value);
      }
    }
    await settle(appPage);
  }
}

// 状態ごとの失敗行は spec を跨いで同じ形にする（summarizeFailures がこの形で束ねる）
export function formatStateFailure(failure: {
  stateId: string;
  kind: string;
  detail: string;
  artifact: string;
}): string {
  return `state ${failure.stateId}: ${failure.kind} ${failure.detail} / ${failure.artifact}`;
}

export interface FrozenStateWalk<T> {
  browser: Browser;
  contextOptions: BrowserContextOptions;
  graph: FrozenStateGraph;
  nodes: AstNode[];
  limit: number;
  // 到達不能行の artifact 欄。spec ごとに残す成果物の名前が違う
  artifact: string;
  openMock: (context: BrowserContext) => Promise<Page>;
  openApp: (context: BrowserContext) => Promise<Page>;
  inspect: (mockPage: Page) => Promise<T>;
  ids: (found: T) => number;
  precheck?: (found: T, stateId: string) => string | null;
}

// 状態ごとの往復（2 context・mock 再生・app 再生）は spec 間で同じで、違うのは突合本体だけ
export async function forEachFrozenState<T>(
  options: FrozenStateWalk<T>,
  body: (found: T, mockPage: Page, appPage: Page, stateId: string) => Promise<string[]>,
): Promise<string[]> {
  const failures: string[] = [];
  const stateIds = statesInOrder(options.graph).filter((stateId) => stateId !== "root");
  const targets = stateIds.slice(0, options.limit);
  if (stateIds.length > targets.length) {
    console.log(`state 上限 ${options.limit} に達した（残り ${stateIds.length - targets.length} 状態は未突合）`);
  }
  for (const stateId of targets) {
    const mockCtx = await options.browser.newContext(options.contextOptions);
    const appCtx = await options.browser.newContext(options.contextOptions);
    try {
      await Promise.all([isolateStorage(mockCtx), isolateStorage(appCtx)]);
      await Promise.all([installNetworkGuard(mockCtx), installNetworkGuard(appCtx)]);
      const mockPage = await options.openMock(mockCtx);
      const mapped = await mapPathToApp(mockPage, options.graph, stateId, options.nodes);
      const found = await options.inspect(mockPage);
      if (mapped.unmapped.length > 0) {
        failures.push(
          ...mapped.unmapped.map((item) =>
            formatStateFailure({
              stateId,
              kind: "到達不能",
              detail: `${item.edgeId} ${item.reason}`,
              artifact: options.artifact,
            }),
          ),
        );
        console.log(`state ${stateId}: ids ${options.ids(found)} / 到達不能`);
        continue;
      }
      const blocked = options.precheck?.(found, stateId) ?? null;
      if (blocked) {
        failures.push(blocked);
        continue;
      }
      const appPage = await options.openApp(appCtx);
      try {
        await replayOnApp(appPage, mapped.steps);
      } catch (error) {
        failures.push(
          formatStateFailure({
            stateId,
            kind: "到達不能",
            detail: `app replay ${(error as Error).message.split("\n")[0]}`,
            artifact: options.artifact,
          }),
        );
        console.log(`state ${stateId}: ids ${options.ids(found)} / 到達不能`);
        continue;
      }
      failures.push(...(await body(found, mockPage, appPage, stateId)));
    } finally {
      await mockCtx.close();
      await appCtx.close();
    }
  }
  return failures;
}

// 到達不能は数十状態が同じ trigger を指すので理由ごとに束ね、expect の message が文字列上限を超えないよう行数も切る
export function summarizeFailures(failures: readonly string[], limit = 20): string {
  const unreachable = new Map<string, number>();
  const rest: string[] = [];
  for (const line of failures) {
    const match = /^state \S+: 到達不能 \S+ (.*?)(?: \/ (?:summary|artifacts) なし)?$/.exec(line);
    if (match) unreachable.set(match[1]!, (unreachable.get(match[1]!) ?? 0) + 1);
    else rest.push(line);
  }
  const lines = [
    ...[...unreachable.entries()].map(([reason, count]) => `到達不能 ${count} 状態: ${reason.slice(0, 200)}`),
    ...rest,
  ];
  if (lines.length <= limit) return lines.join("\n");
  return [...lines.slice(0, limit), `…他 ${lines.length - limit} 件`].join("\n");
}
