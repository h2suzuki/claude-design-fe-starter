// 検査器自身の陽性・陰性対照。凍結前の mock 検査は「破れを持つ mock で落ちる」ことが証明されて初めて
// 意味を持つので、5 種の破れをそれぞれ合成 mock で踏ませ、健全な mock では 0 件であることを固定する
import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MOBILE_CONTEXT_OPTIONS } from "../src/config";
import { readReferencePages, screenSlug } from "../src/mock-screens";
import {
  blockingFindings,
  coveredFindings,
  dialogFindings,
  findCoveredControls,
  findUnfitDialogs,
  measureWidth,
  radiusFindings,
  readRadii,
  readVocabulary,
  resolveRadiusScale,
  vocabularyFindings,
  widthFindings,
} from "../src/mock-integrity";
import type { Page } from "@playwright/test";

const WIDTH = 360;
const page360 = { ...MOBILE_CONTEXT_OPTIONS, viewport: { width: WIDTH, height: 640 }, deviceScaleFactor: 1 };

const CLEAN = `<style>:root{--brand:#123456}</style>
<header><a href="/">ホーム</a><a href="/trial">体験</a></header>
<main><button id="go">送る</button></main>`;

// 固定寸法が viewport を超えると document が横に伸びる（適用先が実際に踏んだ形）
const OVERFLOW = `<div id="wide" style="width:600px;height:40px;background:#eee">はみ出す帯</div>`;

// footer が面で覆って click を遮る（position:fixed + 全面）
const COVERED = `<main style="height:2000px"><button id="go">送る</button></main>
<div id="veil" style="position:fixed;inset:0;background:rgba(0,0,0,.2)"></div>`;

// モーダルが viewport からこぼれる
const UNFIT_DIALOG = `<div role="dialog" id="modal" style="position:fixed;left:0;top:0;width:${WIDTH + 12}px;height:100px">カレンダー</div>`;

// viewport meta が無いと mobile emulation は 980px の既定 layout viewport を使う。
// 実 mock は必ず持っているので、合成側も持たせないと全 fixture が横スクロール扱いになる
const open = async (page: Page, body: string): Promise<void> => {
  await page.setContent(
    `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`,
  );
};

test.describe("mock-integrity — 幅とはみ出し", () => {
  test("健全な mock は 0 件", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, CLEAN);
    expect(widthFindings("clean", WIDTH, await measureWidth(page))).toEqual([]);
    await context.close();
  });

  test("横スクロールする mock は MOCK201 と、原因の要素を MOCK202 で挙げる", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, OVERFLOW);
    const findings = widthFindings("overflow", WIDTH, await measureWidth(page));
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK201", "MOCK202"]);
    expect(findings[1]!.detail).toContain("wide");
    await context.close();
  });

  test("挙げるのははみ出しが始まる境目だけで、中身は並べない", async ({ browser }) => {
    // 器の幅は子へ伝わるので、子まで並べると原因が件数に埋もれる
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, `<section><div id="wide" style="width:600px"><p id="inner">中身</p></div></section>`);
    const findings = widthFindings("nested", WIDTH, await measureWidth(page));
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK201", "MOCK202"]);
    expect(findings[1]!.detail).toContain("wide");
    expect(findings[1]!.detail).not.toContain("inner");
    await context.close();
  });

  test("横スクロールが無ければ要素のはみ出しは挙げない", async ({ browser }) => {
    // overflow:hidden の中で意図的に外へ出る装飾まで赤にすると、検査が使われなくなる
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, `<div style="overflow:hidden;width:100%">${OVERFLOW}</div>`);
    expect(widthFindings("decorated", WIDTH, await measureWidth(page))).toEqual([]);
    await context.close();
  });
});

test.describe("mock-integrity — 重なり", () => {
  test("覆われていない操作要素は 0 件", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, CLEAN);
    expect(coveredFindings("clean", "mobile", await findCoveredControls(page))).toEqual([]);
    await context.close();
  });

  test("面で覆われた操作要素は MOCK203 で、覆っている側も名指しする", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, COVERED);
    const findings = coveredFindings("covered", "mobile", await findCoveredControls(page));
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK203"]);
    expect(findings[0]!.detail).toContain("veil");
    await context.close();
  });
});

