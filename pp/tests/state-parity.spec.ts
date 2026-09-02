import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import type { AstNode } from "../src/ast-screen";
import { mapPathToApp, replayOnApp, shortSelector, summarizeFailures } from "../src/state-parity";
import type { FrozenStateGraph } from "../src/state-walk";

const GRAPH: FrozenStateGraph = {
  states: {
    root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
    open: { depth: 1, path: ["e-open"], fingerprint: "open", screenshot: null },
    tab: { depth: 2, path: ["e-open", "e-tab"], fingerprint: "tab", screenshot: null },
  },
  edges: [
    { id: "e-open", from: "root", to: "open", action: { kind: "click", selector: "#open" }, label: "開く" },
    { id: "e-tab", from: "open", to: "tab", action: { kind: "click", selector: "#tab" }, label: "タブ B" },
  ],
};

const NODES: AstNode[] = [
  { source: { nodeRef: "#open" }, binding: { visualId: "open-picker" } },
  { source: { nodeRef: "#tab" }, binding: { visualId: "picker-tab-b" } },
];

const routeFixture = async (context: BrowserContext, app = false): Promise<Page> => {
  await context.route("http://fixture.local/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button id="open" ${app ? 'data-visual-id="open-picker"' : ""}>開く</button>
        <dialog><button id="tab" ${app ? 'data-visual-id="picker-tab-b"' : ""}>タブ B</button></dialog>
        <script>
          document.querySelector("#open").onclick = () => document.querySelector("dialog").showModal();
          document.querySelector("#tab").onclick = () => document.querySelector("dialog").dataset.state = "tab-b";
        </script>`,
    }),
  );
  const page = await context.newPage();
  await page.goto("http://fixture.local/");
  return page;
};

test("mock の click path を visual id の app 操作へ写す", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeFixture(context);

  expect(await mapPathToApp(page, GRAPH, "tab", NODES)).toEqual({
    steps: [
      { kind: "click", appSel: '[data-visual-id="open-picker"]' },
      { kind: "click", appSel: '[data-visual-id="picker-tab-b"]' },
    ],
    unmapped: [],
  });
  await expect(page.locator('dialog[data-state="tab-b"]')).toHaveCount(1);
  await context.close();
});

test("visual id の無い辺を到達不能として分離する", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeFixture(context);

  expect(
    await mapPathToApp(page, GRAPH, "tab", [NODES[0]!, { source: { nodeRef: "#tab" } }]),
  ).toEqual({
    steps: [{ kind: "click", appSel: '[data-visual-id="open-picker"]' }],
    unmapped: [{ edgeId: "e-tab", reason: "visualId 無し: #tab タブ B" }],
  });
  await context.close();
});

test("Escape と backdrop を selector 無しの app 操作へ写す", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeFixture(context);
  const graph: FrozenStateGraph = {
    states: {
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      escape: { depth: 1, path: ["e-key"], fingerprint: "escape", screenshot: null },
      backdrop: { depth: 1, path: ["e-backdrop"], fingerprint: "backdrop", screenshot: null },
    },
    edges: [
      { id: "e-key", from: "root", to: "escape", action: { kind: "key", key: "Escape" }, label: "閉じる" },
      {
        id: "e-backdrop",
        from: "root",
        to: "backdrop",
        action: { kind: "click", selector: null, backdrop: true },
        label: "backdrop",
      },
    ],
  };
  await page.locator("dialog").evaluate((dialog) => (dialog as HTMLDialogElement).showModal());
  expect(await mapPathToApp(page, graph, "escape", [])).toEqual({
    steps: [{ kind: "key", key: "Escape" }],
    unmapped: [],
  });
  await page.reload();
  await page.locator("dialog").evaluate((dialog) => (dialog as HTMLDialogElement).showModal());
  expect(await mapPathToApp(page, graph, "backdrop", [])).toEqual({
    steps: [{ kind: "backdrop" }],
    unmapped: [],
  });
  await context.close();
});

test("app 操作を一辺ずつ再生して dialog 内の状態へ到達する", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeFixture(context, true);

  await replayOnApp(page, [
    { kind: "click", appSel: '[data-visual-id="open-picker"]' },
    { kind: "click", appSel: '[data-visual-id="picker-tab-b"]' },
  ]);

  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.locator('dialog[data-state="tab-b"]')).toHaveCount(1);
  await context.close();
});

test("失敗一覧は到達不能を理由ごとにまとめ、行数に上限を置く", () => {
  // 78 状態 × 数本の full CSS path をそのまま並べると expect の message が文字列上限を超える
  const unreachable = Array.from({ length: 30 }, (_, i) => `state s-${i}: 到達不能 e${i} visualId 無し: body > div:nth-child(1) > button:nth-child(2) 前月 / summary なし`);
  const summary = summarizeFailures([...unreachable, "state s-x: style 4 / a.json", "state s-y: pixel 12px / b.png"]);
  const lines = summary.split("\n");
  expect(lines[0]).toBe("到達不能 30 状態: visualId 無し: body > div:nth-child(1) > button:nth-child(2) 前月");
  expect(lines).toContain("state s-x: style 4 / a.json");
  expect(lines.length).toBe(3);
  expect(summarizeFailures([])).toBe("");
  const many = Array.from({ length: 50 }, (_, i) => `state s-${i}: style ${i} / f.json`);
  expect(summarizeFailures(many).split("\n").length).toBe(21);
  expect(summarizeFailures(many)).toContain("他 30 件");
});

// 到達不能の行は同じ深さの前置きが 35 行並ぶと読めない。末尾だけ残せば要素は特定できる
test("shortSelector は CSS path の末尾 3 段だけ残す", () => {
  expect(shortSelector("body > div:nth-child(1) > main > form > div:nth-child(3) > .dp-grid > button:nth-child(2)")).toBe(
    "… > div:nth-child(3) > .dp-grid > button:nth-child(2)",
  );
  expect(shortSelector("#tab")).toBe("#tab");
});

const GRID_GRAPH: FrozenStateGraph = {
  states: {
    root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
    day: { depth: 1, path: ["e-day"], fingerprint: "day", screenshot: null },
    deep: { depth: 1, path: ["e-deep"], fingerprint: "deep", screenshot: null },
  },
  edges: [
    { id: "e-day", from: "root", to: "day", action: { kind: "click", selector: "#grid > button:nth-child(2)" }, label: "2 日" },
    {
      id: "e-deep",
      from: "root",
      to: "deep",
      action: { kind: "click", selector: "#week > div:nth-child(1) > button:nth-child(3)" },
      label: "水曜",
    },
  ],
};

const GRID_NODES: AstNode[] = [
  { source: { nodeRef: "#grid" }, binding: { visualId: "day-grid" } },
  { source: { nodeRef: "#week" }, binding: { visualId: "week-grid" } },
];

const routeGridFixture = async (context: BrowserContext, app = false): Promise<Page> => {
  await context.route("http://grid.local/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div id="grid" ${app ? 'data-visual-id="day-grid"' : ""}><button>1</button><button>2</button><button>3</button></div>
        <div id="week" ${app ? 'data-visual-id="week-grid"' : ""}><div><button>月</button><button>火</button><button>水</button></div></div>
        <script>
          document.body.onclick = (event) => { if (event.target.tagName === "BUTTON") document.body.dataset.picked = event.target.textContent; };
        </script>`,
    }),
  );
  const page = await context.newPage();
  await page.goto("http://grid.local/");
  return page;
};

