// 表示分岐の棚卸しは手作業だと漏れる。抽出器が「拾うべき分岐」と「拾ってはいけない非表示リテラル」を
// 両方固定して初めて棚卸しの土台になるので、陽性 5 種と陰性対照を合成 mock で押さえる
import { expect, test } from "@playwright/test";
import { extractBranches } from "../scripts/mock-branches.mjs";

const SOURCE = `<html><body><div id="slot"></div>
<script>
const el = document.querySelector("#slot");
fetch("https://api.example.com/slots");
const label = full ? "満" : "空1";
if (closed) {
  el.textContent = "受付終了";
}
el.classList.toggle("is-closed");
switch (kind) {
  case "holiday":
    break;
}
if (d.getDay() === 4) { mark(); }
</script></body></html>`;

const rows = extractBranches(SOURCE, "index.html");
const kindsOf = (text: string) => rows.filter((r) => r.text.includes(text)).map((r) => r.kind);

test("三項の両アームのリテラルを拾う", () => {
  const ternary = rows.filter((r) => r.kind === "ternary");
  expect(ternary).toHaveLength(1);
  expect(ternary[0].text).toContain("満");
  expect(ternary[0].text).toContain("空1");
  expect(ternary[0].line).toBe(5);
});

test("if の中の textContent 代入を conditional-text として拾う", () => {
  expect(kindsOf("受付終了")).toEqual(["conditional-text"]);
});

test("classList.toggle のクラス名を class-switch として拾う", () => {
  expect(kindsOf("is-closed")).toEqual(["class-switch"]);
});

test("case のリテラルを拾う", () => {
  expect(kindsOf("holiday")).toEqual(["case"]);
});

test("定数比較を fixed-logic として拾う", () => {
  const fixed = rows.filter((r) => r.kind === "fixed-logic");
  expect(fixed).toHaveLength(1);
  expect(fixed[0].text).toBe("d.getDay() === 4");
});

test("selector と URL は表示文言ではないので拾わない", () => {
  expect(rows.some((r) => r.text.includes("#slot"))).toBe(false);
  expect(rows.some((r) => r.text.includes("api.example.com"))).toBe(false);
});

test("file は渡した相対名のまま、行は元 HTML 基準", () => {
  expect(rows.every((r) => r.file === "index.html")).toBe(true);
  expect(rows.every((r) => r.line >= 2)).toBe(true);
});

// brace 無し if も分岐。無条件代入まで拾うと棚卸しが「全代入」に膨らんで使えなくなる
test("brace 無しの if は拾い、無条件の代入は拾わない", () => {
  const conditional = extractBranches('if (x) el.textContent = "受付終了";\n', "a.js");
  expect(conditional.map((r) => r.kind)).toEqual(["conditional-text"]);
  expect(extractBranches('el.textContent = "常時表示";\n', "a.js")).toHaveLength(0);
});

// URL に状態を持つ mock は「戻る」で画面が変わる。どの file が履歴を触るかは凍結時に一覧できる必要がある
test("history 操作と履歴 event を history として拾う", () => {
  const history = extractBranches('history.pushState({}, "", "#cal1");\naddEventListener("popstate", () => {});\n', "a.js");
  expect(history.map((r) => [r.kind, r.text])).toEqual([
    ["history", "pushState("],
    ["history", '"popstate"'],
  ]);
  expect(extractBranches('el.textContent = "常時表示";\n', "a.js").some((r) => r.kind === "history")).toBe(false);
});
