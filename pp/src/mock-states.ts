import { createHash } from "node:crypto";
import type { BrowserContext, Locator, Page } from "@playwright/test";

export interface MockStateLimits {
  maxDepth: number;
  maxEdgesPerState: number;
  maxStates: number;
  maxSeconds: number;
}

export type MockStateAction =
  | { kind: "click"; selector: string }
  | { kind: "click"; selector: null; backdrop: true }
  | { kind: "key"; key: "Escape" }
  | { kind: "swipe"; selector: string; direction: "left" | "right" }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "navigate"; selector: string; file: string }
  | { kind: "external"; selector: string; url: string };

export interface MockStateNode {
  depth: number;
  path: string[];
  fingerprint: string;
  screenshot: string | null;
}

export interface MockStateEdge {
  id: string;
  from: string;
  action: MockStateAction;
  to?: string;
  label: string;
}

export type MockStateBound = "depth" | "edgesPerState" | "states" | "time";

export interface MockStateReplayFailure {
  state: string;
  expected: string;
  actual: string;
}

export interface MockStateGraph {
  states: Record<string, MockStateNode>;
  edges: MockStateEdge[];
  unchanged: number;
  sampled: number;
  boundsHit: MockStateBound[];
  replayFailures: MockStateReplayFailure[];
}

export interface StateActionCandidate {
  action: MockStateAction;
  selector: string | null;
  label: string;
}

interface ExploreStatesOptions {
  open: () => Promise<Page>;
  viewport: "mobile" | "desktop";
  limits: MockStateLimits;
  siteFiles: ReadonlySet<string>;
  capture?: (page: Page, stateId: string) => Promise<string>;
  onProgress?: (line: string) => void;
}

const SETTLE_MS = 150;

// 探索の副作用（下書き保存・予約）が storage に残ると、同じ context の再生が初期状態を再現できない
export async function isolateStorage(context: BrowserContext): Promise<void> {
  await context.addInitScript("try { localStorage.clear(); sessionStorage.clear(); } catch {}");
}

const addBound = (bounds: MockStateBound[], bound: MockStateBound): void => {
  if (!bounds.includes(bound)) bounds.push(bound);
};

const visibleDomShape = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const excluded = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);
    return [...document.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        if (excluded.has(element.tagName) || element.closest('[aria-hidden="true"]')) return false;
        let ancestor: HTMLElement | null = element;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          if (style.display === "none" || style.visibility === "hidden") return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      })
      .map((element) => {
        const aria = [...element.attributes]
          .filter((attribute) => attribute.name.startsWith("aria-"))
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((attribute) => [attribute.name, attribute.value]);
        const type = element.getAttribute("type");
        return JSON.stringify({
          tagName: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          aria,
          disabled: element.hasAttribute("disabled"),
          open: element.hasAttribute("open"),
          hidden: element.hasAttribute("hidden"),
          dataState: element.getAttribute("data-state"),
          type,
          checked:
            element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")
              ? element.checked
              : null,
        });
      })
      .join("\n");
  });

export async function fingerprintVisibleDom(page: Page): Promise<string> {
  return createHash("sha256").update(await visibleDomShape(page)).digest("hex");
}

export async function selectorForElement(locator: Locator): Promise<string> {
  return locator.evaluate((target) => {
    const parts: string[] = [];
    let element: Element | null = target;
    while (element && element !== document.body) {
      const parent: Element | null = element.parentElement;
      if (!parent) throw new Error("mock-states: body 配下でない要素は操作できない");
      const index = [...parent.children].indexOf(element) + 1;
      parts.unshift(`${element.tagName.toLowerCase()}:nth-child(${index})`);
      element = parent;
    }
    if (element !== document.body) throw new Error("mock-states: body 配下でない要素は操作できない");
    return parts.length === 0 ? "body" : `body > ${parts.join(" > ")}`;
  });
}

interface BrowserCandidate {
  selector: string;
  label: string;
  href: string | null;
  fill: { tag: "input" | "textarea" | "select"; type: string; value: string | null } | null;
}

interface BrowserActions {
  clicks: BrowserCandidate[];
  fills: BrowserCandidate[];
  sampled: number;
  dialogSelector: string | null;
  dialogLabel: string;
}

