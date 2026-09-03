import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "@playwright/test";

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
  | { kind: "fillAll"; fills: { selector: string; value: string }[] }
  | { kind: "navigate"; selector: string; file: string }
  | { kind: "back"; selector: string; file: string }
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
  label: string;
}

export interface StateActionResult {
  candidates: StateActionCandidate[];
  sampled: number;
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

export const DIALOG_SELECTOR = '[role="dialog"], dialog[open]';

// 探索の副作用（下書き保存・予約）が storage に残ると、同じ context の再生が初期状態を再現できない
export async function isolateStorage(context: BrowserContext): Promise<void> {
  await context.addInitScript("try { localStorage.clear(); sessionStorage.clear(); } catch {}");
}

interface BrowserCandidate {
  selector: string;
  label: string;
  href: string | null;
  fill: { tag: "input" | "textarea" | "select"; type: string; value: string | null; empty: boolean } | null;
}

interface BrowserActions {
  clicks: BrowserCandidate[];
  fills: BrowserCandidate[];
  sampled: number;
  dialogSelector: string | null;
  dialogLabel: string;
}

// 可視判定と selector 組み立てを 1 箇所に置くため、形の採取と候補収集を同じ evaluate 本体へ載せる
const inPage = (page: Page, mode: "shape" | "actions"): Promise<string | BrowserActions> =>
  page.evaluate((selected) => {
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
    if (selected === "shape") {
      const excluded = new Set(["SCRIPT", "STYLE", "TEMPLATE"]);
      return [...document.querySelectorAll<HTMLElement>("*")]
        .filter((element) => !excluded.has(element.tagName) && isVisible(element))
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
    }
    // icon だけの button は文字が無いので、人が辺を読める名前を aria-label / title から取る
    const label = (element: HTMLElement): string => {
      const text =
        (element.innerText ?? element.textContent ?? "").trim().replace(/\s+/g, " ") ||
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        "";
      return text.slice(0, 40);
    };
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
      const list = siblings.get(key);
      if (list) list.push(element);
      else siblings.set(key, [element]);
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
          fill = { tag: "select", type: "select", value: element.options[1]?.value ?? "", empty: element.selectedIndex <= 0 };
        } else if (element instanceof HTMLTextAreaElement) {
          fill = { tag: "textarea", type: "textarea", value: null, empty: element.value === "" };
        } else if (element instanceof HTMLInputElement) {
          fill = { tag: "input", type: element.type, value: null, empty: element.value === "" };
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
  }, mode);

const visibleDomShape = async (page: Page): Promise<string> => (await inPage(page, "shape")) as string;

const browserActions = async (page: Page): Promise<BrowserActions> => (await inPage(page, "actions")) as BrowserActions;

// 候補ごとに DOM 全文を CDP へ渡すと重いので、page 内で 32bit hash まで畳んでから比べる
const domHash = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    let hash = 0x811c9dc5;
    for (let index = 0; index < html.length; index += 1) {
      hash = Math.imul(hash ^ html.charCodeAt(index), 0x01000193);
    }
    return hash >>> 0;
  });

export async function fingerprintVisibleDom(page: Page): Promise<string> {
  return createHash("sha256").update(await visibleDomShape(page)).digest("hex");
}

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

export async function collectStateActions(
  page: Page,
  viewport: "mobile" | "desktop",
  siteFiles: ReadonlySet<string>,
): Promise<StateActionResult> {
  const found = await browserActions(page);
  // 往復は復元の問いが立つ dialog の中でだけ、遷移先ごとに 1 本。root からの往復は link の数だけ探索を伸ばすだけ
  const backFiles = new Set<string>();
  const candidates: StateActionCandidate[] = found.clicks.flatMap((candidate): StateActionCandidate[] => {
    const action: MockStateAction =
      candidate.href === null
        ? { kind: "click", selector: candidate.selector }
        : linkedAction(page.url(), candidate.href, candidate.selector, siteFiles) ?? {
            kind: "click",
            selector: candidate.selector,
          };
    if (action.kind !== "navigate" || !found.dialogSelector || backFiles.has(action.file)) {
      return [{ action, label: candidate.label }];
    }
    backFiles.add(action.file);
    return [
      { action, label: candidate.label },
      { action: { kind: "back" as const, selector: action.selector, file: action.file }, label: `${candidate.label} → 戻る` },
    ];
  });
  if (found.dialogSelector) {
    candidates.push({ action: { kind: "click", selector: null, backdrop: true }, label: "backdrop" });
    candidates.push({ action: { kind: "key", key: "Escape" }, label: found.dialogLabel });
    if (viewport === "mobile") {
      candidates.push(
        { action: { kind: "swipe", selector: found.dialogSelector, direction: "left" }, label: found.dialogLabel },
        { action: { kind: "swipe", selector: found.dialogSelector, direction: "right" }, label: found.dialogLabel },
      );
    }
  }
  candidates.push(
    ...found.fills.map((candidate) => ({
      action: { kind: "fill" as const, selector: candidate.selector, value: representativeValue(candidate) },
      label: candidate.label,
    })),
  );
  // fill 単独では形が変わらず状態にならないので、空の入力を全部埋めてから続ける経路を 1 本足す
  const empty = found.fills.filter((candidate) => candidate.fill?.empty);
  if (empty.length > 0) {
    candidates.push({
      action: { kind: "fillAll", fills: empty.map((candidate) => ({ selector: candidate.selector, value: representativeValue(candidate) })) },
      label: "入力を埋める",
    });
  }
  return { candidates, sampled: found.sampled };
}

