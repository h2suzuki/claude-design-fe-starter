import type { Page } from "@playwright/test";
import { walkNodes } from "./ast-selector-map";
import type { AstNode } from "./ast-screen";
import { performAction, settle } from "./mock-states";
import type { MockStateEdge } from "./mock-states";
import type { FrozenStateGraph } from "./state-walk";

export interface AppAction {
  kind: "click" | "backdrop" | "key" | "swipe" | "fill";
  appSel?: string;
  key?: "Escape";
  direction?: "left" | "right";
  value?: string;
}

export interface MappedPath {
  steps: AppAction[];
  unmapped: { edgeId: string; reason: string }[];
}

// day cell のような index 指定の兄弟は 1 node = 1 visualId に収まらないので、最寄り祖先からの相対 path で指す
const appSelectorForAction = async (page: Page, selector: string, nodes: AstNode[]): Promise<string | null> =>
  page.evaluate(
    ({ selector: mockSelector, candidates }) => {
      let element: Element | null = null;
      try {
        element = document.querySelector(mockSelector);
      } catch {
        return null;
      }
      if (!element) return null;
      const idFor = (target: Element): string | null => {
        for (const candidate of candidates) {
          try {
            if (candidate.visualId && (target.matches(candidate.nodeRef) || document.querySelector(candidate.nodeRef) === target)) {
              return candidate.visualId;
            }
          } catch {
            continue;
          }
        }
        return null;
      };
      const own = idFor(element);
      if (own) return `[data-visual-id=${JSON.stringify(own)}]`;
      const segments: string[] = [];
      for (let node: Element = element; node.parentElement; node = node.parentElement) {
        const parent = node.parentElement;
        segments.unshift(` > ${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
        const ancestor = idFor(parent);
        if (ancestor) return `[data-visual-id=${JSON.stringify(ancestor)}]${segments.join("")}`;
      }
      return null;
    },
    {
      selector,
      candidates: [...walkNodes(nodes)].flatMap((node) =>
        typeof node.source?.nodeRef === "string"
          ? [{ nodeRef: node.source.nodeRef, visualId: typeof node.binding?.visualId === "string" ? node.binding.visualId : null }]
          : [],
      ),
    },
  );

const mappedSelectorAction = async (
  page: Page,
  edge: MockStateEdge,
  nodes: AstNode[],
): Promise<AppAction | null> => {
  const action = edge.action;
  if (action.kind !== "click" && action.kind !== "fill") return null;
  if (action.kind === "click" && action.selector === null) return { kind: "backdrop" };
  const appSel = await appSelectorForAction(page, action.selector, nodes);
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
  const result: MappedPath = { steps: [], unmapped: [] };
  for (const edgeId of state.path) {
    const edge = graph.edges.find((candidate) => candidate.id === edgeId);
    if (!edge) throw new Error(`state-parity: edge が見つからない — ${edgeId}`);
    const { action } = edge;
    if (action.kind === "click" || action.kind === "fill") {
      const mapped = await mappedSelectorAction(mockPage, edge, nodes);
      if (mapped) result.steps.push(mapped);
      else result.unmapped.push({ edgeId, reason: `visualId 無し: ${shortSelector(action.selector ?? "")} ${edge.label}` });
    } else if (action.kind === "key") {
      result.steps.push({ kind: "key", key: action.key });
    } else if (action.kind === "swipe") {
      result.steps.push({ kind: "swipe", direction: action.direction });
    } else {
      result.unmapped.push({ edgeId, reason: "遷移辺" });
    }
    await performAction(mockPage, action);
    await settle(mockPage);
  }
  return result;
}

const clickBackdrop = async (page: Page): Promise<void> => {
  const point = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].find((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!dialog) throw new Error("state-parity: backdrop の dialog が見つからない");
    const rect = dialog.getBoundingClientRect();
    const points = [
      { x: 1, y: 1 },
      { x: innerWidth - 2, y: 1 },
      { x: 1, y: innerHeight - 2 },
      { x: innerWidth - 2, y: innerHeight - 2 },
    ];
    const outside = points.find(({ x, y }) => x < rect.left || x > rect.right || y < rect.top || y > rect.bottom);
    if (!outside) throw new Error("state-parity: dialog 外の click 点が見つからない");
    return outside;
  });
  await page.mouse.click(point.x, point.y);
};

const swipeDialog = async (page: Page, direction: "left" | "right"): Promise<void> => {
  const box = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].find((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!dialog) return null;
    const rect = dialog.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!box) throw new Error("state-parity: swipe 対象の dialog が見つからない");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const distance = (page.viewportSize()?.width ?? box.width) * 0.6 * (direction === "left" ? -1 : 1);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    for (let step = 1; step <= 5; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start.x + (distance * step) / 5, y: start.y }],
      });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
};

export async function replayOnApp(appPage: Page, steps: AppAction[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === "click") {
      if (!step.appSel) throw new Error("state-parity: click の app selector が無い");
      await appPage.locator(step.appSel).click();
    } else if (step.kind === "backdrop") {
      await clickBackdrop(appPage);
    } else if (step.kind === "key") {
      await appPage.keyboard.press(step.key ?? "Escape");
    } else if (step.kind === "swipe") {
      await swipeDialog(appPage, step.direction ?? "left");
    } else {
      if (!step.appSel) throw new Error("state-parity: fill の app selector が無い");
      const locator = appPage.locator(step.appSel);
      if (await locator.evaluate((element) => element instanceof HTMLSelectElement)) {
        await locator.selectOption(step.value ?? "");
      } else {
        await locator.fill(step.value ?? "");
      }
    }
    await settle(appPage);
  }
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
