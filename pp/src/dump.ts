// 対象要素ごとの getComputedStyle（+ ::before/::after）と、共有 anchor 相対の boundingBox を dump する。
// mock と app は外側 chrome が違うため viewport 絶対座標は比較せず、anchor 相対の box だけを比べる
import type { Page } from "@playwright/test";

export interface Rect { x: number; y: number; width: number; height: number }

export interface ElementDump {
  found: boolean;
  matchCount: number; // 1 以外は selector-map の登録ミス（0 = MISS、>1 = 曖昧）
  style: Record<string, string>;
  beforeStyle: Record<string, string>;
  afterStyle: Record<string, string>;
  rect: Rect | null; // anchor の左上相対。要素か anchor が無ければ null
}

export interface DumpResult {
  anchorFound: boolean;
  elements: Record<string, ElementDump>;
}

interface StyleArg { allowlist: string[]; pseudo?: string }

// Locator.evaluate は callback を toString() で page 内へ移植する — 自由変数を持たない自己完結関数に保つ
function dumpStyleInPage(el: Element, arg: StyleArg): Record<string, string> {
  const cs = getComputedStyle(el, arg.pseudo);
  const out: Record<string, string> = {};
  for (const prop of arg.allowlist) {
    out[prop] = (cs as unknown as Record<string, string | undefined>)[prop] ?? "";
  }
  return out;
}

// selector 解決は Playwright の Locator 経由に限る — mock 側 selector の :text-is()/:nth-match() は
// ブラウザ native の querySelectorAll では SyntaxError になる
export async function dumpVisualIds(
  page: Page,
  selectors: Record<string, string>,
  anchorSelector: string,
  allowlist: readonly string[],
): Promise<DumpResult> {
  const allowlistArr = Array.from(allowlist);
  const anchorLocator = page.locator(anchorSelector);
  const anchorFound = (await anchorLocator.count()) === 1;
  const anchorBox = anchorFound ? await anchorLocator.boundingBox() : null;

  const elements: Record<string, ElementDump> = {};
  for (const [visualId, sel] of Object.entries(selectors)) {
    const locator = page.locator(sel);
    const matchCount = await locator.count();
    if (matchCount !== 1) {
      elements[visualId] = { found: false, matchCount, style: {}, beforeStyle: {}, afterStyle: {}, rect: null };
      continue;
    }
    const [style, beforeStyle, afterStyle, box] = await Promise.all([
      locator.evaluate(dumpStyleInPage, { allowlist: allowlistArr }),
      locator.evaluate(dumpStyleInPage, { allowlist: allowlistArr, pseudo: "::before" }),
      locator.evaluate(dumpStyleInPage, { allowlist: allowlistArr, pseudo: "::after" }),
      locator.boundingBox(),
    ]);
    // anchor 不在時も絶対座標を残す（診断用）。比較としては無意味なので writeRunSummary が anchorFound で run を落とす
    const rect =
      box == null
        ? null
        : anchorBox
          ? { x: box.x - anchorBox.x, y: box.y - anchorBox.y, width: box.width, height: box.height }
          : { x: box.x, y: box.y, width: box.width, height: box.height };
    elements[visualId] = { found: true, matchCount, style, beforeStyle, afterStyle, rect };
  }
  return { anchorFound, elements };
}
