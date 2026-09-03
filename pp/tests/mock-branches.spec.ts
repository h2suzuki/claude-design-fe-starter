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

// 変数どうしの比較は定数比較 regex に掛からず、実測で 13 分岐中 4 件を取り落とした
test("変数どうしの比較を comparison として拾う", () => {
  const rows = extractBranches("const future = new Date(y, m, d).getTime() > cutoff;\n", "a.js");
  expect(rows.map((r) => r.kind)).toEqual(["comparison"]);
  expect(rows[0].text).toBe("new Date(y, m, d).getTime() > cutoff");
});

test("ループ境界の比較は comparison にしない", () => {
  const rows = extractBranches("for (let i = 0; i < n; i++) { paint(i); }\n", "a.js");
  expect(rows.some((r) => r.kind === "comparison")).toBe(false);
});

test("補間つき template literal を template-text として拾う", () => {
  const rows = extractBranches("const msg = `${name}のためお休み`;\n", "a.js");
  expect(rows.map((r) => [r.kind, r.text])).toEqual([["template-text", "${…}のためお休み"]]);
});

test("object property の文字列連結も template-text として拾う", () => {
  const rows = extractBranches("const o = { closedLabel: hol + 'のためお休み' };\n", "a.js");
  expect(rows.map((r) => [r.kind, r.text])).toEqual([["template-text", "…のためお休み"]]);
});

test("selector と URL は連結でも template-text にしない", () => {
  const rows = extractBranches("const e = document.querySelector('#x');\nconst u = base + '/api/slots';\n", "a.js");
  expect(rows.some((r) => r.kind === "template-text")).toBe(false);
});

// `) % 3` だけでは何の剰余か読めず、backend 経路との突き合わせに使えない
test("fixed-logic は囲みの式まで広げて出す", () => {
  const rows = extractBranches("const bucket = _hash(key) % 3;\nif ((hash(d) + i) % 3 === 0) { paint(); }\n", "a.js");
  expect(rows.filter((r) => r.kind === "fixed-logic").map((r) => r.text)).toEqual([
    "_hash(key) % 3",
    "(hash(d) + i) % 3 === 0",
  ]);
});
