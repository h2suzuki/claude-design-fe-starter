// 登録点を引く規則の陽性・陰性対照。ここが緩むと、綴り違いの slug が skip に化けて
// 「回したつもりの画面」が 1 度も検証されないまま緑になる
import { expect, test } from "@playwright/test";
import { resolveScreen } from "../src/screen-registry";
import type { ScreenSpec } from "../src/screen-registry";

const blank = (entryPath: string): ScreenSpec => ({
  entryPath,
  appReadySelector: ".root[data-ready]",
  mockReadySelector: "body",
  interactions: [],
  modals: [],
  edges: [],
});

const SCREENS: Record<string, ScreenSpec> = { index: blank("/"), trial: blank("/trial") };

test.describe("resolveScreen", () => {
  test("each mock file resolves to its own registration", () => {
    expect(resolveScreen(SCREENS, "index.dc.html")?.entryPath).toBe("/");
    expect(resolveScreen(SCREENS, "trial.dc.html")?.entryPath).toBe("/trial");
  });

  test("the slug is the file name up to the first dot", () => {
    // require-no-skips の gate-not-applicable.json と同じ規則。割れると宣言が効かなくなる
    expect(resolveScreen(SCREENS, "trial.html")?.entryPath).toBe("/trial");
  });

  test("no PP_MOCK_FILE means no screen, not an error", () => {
    expect(resolveScreen(SCREENS, "")).toBeUndefined();
  });

  test("an unregistered slug is refused, not skipped", () => {
    expect(() => resolveScreen(SCREENS, "typo.dc.html")).toThrow(/typo/);
  });

  test("the refusal names what is registered", () => {
    // 「登録が無い」だけでは、綴り違いなのか登録漏れなのかが読めない
    expect(() => resolveScreen(SCREENS, "typo.dc.html")).toThrow(/index, trial/);
  });
});
