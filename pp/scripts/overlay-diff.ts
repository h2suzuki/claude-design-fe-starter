// 全画面オーバーレイ + 文言キー突合。SELECTOR_MAP に載せた id しか見ない parity と違い、
// 載せ忘れた箇所のズレも面で見える補完診断。SELECTOR_MAP が空の walking-skeleton 序盤から使える。
// Usage: PP_MOCK_FILE=<export 内 file> PP_APP_URL=<dev server> npm run overlay-diff
// 出力: artifacts/overlay/ に 3 PNG（mock 単体 / app 単体 / 重ね合わせ）+ 文言突合の md × screen × viewport
import { chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import {
  APP_CONFIGURED,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  MOCK_CONFIGURED,
  MOCK_ENTRY_FILE,
  PP_LAUNCH_OPTIONS,
} from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";
import { openApp } from "../src/targets/app-target";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "overlay");

interface Screen {
  name: string;
  mockFile: string;
  appPath: string;
  /** 対象画面まで運ぶ操作（既定画面なら不要）。mock/app 両側に同じ操作を適用する */
  navigate?: (page: Page) => Promise<void>;
}

// 画面が増えたらここへ追加する（差し替え点）
const SCREENS: Screen[] = [{ name: "main", mockFile: MOCK_ENTRY_FILE, appPath: "/" }];

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

async function shoot(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.screenshot({ type: "png" }));
}

interface TextBox {
  text: string;
  tag: string;
  font: string;
  size: string;
  weight: string;
  tracking: string;
  leading: string;
  color: string;
  w: number;
  h: number;
  x: number;
  y: number;
  /** 文字そのものの外接矩形。箱が同じでも中で字がずれる差はここにしか出ない */
  inkX: number;
  inkR: number;
}

// 日付や件数は mock と app で値が違う。数字と曜日を伏せた「型」で突き合わせないと、
// 動的値を含む文言が丸ごと突合対象から外れ、字体差も位置差も報告されないまま消える
const shapeOf = (text: string): string => text.replace(/[0-9]+/g, "#").replace(/[（(][日月火水木金土][）)]/g, "(曜)");

// 可視文字列ごとに字体と箱を拾う。mock 側に id が無くても、突合の鍵を文言そのものにできる
async function collectText(page: Page): Promise<TextBox[]> {
  return page.evaluate(() => {
    const out: TextBox[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      let text = "";
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text || text.length > 40) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      const ink = range.getBoundingClientRect();
      out.push({
        text, tag: el.tagName.toLowerCase(), font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight,
        tracking: cs.letterSpacing, leading: cs.lineHeight, color: cs.color,
        w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,
        x: Math.round(r.left * 100) / 100, y: Math.round(r.top * 100) / 100,
        // 箱の縁からの距離で持つ。箱ごと動いた分を二重に報告しないため
        inkX: Math.round((ink.left - r.left) * 100) / 100,
        inkR: Math.round((r.right - ink.right) * 100) / 100,
      });
    }
    return out;
  });
}

const TYPO_KEYS = ["font", "size", "weight", "tracking", "leading", "color"] as const;

