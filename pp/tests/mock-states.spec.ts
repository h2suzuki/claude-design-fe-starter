import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import {
  collectStateActions,
  exploreStates,
  fingerprintVisibleDom,
  selectorForElement,
} from "../src/mock-states";

const LIMITS = { maxDepth: 30, maxEdgesPerState: 60, maxStates: 200 };

const fixtureOpener = (
  context: BrowserContext,
  html: string,
  prepare?: (page: Page) => Promise<void>,
): (() => Promise<Page>) => async () => {
  const page = await context.newPage();
  await page.setContent(html);
  await prepare?.(page);
  return page;
};

test("fingerprint は文字と class を無視し、状態属性を区別する", async ({ page }) => {
  // 文字と装飾だけの差は同じ状態で、意味のある状態属性の差だけが別状態になる。
  await page.setContent(`<details><summary class="before">前</summary></details><button aria-expanded="false" data-state="closed">開く</button>`);
  const base = await fingerprintVisibleDom(page);
  await page.setContent(`<details><summary class="after">後</summary></details><button aria-expanded="false" data-state="closed">閉じる</button>`);
  expect(await fingerprintVisibleDom(page)).toBe(base);
  await page.setContent(`<details><summary>前</summary></details><button aria-expanded="false" data-state="open">開く</button>`);
  const dataState = await fingerprintVisibleDom(page);
  await page.setContent(`<details><summary>前</summary></details><button aria-expanded="true" data-state="closed">開く</button>`);
  const ariaExpanded = await fingerprintVisibleDom(page);
  await page.setContent(`<details open><summary>前</summary></details><button aria-expanded="false" data-state="closed">開く</button>`);
  const open = await fingerprintVisibleDom(page);
  expect([dataState, ariaExpanded, open]).not.toContain(base);
  expect(new Set([base, dataState, ariaExpanded, open])).toHaveProperty("size", 4);
});

test("候補は可視要素に絞り、入れ子では外側だけを採る", async ({ page }) => {
  // 押せない要素と内側の重複候補を除けば、一操作を複数回数えない。
  await page.setContent(`<div id="outer" style="cursor:pointer"><button id="inner">内側</button></div>
    <button id="display-none" style="display:none">不可視</button>
    <div aria-hidden="true"><button id="aria-hidden">不可視</button></div>
    <button id="plain">通常</button>`);
  const clicks = (await collectStateActions(page, "desktop", new Set())).filter(
    (candidate) => candidate.action.kind === "click" && !("backdrop" in candidate.action),
  );
  expect(clicks.map((candidate) => candidate.selector)).toEqual([
    "body > div:nth-child(1)",
    "body > button:nth-child(4)",
  ]);
});

test(":nth-child selector は同じ要素へ戻る", async ({ page }) => {
  // document 順から作る selector は再生時にも対象を一意に復元できる。
  await page.setContent(`<main><div></div><section><span></span><button id="target">選ぶ</button></section></main>`);
  const selector = await selectorForElement(page.locator("#target"));
  expect(selector).toBe("body > main:nth-child(1) > section:nth-child(2) > button:nth-child(2)");
  expect(await page.locator(selector).getAttribute("id")).toBe("target");
});

test("dialog の開閉を辺にし、反応しない click は捨てる", async ({ browser }) => {
  // 構造が変わる操作だけを辺にして Escape で root へ戻るループを保存する。
  const context = await browser.newContext();
  const html = `<button id="open">開く</button><button id="noop">何もしない</button>
    <dialog id="dialog"><p>内容</p></dialog>
    <script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`;
  const result = await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: LIMITS,
    siteFiles: new Set(),
  });
  expect(Object.keys(result.states)).toHaveLength(2);
  expect(result.edges.map((edge) => [edge.action.kind, edge.from, edge.to])).toEqual([
    ["click", "root", expect.stringMatching(/^s-[0-9a-f]{8}$/)],
    ["key", expect.stringMatching(/^s-[0-9a-f]{8}$/), "root"],
  ]);
  expect(result.unchanged).toBeGreaterThanOrEqual(1);
  await context.close();
});

test("深さ上限で安全に探索を止める", async ({ browser }) => {
  // 終わらない状態追加でも指定深さまでで止まり、上限到達を診断として返す。
  const context = await browser.newContext();
  const html = `<button id="append">追加</button><main></main>
    <script>document.querySelector('#append').onclick=()=>document.querySelector('main').append(document.createElement('span'))</script>`;
  const result = await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: { ...LIMITS, maxDepth: 3 },
    siteFiles: new Set(),
  });
  expect(Object.values(result.states).map((state) => state.depth).sort()).toEqual([0, 1, 2, 3]);
  expect(result.boundsHit).toContain("depth");
  await context.close();
});

test("export 内リンクと外部リンクは遷移せず分類する", async ({ browser }) => {
  // 別画面と外部サイトへのリンクは click の副作用を起こさず行き先だけを辺に残す。
  const context = await browser.newContext();
  const html = `<base href="http://mock.local/root.html"><a id="site" href="other.html">別画面</a>
    <a id="external" href="https://example.com/path">外部</a>`;
  const result = await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: LIMITS,
    siteFiles: new Set(["root.html", "other.html"]),
  });
  expect(result.edges.map((edge) => edge.action)).toEqual([
    { kind: "navigate", selector: "body > a:nth-child(1)", file: "other.html" },
    { kind: "external", selector: "body > a:nth-child(2)", url: "https://example.com/path" },
  ]);
  expect(Object.keys(result.states)).toEqual(["root"]);
  await context.close();
});