const browserActions = (page: Page): Promise<BrowserActions> =>
  page.evaluate(() => {
    const isVisible = (element: HTMLElement): boolean => {
      if (element.closest('[aria-hidden="true"]')) return false;
      let ancestor: HTMLElement | null = element;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden") return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    };
    const selector = (target: Element): string => {
      const parts: string[] = [];
      let element: Element | null = target;
      while (element && element !== document.body) {
        const parent: Element | null = element.parentElement;
        if (!parent) throw new Error("mock-states: body 配下でない要素は操作できない");
        parts.unshift(`${element.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(element) + 1})`);
        element = parent;
      }
      return parts.length === 0 ? "body" : `body > ${parts.join(" > ")}`;
    };
    const label = (element: HTMLElement): string =>
      [...(element.innerText ?? element.textContent ?? "").trim().replace(/\s+/g, " ")].slice(0, 40).join("");
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].filter(isVisible);
    const dialog = dialogs[0] ?? null;
    const all = [...document.body.querySelectorAll<HTMLElement>("*")];
    const inScope = (element: HTMLElement): boolean => !dialog || (element !== dialog && dialog.contains(element));
    const clickable = all.filter((element) => {
      if (!inScope(element) || !isVisible(element) || element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
        return false;
      }
      return (
        element.matches(
          'a[href],button,[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="link"],summary,input[type="checkbox"],input[type="radio"],label[for]',
        ) || getComputedStyle(element).cursor === "pointer"
      );
    });
    const clickableSet = new Set(clickable);
    const unnestedClicks = clickable.filter((element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (clickableSet.has(ancestor)) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    });
    const groups = new Map<Element, Map<string, HTMLElement[]>>();
    for (const element of unnestedClicks) {
      const parent = element.parentElement;
      if (!parent) continue;
      const siblings = groups.get(parent) ?? new Map<string, HTMLElement[]>();
      groups.set(parent, siblings);
      const key = JSON.stringify([element.tagName, element.getAttribute("role")]);
      siblings.set(key, [...(siblings.get(key) ?? []), element]);
    }
    const keptClicks = new Set<HTMLElement>();
    let sampled = 0;
    for (const siblings of groups.values()) {
      for (const elements of siblings.values()) {
        if (elements.length < 4) {
          for (const element of elements) keptClicks.add(element);
        } else {
          keptClicks.add(elements[0]);
          keptClicks.add(elements[elements.length - 1]);
          sampled += elements.length - 2;
        }
      }
    }
    const clicks = unnestedClicks
      .filter((element) => keptClicks.has(element))
      .map((element) => ({
        selector: selector(element),
        label: label(element),
        href: element instanceof HTMLAnchorElement ? element.href : null,
        fill: null,
      }));
    const fills = all
      .filter((element) => {
        if (!inScope(element) || !isVisible(element) || element.matches(":disabled")) return false;
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
        return (
          element instanceof HTMLInputElement &&
          !["hidden", "checkbox", "radio", "submit", "button"].includes(element.type)
        );
      })
      .flatMap((element): BrowserCandidate[] => {
        let fill: BrowserCandidate["fill"];
        if (element instanceof HTMLSelectElement) {
          if (element.options.length < 2) return [];
          fill = { tag: "select", type: "select", value: element.options[1]?.value ?? "" };
        } else if (element instanceof HTMLTextAreaElement) {
          fill = { tag: "textarea", type: "textarea", value: null };
        } else if (element instanceof HTMLInputElement) {
          fill = { tag: "input", type: element.type, value: null };
        } else {
          return [];
        }
        return [{ selector: selector(element), label: label(element), href: null, fill }];
      });
    return {
      clicks,
      fills,
      sampled,
      dialogSelector: dialog ? selector(dialog) : null,
      dialogLabel: dialog ? label(dialog) : "",
    };
  });

const representativeValue = (candidate: BrowserCandidate): string => {
  if (candidate.fill?.tag === "select") return candidate.fill.value ?? "";
  if (candidate.fill?.tag === "textarea") return "テスト";
  if (candidate.fill?.type === "email") return "test@example.com";
  if (candidate.fill?.type === "tel") return "0312345678";
  if (candidate.fill?.type === "number") return "1";
  if (candidate.fill?.type === "date") return "2026-01-15";
  return "テスト";
};

