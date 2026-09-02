import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FrozenStateGraph } from "../src/state-walk";
import { loadStateGraph, replayTo, statesInOrder, walkStatesForTargets } from "../src/state-walk";

test("凍結した viewport の状態グラフを読み、file が無ければ null を返す", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pp-state-walk-"));
  const graph = {
    states: { root: { depth: 0, path: [], fingerprint: "root", screenshot: null } },
    edges: [],
  };
  writeFileSync(
    path.join(dir, "index.json"),
    JSON.stringify({ version: "1", file: "index.html", viewports: { mobile: graph, desktop: graph } }),
  );

  expect(loadStateGraph(dir, "index", "desktop")).toEqual(graph);
  expect(loadStateGraph(dir, "missing", "desktop")).toBeNull();
});

test("状態は depth、同じ depth では id の順に並び root が先頭になる", () => {
  const graph: FrozenStateGraph = {
    states: {
      z: { depth: 1, path: ["e1"], fingerprint: "z", screenshot: null },
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      b: { depth: 2, path: ["e1", "e3"], fingerprint: "b", screenshot: null },
      a: { depth: 1, path: ["e2"], fingerprint: "a", screenshot: null },
    },
    edges: [],
  };

  expect(statesInOrder(graph)).toEqual(["root", "a", "z", "b"]);
});

test("辺列を再生して dialog 内の状態へ到達する", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route("http://fixture.local/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button id="open">開く</button><dialog><button id="advance">進む</button></dialog>
        <script>
          document.querySelector("#open").onclick = () => document.querySelector("dialog").showModal();
          document.querySelector("#advance").onclick = () => document.querySelector("dialog").dataset.state = "done";
        </script>`,
    }),
  );
  const page = await context.newPage();
  await page.goto("http://fixture.local/");
  const graph: FrozenStateGraph = {
    states: {
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      open: { depth: 1, path: ["e1"], fingerprint: "open", screenshot: null },
      done: { depth: 2, path: ["e1", "e2"], fingerprint: "done", screenshot: null },
    },
    edges: [
      { id: "e1", from: "root", to: "open", action: { kind: "click", selector: "#open" }, label: "開く" },
      { id: "e2", from: "open", to: "done", action: { kind: "click", selector: "#advance" }, label: "進む" },
    ],
  };

  await replayTo(page, graph, "done");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.locator('dialog[data-state="done"]')).toHaveCount(1);
  await context.close();
});

// overlay の node は開いた状態でしか測れない。どの状態で初めて見えたかを記録し、見えなかった node は残す
test("状態を順に開き、対象が初めて見える状態を記録する", async ({ browser }) => {
  const context = await browser.newContext();
  await context.route("http://fixture.local/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<button id="open">開く</button><dialog><p id="inside">中身</p></dialog>
        <script>document.querySelector("#open").onclick = () => document.querySelector("dialog").showModal();</script>`,
    }),
  );
  const graph: FrozenStateGraph = {
    states: {
      root: { depth: 0, path: [], fingerprint: "root", screenshot: null },
      open: { depth: 1, path: ["e1"], fingerprint: "open", screenshot: null },
    },
    edges: [{ id: "e1", from: "root", to: "open", action: { kind: "click", selector: "#open" }, label: "開く" }],
  };
  const pending = new Map([
    ["inside", { nodeRef: "#inside" }],
    ["never", { nodeRef: "#missing" }],
  ]);
  const seen: string[] = [];
  const opened: string[] = [];
  await walkStatesForTargets(graph, pending, {
    openPage: async () => {
      const page = await context.newPage();
      await page.goto("http://fixture.local/");
      return page;
    },
    probe: (page, nodeRef) => page.evaluate((sel) => document.querySelector(sel)?.getClientRects().length ? 1 : null, nodeRef),
    found: (id, _entry, stateId) => {
      seen.push(`${id}@${stateId}`);
    },
    onState: (stateId) => opened.push(stateId),
  });

  expect(seen).toEqual(["inside@open"]);
  expect([...pending.keys()]).toEqual(["never"]);
  expect(opened).toEqual(["root", "open"]);
  await context.close();
});
