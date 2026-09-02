import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import type { AstNode } from "../src/ast-screen";
import { mapPathToApp, replayOnApp } from "../src/state-parity";
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