const linkedAction = (
  pageUrl: string,
  href: string,
  selector: string,
  siteFiles: ReadonlySet<string>,
): MockStateAction | null => {
  const url = new URL(href, pageUrl);
  const current = new URL(pageUrl);
  const sameDocument =
    url.hash !== "" && url.origin === current.origin && url.pathname === current.pathname && url.search === current.search;
  if (sameDocument) return null;
  const file = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const currentFile = decodeURIComponent(current.pathname).replace(/^\/+/, "");
  if (siteFiles.has(file) && file !== currentFile) return { kind: "navigate", selector, file };
  if (siteFiles.has(file)) return null;
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { kind: "external", selector, url: url.href };
  }
  return null;
};

const collectStateActionResult = async (
  page: Page,
  viewport: "mobile" | "desktop",
  siteFiles: ReadonlySet<string>,
): Promise<{ candidates: StateActionCandidate[]; sampled: number }> => {
  const found = await browserActions(page);
  const candidates: StateActionCandidate[] = found.clicks.map((candidate) => ({
    action:
      candidate.href === null
        ? { kind: "click", selector: candidate.selector }
        : linkedAction(page.url(), candidate.href, candidate.selector, siteFiles) ?? {
            kind: "click",
            selector: candidate.selector,
          },
    selector: candidate.selector,
    label: candidate.label,
  }));
  if (found.dialogSelector) {
    candidates.push({
      action: { kind: "click", selector: null, backdrop: true },
      selector: null,
      label: "backdrop",
    });
    candidates.push({ action: { kind: "key", key: "Escape" }, selector: null, label: found.dialogLabel });
    if (viewport === "mobile") {
      candidates.push(
        {
          action: { kind: "swipe", selector: found.dialogSelector, direction: "left" },
          selector: found.dialogSelector,
          label: found.dialogLabel,
        },
        {
          action: { kind: "swipe", selector: found.dialogSelector, direction: "right" },
          selector: found.dialogSelector,
          label: found.dialogLabel,
        },
      );
    }
  }
  candidates.push(
    ...found.fills.map((candidate) => ({
      action: { kind: "fill" as const, selector: candidate.selector, value: representativeValue(candidate) },
      selector: candidate.selector,
      label: candidate.label,
    })),
  );
  return { candidates, sampled: found.sampled };
};

export async function collectStateActions(
  page: Page,
  viewport: "mobile" | "desktop",
  siteFiles: ReadonlySet<string>,
): Promise<StateActionCandidate[]> {
  return (await collectStateActionResult(page, viewport, siteFiles)).candidates;
}

const clickBackdrop = async (page: Page): Promise<void> => {
  const point = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')].find((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (!dialog) throw new Error("mock-states: backdrop の dialog が見つからない");
    const rect = dialog.getBoundingClientRect();
    const points = [
      { x: 1, y: 1 },
      { x: innerWidth - 2, y: 1 },
      { x: 1, y: innerHeight - 2 },
      { x: innerWidth - 2, y: innerHeight - 2 },
    ];
    const outside = points.find(({ x, y }) => x < rect.left || x > rect.right || y < rect.top || y > rect.bottom);
    if (!outside) throw new Error("mock-states: dialog 外の click 点が見つからない");
    return outside;
  });
  await page.mouse.click(point.x, point.y);
};

const swipe = async (page: Page, selector: string, direction: "left" | "right"): Promise<void> => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`mock-states: swipe 対象が見つからない — ${selector}`);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const distance = (page.viewportSize()?.width ?? box.width) * 0.6 * (direction === "left" ? -1 : 1);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start.x, y: start.y }],
    });
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

const performAction = async (page: Page, action: MockStateAction): Promise<void> => {
  if (action.kind === "navigate" || action.kind === "external") return;
  if (action.kind === "click") {
    if (action.selector === null) await clickBackdrop(page);
    else await page.locator(action.selector).click();
  } else if (action.kind === "key") {
    await page.keyboard.press(action.key);
  } else if (action.kind === "swipe") {
    await swipe(page, action.selector, action.direction);
  } else if (await page.locator(action.selector).evaluate((element) => element instanceof HTMLSelectElement)) {
    await page.locator(action.selector).selectOption(action.value);
  } else {
    await page.locator(action.selector).fill(action.value);
  }
};

const settle = async (page: Page): Promise<void> => {
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState("networkidle");
};

