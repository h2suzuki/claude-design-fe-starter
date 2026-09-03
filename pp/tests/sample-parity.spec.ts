// structural parity の参照 spec: SELECTOR_MAP の全 visual id を mock/app 両側で dump し、
// 基準 2 viewport それぞれで computed-style diff = 0 かつ geometry diff = 0 を gate にする（DoD の「基準幅」）。
// 操作を伴う画面では、この spec を手本に per-state の id リストを持つ scenario walk を足す
import { expect, test } from "@playwright/test";
import {
  APP_CONFIGURED,
  DESKTOP_CONTEXT_OPTIONS,
  MOBILE_CONTEXT_OPTIONS,
  MOCK_CONFIGURED,
  MOCK_ENTRY_FILE,
  PARITY_STATE_LIMIT,
} from "../src/config";
import { findScreenForMock } from "../src/ast-screen";
import { installNetworkGuard } from "../src/net-block";
import { UI_AST_SCREENS_DIR } from "../src/mock-server";
import { screenSlug } from "../src/mock-screens";
import { forEachFrozenState, formatStateFailure, summarizeFailures } from "../src/state-parity";
import { loadStateGraph, STATES_DIR } from "../src/state-walk";
import { openMock } from "../src/targets/mock-target";
import { openApp, openScreen } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";
import { ANCHOR_VISUAL_ID, SELECTOR_MAP, STATE_ONLY_IDS } from "../src/selector-map";
import { STYLE_ALLOWLIST } from "../src/style-allowlist";
import { dumpVisualIds } from "../src/dump";
import { diffStyles, diffGeometry } from "../src/diff";
import { geometryTargets, keepImplEntries, styleTargets, withoutDeclaredGeometry, withoutDeclaredStyles } from "../src/keep-impl";
import { writeRunSummary } from "../src/artifact-writer";
import type { VisualIdReport } from "../src/artifact-writer";

// 状態 test は自前で artifacts を書く。Playwright の page ごとの screenshot 保持と trace は数百 page ぶん無駄になる
test.use({ trace: "off", screenshot: "off" });

const IDS = Object.keys(SELECTOR_MAP);
// overlay 配下の id は操作前の DOM に無く、基準幅で突合すると必ず MISS になる
const BASE_IDS = IDS.filter((id) => !STATE_ONLY_IDS.includes(id));
const AST_SCREEN = findScreenForMock(UI_AST_SCREENS_DIR, MOCK_ENTRY_FILE).match?.screen;
const AST_NODES = [...(AST_SCREEN?.children ?? []), ...(AST_SCREEN?.overlays ?? [])];

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