test("visual id を持つ最寄り祖先からの nth-child path で兄弟を指す", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeGridFixture(context);

  expect(await mapPathToApp(page, GRID_GRAPH, "day", GRID_NODES)).toEqual({
    steps: [{ kind: "click", appSel: '[data-visual-id="day-grid"] > button:nth-child(2)' }],
    unmapped: [],
  });
  await context.close();
});

test("祖先までの段数だけ nth-child を連ねる", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeGridFixture(context);

  expect(await mapPathToApp(page, GRID_GRAPH, "deep", GRID_NODES)).toEqual({
    steps: [{ kind: "click", appSel: '[data-visual-id="week-grid"] > div:nth-child(1) > button:nth-child(3)' }],
    unmapped: [],
  });
  await context.close();
});

test("祖先起点の app selector をそのまま app 側で click できる", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await routeGridFixture(context, true);

  await replayOnApp(page, [{ kind: "click", appSel: '[data-visual-id="day-grid"] > button:nth-child(2)' }]);

  await expect(page.locator('body[data-picked="2"]')).toHaveCount(1);
  await context.close();
});

test("fillAll の辺は入力ごとの fill へ写し、1 つでも写せなければ到達不能にする", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route("http://form.local/**", (route) =>
    route.fulfill({ contentType: "text/html", body: `<input id="name"><input id="mail">` }),
  );
  const page = await context.newPage();
  await page.goto("http://form.local/");
  const graph: FrozenStateGraph = {
    states: {
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      "root+filled": { depth: 1, path: ["e-fill"], fingerprint: "root", screenshot: null },
    },
    edges: [
      {
        id: "e-fill",
        from: "root",
        to: "root+filled",
        action: { kind: "fillAll", fills: [{ selector: "#name", value: "テスト" }, { selector: "#mail", value: "a@b" }] },
        label: "入力を埋める",
      },
    ],
  };
  const both: AstNode[] = [
    { source: { nodeRef: "#name" }, binding: { visualId: "name" } },
    { source: { nodeRef: "#mail" }, binding: { visualId: "mail" } },
  ];
  expect(await mapPathToApp(page, graph, "root+filled", both)).toEqual({
    steps: [
      { kind: "fill", appSel: '[data-visual-id="name"]', value: "テスト" },
      { kind: "fill", appSel: '[data-visual-id="mail"]', value: "a@b" },
    ],
    unmapped: [],
  });
  await page.goto("http://form.local/");
  expect((await mapPathToApp(page, graph, "root+filled", [both[0]!])).unmapped).toEqual([
    { edgeId: "e-fill", reason: "visualId 無し: #mail 入力を埋める" },
  ]);
  await context.close();
});