export async function exploreStates(options: ExploreStatesOptions): Promise<MockStateGraph> {
  const startedAt = Date.now();
  const states: Record<string, MockStateNode> = {};
  const edges: MockStateEdge[] = [];
  const boundsHit: MockStateBound[] = [];
  const replayFailures: MockStateReplayFailure[] = [];
  const fingerprints = new Map<string, string>();
  let unchanged = 0;
  let sampled = 0;
  const elapsedSeconds = (): number => Math.floor((Date.now() - startedAt) / 1000);
  const hitBound = (bound: MockStateBound): void => {
    if (boundsHit.includes(bound)) return;
    addBound(boundsHit, bound);
    options.onProgress?.(`上限 ${bound}`);
  };
  const timeExpired = (): boolean => Date.now() - startedAt >= options.limits.maxSeconds * 1000;
  let page = await options.open();
  const rootFingerprint = await fingerprintVisibleDom(page);
  states.root = { depth: 0, path: [], fingerprint: rootFingerprint, screenshot: null };
  fingerprints.set(rootFingerprint, "root");
  await page.close();
  const queue = ["root"];

  const openAt = async (stateId: string): Promise<Page | null> => {
    options.onProgress?.(`再生 ${stateId}（path 長 ${states[stateId]?.path.length ?? 0}）`);
    const opened = await options.open();
    for (const edgeId of states[stateId]?.path ?? []) {
      const edge = edges.find((candidate) => candidate.id === edgeId);
      if (!edge) throw new Error(`mock-states: replay edge が見つからない — ${edgeId}`);
      await performAction(opened, edge.action);
      await settle(opened);
    }
    const actual = await fingerprintVisibleDom(opened);
    const expected = states[stateId]?.fingerprint ?? "";
    if (actual === expected) return opened;
    options.onProgress?.(`再生不一致 ${stateId}`);
    if (!replayFailures.some((failure) => failure.state === stateId && failure.actual === actual)) {
      replayFailures.push({ state: stateId, expected, actual });
    }
    await opened.close();
    return null;
  };

  exploration: while (queue.length > 0) {
    if (timeExpired()) {
      hitBound("time");
      break;
    }
    const stateId = queue.shift();
    if (!stateId) break;
    page = (await openAt(stateId)) as Page;
    if (!page) continue;
    const found = await collectStateActionResult(page, options.viewport, options.siteFiles);
    let candidates = found.candidates;
    sampled += found.sampled;
    options.onProgress?.(
      `展開 ${stateId}（深さ ${states[stateId].depth}、候補 ${candidates.length}、状態数 ${Object.keys(states).length}、経過 ${elapsedSeconds()} 秒）`,
    );
    if (states[stateId].depth >= options.limits.maxDepth) {
      if (candidates.length > 0) hitBound("depth");
      await page.close();
      continue;
    }
    if (candidates.length > options.limits.maxEdgesPerState) {
      hitBound("edgesPerState");
      candidates = candidates.slice(0, options.limits.maxEdgesPerState);
    }
    for (const candidate of candidates) {
      if (timeExpired()) {
        hitBound("time");
        await page.close();
        break exploration;
      }
      if (candidate.action.kind === "navigate" || candidate.action.kind === "external") {
        edges.push({
          id: `e${edges.length + 1}`,
          from: stateId,
          action: candidate.action,
          label: candidate.label,
        });
        continue;
      }
      const before = await page.content();
      await performAction(page, candidate.action);
      await settle(page);
      const fingerprint = await fingerprintVisibleDom(page);
      const observableChanged = (await page.content()) !== before;
      if (fingerprint === states[stateId].fingerprint && !observableChanged) {
        unchanged += 1;
        continue;
      }
      const knownId = fingerprints.get(fingerprint);
      if (!knownId && Object.keys(states).length >= options.limits.maxStates) {
        hitBound("states");
      } else {
        const edgeId = `e${edges.length + 1}`;
        const to = knownId ?? `s-${fingerprint.slice(0, 8)}`;
        edges.push({ id: edgeId, from: stateId, action: candidate.action, to, label: candidate.label });
        if (!knownId) {
          const screenshot = options.capture ? await options.capture(page, to) : null;
          states[to] = {
            depth: states[stateId].depth + 1,
            path: [...states[stateId].path, edgeId],
            fingerprint,
            screenshot,
          };
          fingerprints.set(fingerprint, to);
          queue.push(to);
        }
      }
      await page.close();
      const reopened = await openAt(stateId);
      if (!reopened) break;
      page = reopened;
    }
    if (!page.isClosed()) await page.close();
  }

  return { states, edges, unchanged, sampled, boundsHit, replayFailures };
}
