import { expect, test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { collectStateActions, exploreStates, fingerprintVisibleDom, isolateStorage } from "../src/mock-states";

const clickCandidates = async (page: Page): Promise<{ selector: string | null; label: string }[]> =>
  (await collectStateActions(page, "desktop", new Set())).candidates
    .filter((candidate) => candidate.action.kind === "click" && !("backdrop" in candidate.action))
    .map((candidate) => ({
      selector: candidate.action.kind === "click" ? candidate.action.selector : null,
      label: candidate.label,
    }));

const LIMITS = { maxDepth: 30, maxEdgesPerState: 60, maxStates: 200, maxSeconds: 600 };

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
  const clicks = await clickCandidates(page);
  expect(clicks.map((candidate) => candidate.selector)).toEqual([
    "body > div:nth-child(1)",
    "body > button:nth-child(4)",
  ]);
});

test(":nth-child selector は同じ要素へ戻る", async ({ page }) => {
  // document 順から作る selector は再生時にも対象を一意に復元できる。
  await page.setContent(`<main><div></div><section><span></span><button id="target">選ぶ</button></section></main>`);
  const selector = (await clickCandidates(page))[0]?.selector ?? "";
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

test("探索の副作用が storage に残っても、開き直した root は同じ形に戻る", async ({ browser }) => {
  // mock が localStorage に書く（下書き保存・予約）と、同じ context の再生が初期状態を再現できない。
  const context = await browser.newContext();
  const html = `<button id="save">保存</button><main></main>
    <script>
      const n = Number(localStorage.getItem("n") ?? 0);
      for (let i = 0; i < n; i++) document.querySelector("main").append(document.createElement("span"));
      document.querySelector("#save").onclick = () => {
        localStorage.setItem("n", String(n + 1));
        if (!document.querySelector("main span")) document.querySelector("main").append(document.createElement("span"));
      };
    </script>`;
  await context.route("http://fixture.local/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await isolateStorage(context);
  const open = async () => {
    const page = await context.newPage();
    await page.goto("http://fixture.local/");
    return page;
  };
  const result = await exploreStates({ open, viewport: "desktop", limits: LIMITS, siteFiles: new Set() });
  expect(result.replayFailures).toEqual([]);
  expect(Object.keys(result.states)).toHaveLength(2);
  await context.close();
});

test("同じ親の同種 click 候補が 4 つ以上なら先頭と末尾に代表化する", async ({ browser }) => {
  // 同種の反復候補を端の二例に絞りつつ、別 role の少数候補はすべて残す。
  const context = await browser.newContext();
  const html = `<main>${Array.from({ length: 6 }, (_, index) => `<button data-index="${index}">${index}</button>`).join("")}</main>
    <nav><button role="tab">前</button><button role="tab">後</button></nav>
    <script>document.querySelectorAll('button').forEach((button) => button.onclick=()=>button.parentElement.dataset.state=button.dataset.index ?? button.textContent)</script>`;
  const page = await fixtureOpener(context, html)();
  const clicks = await clickCandidates(page);
  expect(clicks.map((candidate) => candidate.label)).toEqual(["0", "5", "前", "後"]);
  await page.close();
  const result = await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: { ...LIMITS, maxDepth: 0 },
    siteFiles: new Set(),
  });
  expect(result.sampled).toBe(4);
  await context.close();
});

test("同じ親の同種 click 候補が 3 つ以下ならすべて残す", async ({ page }) => {
  // 少数のタブや月送りを代表化で失わない。
  await page.setContent(`<main><button>1</button><button>2</button><button>3</button></main>`);
  const clicks = await clickCandidates(page);
  expect(clicks.map((candidate) => candidate.label)).toEqual(["1", "2", "3"]);
});

test("時間上限で取得済みの root を残して探索を止める", async ({ browser }) => {
  // 壁時計の上限は失敗にせず、取得済みのグラフと診断を返す。
  const context = await browser.newContext();
  const html = `<button id="append">追加</button><main></main>
    <script>document.querySelector('#append').onclick=()=>document.querySelector('main').append(document.createElement('span'))</script>`;
  const result = await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: { ...LIMITS, maxSeconds: 0 },
    siteFiles: new Set(),
  });
  expect(result.boundsHit).toContain("time");
  expect(Object.keys(result.states)).toContain("root");
  await context.close();
});

test("状態の展開を進行 log へ逐次通知する", async ({ browser }) => {
  // 呼び出し元が root と到達状態の進行を処理中に観測できる。
  const context = await browser.newContext();
  const html = `<button id="open">開く</button><dialog id="dialog"><p>内容</p></dialog>
    <script>document.querySelector('#open').onclick=()=>document.querySelector('#dialog').showModal()</script>`;
  const lines: string[] = [];
  await exploreStates({
    open: fixtureOpener(context, html),
    viewport: "desktop",
    limits: LIMITS,
    siteFiles: new Set(),
    onProgress: (line) => lines.push(line),
  });
  expect(lines).toEqual(expect.arrayContaining([expect.stringMatching(/^展開 root/), expect.stringMatching(/^展開 s-/)]));
  await context.close();
});

test("文字の無い icon button は aria-label か title を辺の label にする", async ({ page }) => {
  // 月送りのような icon だけの button でも、人が辺を読めるように名前を残す。
  await page.setContent(`<button aria-label="前月"><svg></svg></button><button title="翌月"><svg></svg></button><button>次へ</button>`);
  const clicks = await clickCandidates(page);
  expect(clicks.map((candidate) => candidate.label)).toEqual(["前月", "翌月", "次へ"]);
});
