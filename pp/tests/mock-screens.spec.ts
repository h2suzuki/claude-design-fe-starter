// 参照スクショの撮り漏れは「対象の列挙」で起きる。引数で渡した画面だけ撮る道具は、
// 渡し忘れた画面を黙って落とす — 既定が export 全画面であることをここで固定する
import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { listMockScreens } from "../src/mock-screens";

function fixtureExport(files: readonly string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pp-mock-screens-"));
  for (const file of files) {
    mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(dir, file), "");
  }
  return dir;
}

test.describe("mock-screens — target enumeration", () => {
  test("with no arguments every exported page is a target", () => {
    const dir = fixtureExport(["index.dc.html", "club.dc.html", "design-system.dc.html"]);
    expect(listMockScreens(dir, [])).toEqual(["club.dc.html", "design-system.dc.html", "index.dc.html"]);
  });

  test("shared assets are not pages", () => {
    const dir = fixtureExport(["index.dc.html", "support.js", "style.css", "logo.png", "font.woff2"]);
    expect(listMockScreens(dir, [])).toEqual(["index.dc.html"]);
  });

  test("pages in subdirectories are targets too", () => {
    const dir = fixtureExport(["index.dc.html", "pages/club.dc.html"]);
    expect(listMockScreens(dir, [])).toEqual(["index.dc.html", "pages/club.dc.html"]);
  });

  test("explicit arguments narrow the run to those pages", () => {
    const dir = fixtureExport(["index.dc.html", "club.dc.html"]);
    expect(listMockScreens(dir, ["club.dc.html"])).toEqual(["club.dc.html"]);
  });

  test("an argument that is not in the export is refused", () => {
    const dir = fixtureExport(["index.dc.html"]);
    expect(() => listMockScreens(dir, ["missing.dc.html"])).toThrow(/missing\.dc\.html/);
  });

  test("an empty export yields no targets", () => {
    expect(listMockScreens(fixtureExport([]), [])).toEqual([]);
  });
});