test.describe("mock-integrity — dialog の収まり", () => {
  test("収まる dialog は 0 件", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, `<div role="dialog" id="ok" style="position:fixed;left:0;top:0;width:200px;height:100px">中身</div>`);
    expect(dialogFindings("clean", "mobile", await findUnfitDialogs(page))).toEqual([]);
    await context.close();
  });

  test("隠れている dialog も現して測り、はみ出せば MOCK205", async ({ browser }) => {
    // 開かないと現れない mock を「dialog が無い」と数えると、モーダルの破れが素通りする
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, UNFIT_DIALOG.replace("position:fixed", "display:none;position:fixed"));
    const findings = dialogFindings("unfit", "mobile", await findUnfitDialogs(page));
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK205"]);
    expect(findings[0]!.detail).toContain("12px 超過");
    await context.close();
  });

  test("測ったあとは元の見え方へ戻す", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, UNFIT_DIALOG.replace("position:fixed", "display:none;position:fixed"));
    await findUnfitDialogs(page);
    expect(await page.locator("#modal").isVisible()).toBe(false);
    await context.close();
  });
});

test.describe("mock-integrity — 画面間の割れ", () => {
  const vocabularyOf = async (browser: import("@playwright/test").Browser, body: string) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(page, body);
    const vocabulary = await readVocabulary(page);
    await context.close();
    return vocabulary;
  };

  test("同じ href と token を持つ 2 画面は 0 件", async ({ browser }) => {
    const a = await vocabularyOf(browser, CLEAN);
    const b = await vocabularyOf(browser, CLEAN);
    expect(vocabularyFindings({ a, b })).toEqual([]);
  });

  test("同じ href の文言が違えば MOCK204", async ({ browser }) => {
    const a = await vocabularyOf(browser, CLEAN);
    const b = await vocabularyOf(browser, CLEAN.replace("体験", "体験稽古"));
    const findings = vocabularyFindings({ a, b });
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK204"]);
    expect(findings[0]!.detail).toContain("/trial");
  });

  test("本文中のリンクは突き合わせない", async ({ browser }) => {
    // 同じ先を指していても、本文のリンクは文脈で言い方が変わってよい
    const body = `${CLEAN}<main><a href="/hall">施設案内</a></main>`;
    const a = await vocabularyOf(browser, body);
    const b = await vocabularyOf(browser, body.replace(">施設案内<", ">麹町集会室<"));
    expect(vocabularyFindings({ a, b })).toEqual([]);
  });

  test("見本帳として宣言した画面は、リンク文言の突合から外れる", async ({ browser }) => {
    // 見本帳は site の導線を持たない。仕様書から本体へ戻るリンクを画面の導線として比べない
    const a = await vocabularyOf(browser, CLEAN);
    const sample = await vocabularyOf(browser, CLEAN.replace(">ホーム<", ">サイトを見る →<"));
    expect(vocabularyFindings({ a, sample }, ["sample"])).toEqual([]);
  });

  test("見本帳でも token の割れは落とす", async ({ browser }) => {
    // 見本は token 名の母体だが値の正本ではない。割れたら見本側の生成ぶれを疑う
    const a = await vocabularyOf(browser, CLEAN);
    const sample = await vocabularyOf(browser, CLEAN.replace("#123456", "#123457"));
    const findings = vocabularyFindings({ a, sample }, ["sample"]);
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK204"]);
    expect(findings[0]!.detail).toContain("--brand");
  });

  test("宣言が無ければ見本帳も画面として突き合わせる", async ({ browser }) => {
    const a = await vocabularyOf(browser, CLEAN);
    const sample = await vocabularyOf(browser, CLEAN.replace(">ホーム<", ">サイトを見る →<"));
    expect(vocabularyFindings({ a, sample }).map((finding) => finding.id)).toEqual(["MOCK204"]);
  });

  test("同じ token の値が違えば MOCK204", async ({ browser }) => {
    const a = await vocabularyOf(browser, CLEAN);
    const b = await vocabularyOf(browser, CLEAN.replace("#123456", "#123457"));
    const findings = vocabularyFindings({ a, b });
    expect(findings.map((finding) => finding.id)).toEqual(["MOCK204"]);
    expect(findings[0]!.detail).toContain("--brand");
  });

  // 両側に同じ値を置く test は、この継ぎ目のずれを原理的に捕まえられない。
  // script と同じ経路（file 名で宣言 → slug を key にした vocabularies）を通して初めて出る
  test("file 名で宣言した見本帳が、slug を key にした突合から外れる", async ({ browser }) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "pp-seam-"));
    const screens = ["index.dc.html", "design-system.dc.html"];
    for (const file of screens) writeFileSync(path.join(dir, file), "");
    const declaration = path.join(dir, "reference-pages.json");
    writeFileSync(declaration, JSON.stringify({ version: "1", pages: ["design-system.dc.html"] }));

    const site = await vocabularyOf(browser, CLEAN);
    const sample = await vocabularyOf(browser, CLEAN.replace(">ホーム<", ">サイトを見る →<"));
    const vocabularies = Object.fromEntries(
      screens.map((file, index) => [screenSlug(file), index === 0 ? site : sample]),
    );
    expect(vocabularyFindings(vocabularies, readReferencePages(declaration, screens))).toEqual([]);
  });
});

