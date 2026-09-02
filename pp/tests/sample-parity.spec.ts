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
import { isolateStorage } from "../src/mock-states";
import { screenSlug } from "../src/mock-screens";
import { mapPathToApp, replayOnApp } from "../src/state-parity";
import { loadStateGraph, STATES_DIR, statesInOrder } from "../src/state-walk";
import { openMock } from "../src/targets/mock-target";
import { openApp } from "../src/targets/app-target";
import { CURRENT_SCREEN } from "../src/screen-registry";
import { ANCHOR_VISUAL_ID, SELECTOR_MAP } from "../src/selector-map";
import { STYLE_ALLOWLIST } from "../src/style-allowlist";
import { dumpVisualIds } from "../src/dump";
import { diffStyles, diffGeometry } from "../src/diff";
import { geometryTargets, keepImplEntries, styleTargets, withoutDeclaredGeometry, withoutDeclaredStyles } from "../src/keep-impl";
import { writeRunSummary } from "../src/artifact-writer";
import type { VisualIdReport } from "../src/artifact-writer";

const IDS = Object.keys(SELECTOR_MAP);
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
      const anchor = SELECTOR_MAP[ANCHOR_VISUAL_ID] ?? SELECTOR_MAP[IDS[0] as string];
      if (!anchor) throw new Error("pp: SELECTOR_MAP is empty");
      const mockCtx = await browser.newContext(contextOptions);
      const appCtx = await browser.newContext(contextOptions);
      try {
        await installNetworkGuard(mockCtx);
        await installNetworkGuard(appCtx);
        const mockPage = await openMock(mockCtx, MOCK_ENTRY_FILE, anchor.mockSel);
        const appPage = await openApp(appCtx, { readySelector: anchor.appSel, path: CURRENT_SCREEN!.entryPath });

        const selMock = Object.fromEntries(IDS.map((id) => [id, SELECTOR_MAP[id]!.mockSel]));
        const selApp = Object.fromEntries(IDS.map((id) => [id, SELECTOR_MAP[id]!.appSel]));
        const [mock, app] = await Promise.all([
          dumpVisualIds(mockPage, selMock, anchor.mockSel, STYLE_ALLOWLIST),
          dumpVisualIds(appPage, selApp, anchor.appSel, STYLE_ALLOWLIST),
        ]);

        const { diffs: allStyleDiffs, missing } = diffStyles(mock, app, IDS, STYLE_ALLOWLIST);
        const { diffs: allGeometryDiffs } = diffGeometry(mock, app, IDS);
        // 台帳が名指しした差分だけ落とさない。名指しに無いものは今までどおり落ちる
        const ledger = keepImplEntries();
        const styleDiffs = withoutDeclaredStyles(allStyleDiffs, styleTargets(ledger));
        const geometryDiffs = withoutDeclaredGeometry(allGeometryDiffs, geometryTargets(ledger));
        const reports: VisualIdReport[] = IDS.map((visualId) => ({
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
      const failures: string[] = [];
      const stateIds = statesInOrder(graph).filter((stateId) => stateId !== "root");
      const targets = stateIds.slice(0, PARITY_STATE_LIMIT);
      if (stateIds.length > targets.length) {
        console.log(`state 上限 ${PARITY_STATE_LIMIT} に達した（残り ${stateIds.length - targets.length} 状態は未突合）`);
      }
      const baseAnchor = SELECTOR_MAP[ANCHOR_VISUAL_ID] ?? SELECTOR_MAP[IDS[0] as string];
      if (!baseAnchor) throw new Error("pp: SELECTOR_MAP is empty");
      for (const stateId of targets) {
        const mockCtx = await browser.newContext(contextOptions);
        const appCtx = await browser.newContext(contextOptions);
        try {
          await Promise.all([isolateStorage(mockCtx), isolateStorage(appCtx)]);
          await Promise.all([installNetworkGuard(mockCtx), installNetworkGuard(appCtx)]);
          const mockPage = await openMock(mockCtx, MOCK_ENTRY_FILE, baseAnchor.mockSel);
          const mapped = await mapPathToApp(mockPage, graph, stateId, AST_NODES);
          const stateIds = await mockPage.evaluate(
            ({ ids, selectors }) => ids.filter((id) => document.querySelector(selectors[id]!) !== null),
            { ids: IDS, selectors: Object.fromEntries(IDS.map((id) => [id, SELECTOR_MAP[id]!.mockSel])) },
          );
          if (mapped.unmapped.length > 0) {
            failures.push(...mapped.unmapped.map((item) => `state ${stateId}: 到達不能 ${item.edgeId} ${item.reason} / summary なし`));
            console.log(`state ${stateId}: ids ${stateIds.length} / 到達不能`);
            continue;
          }
          if (stateIds.length === 0) {
            failures.push(`state ${stateId}: MISS mock に visual id が無い / summary なし`);
            console.log(`state ${stateId}: ids 0 / diff MISS 1`);
            continue;
          }
          const anchorId = stateIds.includes(ANCHOR_VISUAL_ID) ? ANCHOR_VISUAL_ID : stateIds[0]!;
          const anchor = SELECTOR_MAP[anchorId]!;
          const appPage = await openApp(appCtx, { readySelector: baseAnchor.appSel, path: CURRENT_SCREEN!.entryPath });
          try {
            await replayOnApp(appPage, mapped.steps);
          } catch (error) {
            failures.push(`state ${stateId}: 到達不能 app replay ${(error as Error).message.split("\n")[0]} / summary なし`);
            console.log(`state ${stateId}: ids ${stateIds.length} / 到達不能`);
            continue;
          }
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
          if (missing.length > 0) failures.push(`state ${stateId}: MISS ${missing.length} / ${summaryPath}`);
          if (styleDiffs.length > 0) failures.push(`state ${stateId}: style ${styleDiffs.length} / ${summaryPath}`);
          if (geometryDiffs.length > 0) failures.push(`state ${stateId}: geometry ${geometryDiffs.length} / ${summaryPath}`);
          console.log(`state ${stateId}: ids ${stateIds.length} / diff MISS ${missing.length} style ${styleDiffs.length} geometry ${geometryDiffs.length}`);
        } finally {
          await mockCtx.close();
          await appCtx.close();
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  });
}