for (const [label, contextOptions] of BASES) {
  const graph = loadStateGraph(STATES_DIR, screenSlug(MOCK_ENTRY_FILE), label);
  test.describe(`structural parity — ${label}`, () => {
    test.skip(IDS.length === 0, "対応表が空 — PP_MOCK_FILE に対応する screen AST を /ast-extract で起こすか MANUAL_PAIRS に書くと有効化される");
    test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — docs/presentation/ui-mock/export/ 内の突合先ファイル名を渡す");
    test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");

    test("all mapped visual ids: style/geometry diff = 0", async ({ browser }) => {
      const anchor = SELECTOR_MAP[ANCHOR_VISUAL_ID] ?? SELECTOR_MAP[BASE_IDS[0] as string];
      if (!anchor) throw new Error("pp: SELECTOR_MAP is empty");
      const mockCtx = await browser.newContext(contextOptions);
      const appCtx = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(mockCtx);
        await installNetworkGuard(appCtx);
        const mockPage = await openMock(mockCtx, MOCK_ENTRY_FILE, anchor.mockSel);
        const appPage = await openApp(appCtx, { readySelector: anchor.appSel, path: CURRENT_SCREEN!.entryPath });

        const selMock = Object.fromEntries(BASE_IDS.map((id) => [id, SELECTOR_MAP[id]!.mockSel]));
        const selApp = Object.fromEntries(BASE_IDS.map((id) => [id, SELECTOR_MAP[id]!.appSel]));
        const [mock, app] = await Promise.all([
          dumpVisualIds(mockPage, selMock, anchor.mockSel, STYLE_ALLOWLIST),
          dumpVisualIds(appPage, selApp, anchor.appSel, STYLE_ALLOWLIST),
        ]);

        const { diffs: allStyleDiffs, missing } = diffStyles(mock, app, BASE_IDS, STYLE_ALLOWLIST);
        const { diffs: allGeometryDiffs } = diffGeometry(mock, app, BASE_IDS);
        // 台帳が名指しした差分だけ落とさない。名指しに無いものは今までどおり落ちる
        const ledger = keepImplEntries();
        const styleDiffs = withoutDeclaredStyles(allStyleDiffs, styleTargets(ledger));
        const geometryDiffs = withoutDeclaredGeometry(allGeometryDiffs, geometryTargets(ledger));
        const reports: VisualIdReport[] = BASE_IDS.map((visualId) => ({
          visualId,
          styleDiffs: styleDiffs.filter((d) => d.visualId === visualId),
          geometryDiffs: geometryDiffs.filter((d) => d.visualId === visualId),
        }));
        const { pass, summaryPath } = writeRunSummary(`parity-${label}`, reports, missing, mock, app);
        expect(pass, `parity-${label}: see ${summaryPath}`).toBe(true);
      } finally {
        await mockCtx.close();
        await appCtx.close();
      }
    });

    test("every frozen state: style/geometry diff = 0", async ({ browser }) => {
      test.skip(graph === null, "状態グラフ無し — bun run --cwd pp mock:states で凍結すると有効化される");
      test.setTimeout(15 * 60_000);
      if (!graph) return;
      const baseAnchor = SELECTOR_MAP[ANCHOR_VISUAL_ID] ?? SELECTOR_MAP[IDS[0] as string];
      if (!baseAnchor) throw new Error("pp: SELECTOR_MAP is empty");
      const failures = await forEachFrozenState<string[]>(
        {
          browser,
          contextOptions,
          graph,
          nodes: AST_NODES,
          limit: PARITY_STATE_LIMIT,
          artifact: "summary なし",
          openMock: (context) => openMock(context, MOCK_ENTRY_FILE, baseAnchor.mockSel),
          openApp: (context) => openScreen(context, CURRENT_SCREEN!),
          inspect: (mockPage) =>
            mockPage.evaluate(
              ({ ids, selectors }) => ids.filter((id) => document.querySelector(selectors[id]!) !== null),
              { ids: IDS, selectors: Object.fromEntries(IDS.map((id) => [id, SELECTOR_MAP[id]!.mockSel])) },
            ),
          ids: (stateIds) => stateIds.length,
          precheck: (stateIds, stateId) => {
            if (stateIds.length > 0) return null;
            console.log(`state ${stateId}: ids 0 / diff MISS 1`);
            return formatStateFailure({ stateId, kind: "MISS", detail: "mock に visual id が無い", artifact: "summary なし" });
          },
        },
        async (stateIds, mockPage, appPage, stateId) => {
          const anchorId = stateIds.includes(ANCHOR_VISUAL_ID) ? ANCHOR_VISUAL_ID : stateIds[0]!;
          const anchor = SELECTOR_MAP[anchorId]!;
          const [mock, app] = await Promise.all([
            dumpVisualIds(mockPage, Object.fromEntries(stateIds.map((id) => [id, SELECTOR_MAP[id]!.mockSel])), anchor.mockSel, STYLE_ALLOWLIST),
            dumpVisualIds(appPage, Object.fromEntries(stateIds.map((id) => [id, SELECTOR_MAP[id]!.appSel])), anchor.appSel, STYLE_ALLOWLIST),
          ]);
          const { diffs: allStyleDiffs, missing } = diffStyles(mock, app, stateIds, STYLE_ALLOWLIST);
          const { diffs: allGeometryDiffs } = diffGeometry(mock, app, stateIds);
          const ledger = keepImplEntries();
          const styleDiffs = withoutDeclaredStyles(allStyleDiffs, styleTargets(ledger));
          const geometryDiffs = withoutDeclaredGeometry(allGeometryDiffs, geometryTargets(ledger));
          const reports: VisualIdReport[] = stateIds.map((visualId) => ({
            visualId,
            styleDiffs: styleDiffs.filter((diff) => diff.visualId === visualId),
            geometryDiffs: geometryDiffs.filter((diff) => diff.visualId === visualId),
          }));
          const { summaryPath } = writeRunSummary(`parity-${label}-${stateId}`, reports, missing, mock, app);
          const found: string[] = [];
          const add = (kind: string, count: number): void => {
            if (count > 0) found.push(formatStateFailure({ stateId, kind, detail: `${count}`, artifact: summaryPath }));
          };
          add("MISS", missing.length);
          add("style", styleDiffs.length);
          add("geometry", geometryDiffs.length);
          console.log(`state ${stateId}: ids ${stateIds.length} / diff MISS ${missing.length} style ${styleDiffs.length} geometry ${geometryDiffs.length} / heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);
          return found;
        },
      );
      expect(summarizeFailures(failures)).toBe("");
    });
  });
}