export const clickBackdrop = async (page: Page): Promise<void> => {
  const point = await page.evaluate((dialogSelector) => {
    const dialog = [...document.querySelectorAll<HTMLElement>(dialogSelector)].find((element) => {
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
  }, DIALOG_SELECTOR);
  await page.mouse.click(point.x, point.y);
};

// 既定は開いている dialog。mock 側は探索が採った nth-child path を渡す
export const swipe = async (
  page: Page,
  direction: "left" | "right",
  selector: string = DIALOG_SELECTOR,
): Promise<void> => {
  const box = await page.locator(selector).locator("visible=true").first().boundingBox();
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

export const performAction = async (page: Page, action: MockStateAction): Promise<void> => {
  if (action.kind === "navigate" || action.kind === "external") return;
  if (action.kind === "click") {
    if (action.selector === null) await clickBackdrop(page);
    else await page.locator(action.selector).click();
  } else if (action.kind === "key") {
    await page.keyboard.press(action.key);
  } else if (action.kind === "swipe") {
    await swipe(page, action.direction, action.selector);
  } else if (action.kind === "back") {
    await page.locator(action.selector).click();
    // 読み込み中に戻ると資産の request が打ち切られ、閉包の欠落と見分けにくい
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await page.waitForLoadState("networkidle");
  } else if (action.kind === "fillAll") {
    for (const fill of action.fills) await fillField(page, fill.selector, fill.value);
  } else {
    await fillField(page, action.selector, action.value);
  }
};

const fillField = async (page: Page, selector: string, value: string): Promise<void> => {
  const field = page.locator(selector);
  if (await field.evaluate((element) => element instanceof HTMLSelectElement)) await field.selectOption(value);
  else await field.fill(value);
};

// `scrollTo({behavior:"smooth"})` は freeze の CSS でも止まらず、animation の途中で撮ると app だけ数百 px ずれる
export const waitForScrollRest = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    let last = `${window.scrollX},${window.scrollY}`;
    let still = 0;
    for (let i = 0; i < 120 && still < 2; i += 1) {
      await frame();
      const now = `${window.scrollX},${window.scrollY}`;
      still = now === last ? still + 1 : 0;
      last = now;
    }
  });
};

export const settle = async (page: Page): Promise<void> => {
  await page.waitForTimeout(SETTLE_MS);
  await page.waitForLoadState("networkidle");
  await waitForScrollRest(page);
};

// source は呼び出し元ごとに違う既存の error 文言を保つためだけの引数
export const replayPath = async (
  page: Page,
  edges: readonly MockStateEdge[],
  path: readonly string[],
  beforeEdge?: (edge: MockStateEdge) => Promise<void>,
  source = "mock-states: replay",
): Promise<void> => {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  for (const edgeId of path) {
    const edge = byId.get(edgeId);
    if (!edge) throw new Error(`${source} edge が見つからない — ${edgeId}`);
    await beforeEdge?.(edge);
    await performAction(page, edge.action);
    await settle(page);
  }
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
    boundsHit.push(bound);
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
    await replayPath(opened, edges, states[stateId]?.path ?? []);
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
    const found = await collectStateActions(page, options.viewport, options.siteFiles);
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
    for (const [index, candidate] of candidates.entries()) {
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
      const before = await domHash(page);
      await performAction(page, candidate.action);
      await settle(page);
      const fingerprint = await fingerprintVisibleDom(page);
      const observableChanged = (await domHash(page)) !== before;
      // 埋めても形が変わらない filled 状態は、親と同じ fingerprint のまま別 id で持つ（submit の出発点になる）
      const filled = candidate.action.kind === "fillAll" && fingerprint === states[stateId].fingerprint;
      // 往復して同じ形に戻ったこと自体が「復元された」という所見なので、back の辺は落とさない
      const back = candidate.action.kind === "back";
      if (!filled && !back && fingerprint === states[stateId].fingerprint && !observableChanged) {
        unchanged += 1;
        continue;
      }
      const knownId = filled ? undefined : fingerprints.get(fingerprint);
      if (!knownId && Object.keys(states).length >= options.limits.maxStates) {
        hitBound("states");
      } else {
        const edgeId = `e${edges.length + 1}`;
        const to = knownId ?? (filled ? `${stateId}+filled` : `s-${fingerprint.slice(0, 8)}`);
        edges.push({ id: edgeId, from: stateId, action: candidate.action, to, label: candidate.label });
        if (!knownId && !states[to]) {
          const screenshot = options.capture ? await options.capture(page, to) : null;
          states[to] = {
            depth: states[stateId].depth + 1,
            path: [...states[stateId].path, edgeId],
            fingerprint,
            screenshot,
          };
          if (!filled) fingerprints.set(fingerprint, to);
          queue.push(to);
        }
      }
      await page.close();
      // 最後の候補を試した後の再生は誰も使わない
      if (index === candidates.length - 1) break;
      const reopened = await openAt(stateId);
      if (!reopened) break;
      page = reopened;
    }
    if (!page.isClosed()) await page.close();
  }

  return { states, edges, unchanged, sampled, boundsHit, replayFailures };
}
