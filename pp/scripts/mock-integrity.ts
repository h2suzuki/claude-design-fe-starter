// 凍結前の mock 自身の破れを出す。app が無くても回るので、正本にする前に落とせる
// Usage: npm run mock:integrity [-- <export 内の file> ...]
// 出力: pp/artifacts/mock-integrity.json（MOCK201..MOCK206 の findings）
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BREAKPOINT_EDGE_WIDTHS,
  PP_LAUNCH_OPTIONS,
  SCREENSHOT_BASES,
  SWEEP_WIDTHS,
  sweepContextOptions,
} from "../src/config";
import { EXPORT_DIR, MOCK_ROOT, REFERENCE_PAGES_FILE } from "../src/mock-server";
import { installNetworkGuard } from "../src/net-block";
import { isolateStorage } from "../src/mock-states";
import { listMockScreens, readReferencePages, screenSlug } from "../src/mock-screens";
import { loadStateGraph, replayTo, STATES_DIR, statesInOrder } from "../src/state-walk";
import { openMock } from "../src/targets/mock-target";
import {
  coveredFindings,
  dialogFindings,
  findCoveredControls,
  findUnfitDialogs,
  measureWidth,
  mergeRadii,
  formatRadius,
  radiusFindings,
  radiusOrder,
  readRadii,
  readVocabulary,
  blockingFindings,
  isAdvisory,
  resolveRadiusScale,
  vocabularyFindings,
  widthFindings,
} from "../src/mock-integrity";
import type { Finding, ScreenVocabulary } from "../src/mock-integrity";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts", "mock-integrity.json");
const WIDTHS = [...SWEEP_WIDTHS, ...BREAKPOINT_EDGE_WIDTHS];

async function main(): Promise<void> {
  const scaleDeclaration = path.join(MOCK_ROOT, "design-scale.json");
  const pages = listMockScreens(EXPORT_DIR, process.argv.slice(2));
  const referencePages = readReferencePages(REFERENCE_PAGES_FILE, listMockScreens(EXPORT_DIR, []));
  // 見本帳は画面ではないので layout 検査から外す。語彙と token の突合は見本帳も読む
  const referenceSlugs = new Set(referencePages);
  const screens = pages.filter((file) => !referenceSlugs.has(screenSlug(file)));
  const screenFiles = new Set(screens);
  if (pages.length === 0) {
    console.log("mock-integrity: 対象なし（docs/presentation/ui-mock/export/ が空）");
    return;
  }
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  const findings: Finding[] = [];
  const vocabularies: Record<string, ScreenVocabulary> = {};
  const radii: Record<string, Record<string, number>> = {};
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
    // 重なりと dialog は幅より視野に依るので、基準 2 点だけで見る（全幅で回すと時間が幅数倍になる）
    for (const [viewport, contextOptions] of SCREENSHOT_BASES) {
      const context = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(context);
        await isolateStorage(context);
        for (const screen of pages) {
          const page = await openMock(context, screen, "body");
          await page.waitForLoadState("networkidle");
          if (screenFiles.has(screen)) {
            findings.push(...coveredFindings(screen, viewport, await findCoveredControls(page)));
            findings.push(...dialogFindings(screen, viewport, await findUnfitDialogs(page)));
          }
          const slug = screenSlug(screen);
          // 語彙は画面ごとに 1 度取れば足りる。基準の第一正本で揃える
          if (viewport === "mobile") vocabularies[slug] = await readVocabulary(page);
          // 角丸は viewport ごとに描く部品が違う（一覧 / 日セル）ので両方の状態グラフで集めて合算する
          let collectedRadii = mergeRadii(radii[slug] ?? {}, await readRadii(page));
          const graph = loadStateGraph(STATES_DIR, slug, viewport);
          if (graph) {
            const stateIds = statesInOrder(graph);
            for (const stateId of stateIds.filter((id) => id !== "root")) {
              const statePage = await openMock(context, screen, "body");
              try {
                await replayTo(statePage, graph, stateId);
                collectedRadii = mergeRadii(collectedRadii, await readRadii(statePage));
              } finally {
                await statePage.close();
              }
            }
            console.log(`角丸: ${slug} は ${viewport} の ${stateIds.length} 状態で収集`);
          }
          radii[slug] = collectedRadii;
          await page.close();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  findings.push(...vocabularyFindings(vocabularies, referencePages));
  let radiusScale: ReadonlySet<string> | null = null;
  let radiusScaleSource = "";
  if (existsSync(scaleDeclaration)) {
    radiusScale = resolveRadiusScale(readFileSync(scaleDeclaration, "utf8"), {});
    radiusScaleSource = "design-scale.json";
  } else if (referencePages.length > 0) {
    radiusScale = resolveRadiusScale(
      null,
      Object.fromEntries(referencePages.map((screen) => [screen, radii[screen] ?? {}])),
    );
    radiusScaleSource = "見本 page の使用値";
  } else {
    console.log("mock-integrity: 角丸の突合先なし");
  }
  if (radiusScale !== null) findings.push(...radiusFindings(radii, radiusScale, referencePages));

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
  const radiusAdvice = advice.filter((finding) => finding.id === "MOCK206");
  if (radiusAdvice.length > 0 && radiusScale !== null) {
    const ordered = (values: readonly string[]): string[] => [...values].sort(radiusOrder);
    const screensWithAdvice = [...new Set(radiusAdvice.map((finding) => finding.screen))];
    console.log(
      [
        "\nClaude Design に確認する（凍結は止めない）:",
        `design system の角丸: ${ordered([...radiusScale]).join(" / ")}（出所: ${radiusScaleSource}）`,
        "画面にだけある角丸:",
        ...screensWithAdvice.map((screen) => {
          const values = ordered(Object.keys(radii[screen] ?? {}).filter((value) => !radiusScale.has(value)));
          return `  - ${screen}: ${values
            .map((value) => `${formatRadius(value)}（${radii[screen]![value]} 箇所）`)
            .join(", ")}`;
        }),
        "聞くこと: 画面の値と design system のどちらが正か / 正なら design system に段を足すか、画面を宣言の段に寄せるか",
      ].join("\n"),
    );
  }
  console.log(
    `\n${screens.length} 画面 × ${WIDTHS.length} 幅: 直すもの ${defects.length} 件 / 気づき ${advice.length} 件 -> ${path.relative(process.cwd(), OUT)}`,
  );
  if (defects.length > 0) process.exitCode = 1;
}

await main();
