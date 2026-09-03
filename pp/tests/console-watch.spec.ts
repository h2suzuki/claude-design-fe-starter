import { expect, test } from "@playwright/test";
import { blocking, classify, describeFindings, isAllowed } from "../src/console-watch";
import type { ConsoleFinding } from "../src/console-watch";

test.describe("console-watch", () => {
  test("console の type を error・warning・未記録に分類する", () => {
    expect(classify({ type: "error", text: "error" })).toBe("error");
    expect(classify({ type: "warning", text: "warning" })).toBe("warning");
    expect(classify({ type: "log", text: "log" })).toBeUndefined();
    expect(classify({ type: "info", text: "info" })).toBeUndefined();
    expect(classify({ type: "debug", text: "debug" })).toBeUndefined();
  });

  test("台帳に当たる text だけを見逃す", () => {
    expect(isAllowed("known harmless output", [/harmless/])).toBe(true);
    expect(isAllowed("known harmless output", [])).toBe(false);
  });

  test("blocking は exception と error だけを返す", () => {
    const findings: ConsoleFinding[] = [
      { kind: "exception", text: "exception", where: "test" },
      { kind: "error", text: "error", where: "test" },
      { kind: "warning", text: "warning", where: "test" },
    ];

    expect(blocking(findings)).toEqual(findings.slice(0, 2));
  });

  test("describeFindings は 3 種の件数を 1 行で出す", () => {
    expect(describeFindings([])).toBe("exception 0 / error 0 / warning 0");
    expect(
      describeFindings([
        { kind: "exception", text: "exception", where: "test" },
        { kind: "error", text: "error", where: "test" },
        { kind: "error", text: "error", where: "test" },
        { kind: "warning", text: "warning", where: "test" },
        { kind: "warning", text: "warning", where: "test" },
        { kind: "warning", text: "warning", where: "test" },
      ]),
    ).toBe("exception 1 / error 2 / warning 3");
  });
});
