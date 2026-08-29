// 凍結前の mock 自身の破れを出す。app が無くても回るので、正本にする前に落とせる
// Usage: npm run mock:integrity [-- <export 内の file> ...]
// 出力: pp/artifacts/mock-integrity.json（MOCK201..MOCK205 の findings）
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BREAKPOINT_EDGE_WIDTHS,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  PP_LAUNCH_OPTIONS,
  SWEEP_WIDTHS,
  sweepContextOptions,
} from "../src/config";
import { EXPORT_DIR, MOCK_ROOT } from "../src/mock-server";
import { installNetworkGuard } from "../src/net-block";
import { listMockScreens, readReferencePages, screenSlug } from "../src/mock-screens";
import { openMock } from "../src/targets/mock-target";
import {
  coveredFindings,
  dialogFindings,
  findCoveredControls,
  findUnfitDialogs,
  measureWidth,
  readVocabulary,
  blockingFindings,
  isAdvisory,
  vocabularyFindings,
  widthFindings,
} from "../src/mock-integrity";
import type { Finding, ScreenVocabulary } from "../src/mock-integrity";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "mock-integrity.json");
const WIDTHS = [...SWEEP_WIDTHS, ...BREAKPOINT_EDGE_WIDTHS];

// 重なりと dialog は幅より視野に依るので、基準 2 点だけで見る（全幅で回すと時間が幅数倍になる）
const BASES = [
  ["mobile", { ...MOBILE_CONTEXT_OPTIONS, deviceScaleFactor: 1 }],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

async function main(): Promise<void> {
  const screens = listMockScreens(EXPORT_DIR, process.argv.slice(2));
  if (screens.length === 0) {
    console.log("mock-integrity: 対象なし（docs/presentation/ui-mock/export/ が空）");
    return;
  }
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  const findings: Finding[] = [];
  const vocabularies: Record<string, ScreenVocabulary> = {};
  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext(sweepContextOptions(width));
      try {
        await installNetworkGuard(context);
        for (const screen of screens) {
          const page = await openMock(context, screen, "body");
          await page.waitForLoadState("networkidle");
          findings.push(...widthFindings(screen, width, await measureWidth(page)));
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
    for (const [viewport, contextOptions] of BASES) {
      const context = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(context);
        for (const screen of screens) {
          const page = await openMock(context, screen, "body");
          await page.waitForLoadState("networkidle");
          findings.push(...coveredFindings(screen, viewport, await findCoveredControls(page)));
          findings.push(...dialogFindings(screen, viewport, await findUnfitDialogs(page)));
          // 語彙は画面ごとに 1 度取れば足りる。基準の第一正本で揃える
          if (viewport === "mobile") vocabularies[screenSlug(screen)] = await readVocabulary(page);
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const referencePages = readReferencePages(path.join(MOCK_ROOT, "reference-pages.json"), listMockScreens(EXPORT_DIR, []));
  findings.push(...vocabularyFindings(vocabularies, referencePages));

  const defects = blockingFindings(findings);
  const advice = findings.filter(isAdvisory);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ screens, widths: WIDTHS, defects, advice }, null, 2)}\n`);
  const show = (label: string, list: readonly Finding[]): void => {
    if (list.length === 0) return;
    console.log(`\n[${label}]`);
    for (const finding of list) console.log(`${finding.id} ${finding.screen}: ${finding.detail}`);
  };
  show("直してから凍結する", defects);
  show("気づき（凍結は止めない。直すかは読んだ人が決める）", advice);
  console.log(
    `\n${screens.length} 画面 × ${WIDTHS.length} 幅: 直すもの ${defects.length} 件 / 気づき ${advice.length} 件 -> ${path.relative(process.cwd(), OUT)}`,
  );
  if (defects.length > 0) process.exitCode = 1;
}

await main();
