// 構造一致 gate: 実装の data-visual-id tree が AST tree と一致することを検証する。
// pixel を合わせる前に「木の形そのものが違う」を落とす網で、sample-parity の手前に置く
import { expect, test } from "@playwright/test";
import { collectConformanceIssues, expectedTree } from "../src/ast-conformance";
import { APP_CONFIGURED, MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED, MOCK_ENTRY_FILE } from "../src/config";
import { UI_AST_SCREENS_DIR } from "../src/mock-server";
import { installNetworkGuard } from "../src/net-block";
import { openApp } from "../src/targets/app-target";

// app の描画完了を示すセレクタに差し替える。本番 markup に test 都合を混ぜず root の専用属性（data-ready 等）を指す
const READY_SELECTOR = "body";

const EXPECTED = expectedTree(UI_AST_SCREENS_DIR, MOCK_ENTRY_FILE);

test.describe("app — AST conformance", () => {
  test.skip(!MOCK_CONFIGURED, "PP_MOCK_FILE 未設定 — docs/presentation/ui-mock/export/ 内の突合先ファイル名を渡す");
  test.skip(!APP_CONFIGURED, "PP_APP_URL 未設定 — app の dev server を起動して URL を渡す");
  test.skip(
    EXPECTED.nodes.length === 0,
    "対応する screen AST に binding.visualId が無い — /ast-extract で起こすと有効化される",
  );

  test("data-visual-id tree keeps the AST parent-child structure", async ({ browser }) => {
    const context = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
    await installNetworkGuard(context);
    const page = await openApp(context, { readySelector: READY_SELECTOR });
    const actual = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-visual-id]")).map((el) => ({
        id: el.getAttribute("data-visual-id") ?? "",
        parent: el.parentElement?.closest("[data-visual-id]")?.getAttribute("data-visual-id") ?? null,
      })),
    );
    await context.close();

    // 陽性対照: 1 つも付いていない画面は違反 0 件で「一致」と見分けがつかない
    expect(actual.length, "data-visual-id が実装に 1 つも無い — 部品へ属性を付ける").toBeGreaterThan(0);
    expect(collectConformanceIssues(EXPECTED, actual), "AST と実装の構造差分").toEqual([]);
  });
});