// 片側に 1 回だけ出る「型」に絞って突合する。同じ型が複数あると、どれと比べたのか言えなくなる
function textParityRows(mock: TextBox[], app: TextBox[]): string[] {
  const index = (list: TextBox[]) => {
    const byShape = new Map<string, TextBox[]>();
    for (const box of list) byShape.set(shapeOf(box.text), [...(byShape.get(shapeOf(box.text)) ?? []), box]);
    return byShape;
  };
  const appIndex = index(app);
  const rows: string[] = [];
  for (const [shape, mockBoxes] of index(mock)) {
    const appBoxes = appIndex.get(shape);
    if (mockBoxes.length !== 1 || appBoxes?.length !== 1) continue;
    const m = mockBoxes[0]!;
    const a = appBoxes[0]!;
    const typo = TYPO_KEYS.filter((key) => m[key] !== a[key]).map((key) => `${key} \`${m[key]}\` → \`${a[key]}\``);
    type Metric = "w" | "h" | "x" | "y" | "inkX" | "inkR";
    const gap = (key: Metric) => Math.round((a[key] - m[key]) * 10) / 10;
    const cell = (label: string, key: Metric) =>
      Math.abs(gap(key)) >= 1 ? `${label} ${m[key]} → ${a[key]} (${gap(key) > 0 ? "+" : ""}${gap(key)})` : "";
    // 箱は同じ tag のときだけ比べる。異 tag 同士は padding の分だけ必ずずれ、本物のズレが埋もれる
    const box = m.tag !== a.tag ? [] : [
      cell("幅", "w"), cell("高", "h"), cell("左", "x"), cell("上", "y"),
      cell("字の左空き", "inkX"), cell("字の右空き", "inkR"),
    ].filter(Boolean);
    if (typo.length === 0 && box.length === 0) continue;
    rows.push(`| \`${m.text}\`${m.text === a.text ? "" : ` / \`${a.text}\``} | ${m.tag}/${a.tag} | ${typo.join("<br>") || "—"} | ${box.join("<br>") || "—"} |`);
  }
  return rows;
}

function onlyOnOneSide(mock: TextBox[], app: TextBox[]): { mockOnly: string[]; appOnly: string[] } {
  const shapes = (list: TextBox[]) => new Set(list.map((box) => shapeOf(box.text)));
  const mockShapes = shapes(mock);
  const appShapes = shapes(app);
  return {
    mockOnly: [...new Set(mock.filter((b) => !appShapes.has(shapeOf(b.text))).map((b) => b.text))],
    appOnly: [...new Set(app.filter((b) => !mockShapes.has(shapeOf(b.text))).map((b) => b.text))],
  };
}

// mock を赤・app をシアンに振って加算する。完全に重なれば灰、ズレた分だけ赤/シアンの縁が残る
function anaglyph(mock: PNG, app: PNG): PNG {
  const width = Math.min(mock.width, app.width);
  const height = Math.min(mock.height, app.height);
  const out = new PNG({ width, height });
  const luma = (png: PNG, x: number, y: number) => {
    const i = (png.width * y + x) << 2;
    return 0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (width * y + x) << 2;
      out.data[o] = luma(mock, x, y);
      out.data[o + 1] = luma(app, x, y);
      out.data[o + 2] = luma(app, x, y);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

async function withContexts(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  contextOptions: (typeof BASES)[number][1],
  screen: Screen,
  run: (mockPage: Page, appPage: Page) => Promise<void>,
): Promise<void> {
  const mockCtx: BrowserContext = await browser.newContext(contextOptions);
  const appCtx: BrowserContext = await browser.newContext(contextOptions);
  try {
    await installNetworkGuard(mockCtx);
    await installNetworkGuard(appCtx);
    const mockPage = await openMock(mockCtx, screen.mockFile, "body");
    await mockPage.waitForLoadState("networkidle");
    const appPage = await openApp(appCtx, { readySelector: "body", path: screen.appPath });
    await appPage.waitForLoadState("networkidle");
    if (screen.navigate) {
      await screen.navigate(mockPage);
      await screen.navigate(appPage);
    }
    await run(mockPage, appPage);
  } finally {
    await mockCtx.close();
    await appCtx.close();
  }
}

async function main(): Promise<void> {
  if (!MOCK_CONFIGURED || !APP_CONFIGURED) {
    console.log("overlay-diff: PP_MOCK_FILE と PP_APP_URL を設定してから実行する");
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  try {
    for (const screen of SCREENS) {
      for (const [label, contextOptions] of BASES) {
        const tag = `${screen.name}-${label}`;
        await withContexts(browser, contextOptions, screen, async (mockPage, appPage) => {
          const mockPng = await shoot(mockPage);
          const appPng = await shoot(appPage);
          for (const [suffix, png] of [["mock", mockPng], ["app", appPng], ["overlay", anaglyph(mockPng, appPng)]] as const) {
            const file = path.join(OUT_DIR, `${tag}-${suffix}.png`);
            writeFileSync(file, PNG.sync.write(png));
            console.log(`wrote ${file}`);
          }
          const mockText = await collectText(mockPage);
          const appText = await collectText(appPage);
          const { mockOnly, appOnly } = onlyOnOneSide(mockText, appText);
          const report = [
            `# ${tag} — 文言で突合した字体と箱の差分`,
            "",
            "両側に 1 回だけ出る文言（数字・曜日は伏せた「型」で突合）のみ / 箱は同 tag のときだけ比較",
            "",
            "| 文言 | tag mock/app | 字体 | 箱 |",
            "|---|---|---|---|",
            ...textParityRows(mockText, appText),
            "",
            "## mock にしか無い文言",
            "",
            ...mockOnly.map((t) => `- \`${t}\``),
            "",
            "## app にしか無い文言",
            "",
            ...appOnly.map((t) => `- \`${t}\``),
          ];
          const reportPath = path.join(OUT_DIR, `${tag}-text-parity.md`);
          writeFileSync(reportPath, `${report.join("\n")}\n`);
          console.log(`wrote ${reportPath}`);
        });
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
