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

const visualIdForAction = async (page: Page, selector: string, nodes: AstNode[]): Promise<string | null> =>
  page.evaluate(
    ({ selector: mockSelector, candidates }) => {
      let element: Element | null = null;
      try {
        element = document.querySelector(mockSelector);
      } catch {
        return null;
      }
      if (!element) return null;
      for (const candidate of candidates) {
        try {
          if (element.matches(candidate.nodeRef) || document.querySelector(candidate.nodeRef) === element) {
            return candidate.visualId;
          }
        } catch {
          continue;
        }
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
  const visualId = await visualIdForAction(page, action.selector, nodes);
  if (!visualId) return null;
  const appSel = `[data-visual-id=${JSON.stringify(visualId)}]`;
  return action.kind === "fill" ? { kind: "fill", appSel, value: action.value } : { kind: "click", appSel };
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
      else result.unmapped.push({ edgeId, reason: `visualId 無し: ${action.selector} ${edge.label}` });
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
