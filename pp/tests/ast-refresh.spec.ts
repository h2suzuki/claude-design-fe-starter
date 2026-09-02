// 再凍結後に AST を追従させる道具の純関数部分。台帳の読み取りを誤ると別 mock を正として書き戻し、
// props の走査を誤ると「文言が古いまま」の検出が丸ごと沈黙する
import { expect, test } from "@playwright/test";
import { collectNodes, mockEntryFile, parseBaseline, propStrings } from "../src/ast-refresh";
import { overlayTargets } from "../src/state-walk";

test.describe("parseBaseline", () => {
  test("maps every listed path to its hash", () => {
    const hashes = parseBaseline(`${"a".repeat(64)}  export/index.dc.html\n${"b".repeat(64)}  export/support.js\n`);
    expect(hashes.get("export/index.dc.html")).toBe("a".repeat(64));
    expect(hashes.get("export/support.js")).toBe("b".repeat(64));
  });

  test("the binary-mode marker is not part of the path", () => {
    // sha256sum は binary mode で ` *path` と書く。剥がさないと台帳の全 path が引けなくなる
    expect(parseBaseline(`${"c".repeat(64)} *export/logo.png\n`).get("export/logo.png")).toBe("c".repeat(64));
  });

  test("blank and malformed lines are skipped", () => {
    expect(parseBaseline(`\nnot a checksum line\n${"d".repeat(64)}  export/a.html\n`).size).toBe(1);
  });

  test("a path containing spaces survives", () => {
    expect(parseBaseline(`${"e".repeat(64)}  export/two words.png\n`).get("export/two words.png")).toBe("e".repeat(64));
  });
});

test.describe("collectNodes", () => {
  test("every descendant is visited", () => {
    const tree = [{ id: "a", children: [{ id: "b", children: [{ id: "c" }] }] }, { id: "d" }];
    expect(collectNodes(tree).map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("non-object entries are dropped rather than crashing the walk", () => {
    expect(collectNodes([null, "x", { id: "a" }]).map((n) => n.id)).toEqual(["a"]);
  });

  test("a missing children array is not an error", () => {
    expect(collectNodes(undefined)).toEqual([]);
  });
});

test.describe("propStrings", () => {
  test("plain string props are reported with their path", () => {
    expect(propStrings({ label: "送信" })).toEqual([{ pathName: "props.label", value: "送信" }]);
  });

  test("keys that never reach textContent are skipped", () => {
    // href や src は属性であって表示文言ではない。拾うと毎回「文言が合わない」と鳴り続ける
    expect(propStrings({ href: "/a", src: "/b.png", label: "見る" })).toEqual([
      { pathName: "props.label", value: "見る" },
    ]);
  });

  test("array items keep their index in the path", () => {
    expect(propStrings({ items: ["一", "二"] })).toEqual([
      { pathName: "props.items[0]", value: "一" },
      { pathName: "props.items[1]", value: "二" },
    ]);
  });

  test("nested objects are walked and their own keys gate the skip", () => {
    expect(propStrings({ cta: { label: "申込", href: "/x" } })).toEqual([
      { pathName: "props.cta.label", value: "申込" },
    ]);
  });

  test("non-string leaves are ignored", () => {
    expect(propStrings({ count: 3, open: true, label: "字" })).toEqual([
      { pathName: "props.label", value: "字" },
    ]);
  });
});

test.describe("mockEntryFile", () => {
  test("the export/ prefix is dropped because the mock server serves that directory as its root", () => {
    expect(mockEntryFile("export/index.dc.html")).toBe("index.dc.html");
  });

  test("a path that is already relative is left alone", () => {
    expect(mockEntryFile("index.dc.html")).toBe("index.dc.html");
  });
});

test.describe("overlayTargets", () => {
  test("overlay 配下の nodeRef 付き node だけを返す", () => {
    const screen = {
      children: [{ id: "base", source: { nodeRef: "#base" } }],
      overlays: [
        { id: "dialog", source: { nodeRef: "#dialog" }, children: [{ id: "title", source: { nodeRef: "#title" } }] },
        { id: "without-ref", source: { kind: "mock" } },
      ],
    };

    expect(overlayTargets(screen)).toEqual([
      { nodeId: "dialog", nodeRef: "#dialog" },
      { nodeId: "title", nodeRef: "#title" },
    ]);
  });
});