test.describe("mock-integrity — 凍結を止めるのはどれか", () => {
  const finding = (id: string) => ({ id, screen: "s", detail: "d" });

  test("機械が壊れと断定できるものだけが凍結を止める", () => {
    // 横スクロール・はみ出し・覆われた操作要素・収まらない dialog は、見れば壊れている
    const defects = ["MOCK201", "MOCK202", "MOCK203", "MOCK205"].map(finding);
    expect(blockingFindings(defects)).toEqual(defects);
  });

  test("文言や token の割れは凍結を止めない", () => {
    // 統一すると見た目や読みやすさが壊れることがある。直すかは読んだ人が決める
    expect(blockingFindings([finding("MOCK204")])).toEqual([]);
  });

  test("割れだけの mock は通り、壊れが 1 つでも混じれば止まる", () => {
    expect(blockingFindings([finding("MOCK204"), finding("MOCK204")])).toEqual([]);
    expect(blockingFindings([finding("MOCK204"), finding("MOCK201")])).toEqual([finding("MOCK201")]);
  });
});

test.describe("mock-integrity — design system の角丸", () => {
  test("可視要素ごとに 0 以外の角丸を数える", async ({ browser }) => {
    const context = await browser.newContext(page360);
    const page = await context.newPage();
    await open(
      page,
      `<div style="border-radius:14px"></div><div style="border-radius:14px"></div>
      <div style="border-radius:22px"></div><div style="display:none;border-radius:9px"></div>
      <div style="display:none"><div style="border-radius:11px"></div></div>`,
    );
    expect(await readRadii(page)).toEqual({ "14": 2, "22": 1 });
    await context.close();
  });

  test("宣言に無い角丸だけを数値順で挙げ、見本 page は対象外にする", () => {
    const findings = radiusFindings(
      { index: { "9": 3, "14": 5, "18": 2 }, sample: { "6": 1 } },
      new Set(["14", "22", "28", "999"]),
      ["sample"],
    );
    expect(findings).toEqual([
      { id: "MOCK206", screen: "index", detail: "角丸 9px が design system に無い（3 箇所）" },
      { id: "MOCK206", screen: "index", detail: "角丸 18px が design system に無い（2 箇所）" },
    ]);
  });

  test("宣言に無い角丸は凍結を止めない", () => {
    expect(blockingFindings([{ id: "MOCK206", screen: "index", detail: "角丸 9px" }])).toEqual([]);
  });

  test("宣言があればその値を使い、無ければ見本 page の使用値を使う", () => {
    const referenceRadii = { sample: { "14": 2, "22": 1 } };
    expect([...resolveRadiusScale('{"version":"1","radius":[28,999,"50%"]}', referenceRadii)]).toEqual([
      "28",
      "999",
      "50%",
    ]);
    expect([...resolveRadiusScale(null, referenceRadii)]).toEqual(["14", "22"]);
  });
});
