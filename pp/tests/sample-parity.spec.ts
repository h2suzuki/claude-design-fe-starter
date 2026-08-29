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
} from "../src/config";
import { installNetworkGuard } from "../src/net-block";
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

const BASES = [
  ["mobile", MOBILE_CONTEXT_OPTIONS],
  ["desktop", DESKTOP_CONTEXT_OPTIONS],
] as const;

for (const [label, contextOptions] of BASES) {
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
  });
}