// overlay から別画面へ出て戻る経路は、app 側でも同じ往復を踏まないと復元を突合できない
test("back 辺を app の click と履歴戻りへ写して再生する", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route("http://back.local/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: route.request().url().includes("other.html")
        ? "<main>会場</main>"
        : `<a id="go" href="/other.html" data-visual-id="venue-link">会場</a>`,
    }),
  );
  const graph: FrozenStateGraph = {
    states: {
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      restored: { depth: 1, path: ["e-back"], fingerprint: "root", screenshot: null },
    },
    edges: [
      {
        id: "e-back",
        from: "root",
        to: "root",
        action: { kind: "back", selector: "#go", file: "other.html" },
        label: "会場 → 戻る",
      },
    ],
  };
  const nodes: AstNode[] = [{ source: { nodeRef: "#go" }, binding: { visualId: "venue-link" } }];
  const mockPage = await context.newPage();
  await mockPage.goto("http://back.local/");
  expect(await mapPathToApp(mockPage, graph, "restored", nodes)).toEqual({
    steps: [{ kind: "back", appSel: '[data-visual-id="venue-link"]' }],
    unmapped: [],
  });
  expect(await mapPathToApp(mockPage, graph, "restored", [{ source: { nodeRef: "#go" } }])).toEqual({
    steps: [],
    unmapped: [{ edgeId: "e-back", reason: "visualId 無し: #go 会場 → 戻る" }],
  });

  const appPage = await context.newPage();
  await appPage.goto("http://back.local/");
  await replayOnApp(appPage, [{ kind: "back", appSel: '[data-visual-id="venue-link"]' }]);
  expect(appPage.url()).toBe("http://back.local/");
  await context.close();
});
