// overlay 配下の visual id は操作後にしか DOM に無い。基準幅 test がそれを MISS として落とすと、
// 消去法で overlay に visual id を付けられなくなる
import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deriveSelectorMap } from "../src/ast-selector-map";

const screensDirWith = (screen: unknown): string => {
  const dir = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "pp-screens-"));
  writeFileSync(path.join(dir, "sample.ui-ast.json"), JSON.stringify({ screen }));
  return dir;
};

const SCREEN = {
  provenance: { mockFile: "export/index.dc.html" },
  children: [
    { source: { nodeRef: "#head" }, binding: { visualId: "head" } },
    { source: { nodeRef: "#toast", state: "toast-visible" }, binding: { visualId: "toast" } },
  ],
  overlays: [{ source: { nodeRef: "#dialog" }, binding: { visualId: "dialog" } }],
};

test("overlay の対も pairs に載る", () => {
  expect(deriveSelectorMap(screensDirWith(SCREEN), "index.dc.html").pairs).toEqual({
    head: { mockSel: "#head", appSel: '[data-visual-id="head"]' },
    toast: { mockSel: "#toast", appSel: '[data-visual-id="toast"]' },
    dialog: { mockSel: "#dialog", appSel: '[data-visual-id="dialog"]' },
  });
});

test("overlay 配下と source.state 付きだけを state 限定として返す", () => {
  expect([...deriveSelectorMap(screensDirWith(SCREEN), "index.dc.html").stateOnly].sort()).toEqual(["dialog", "toast"]);
});
