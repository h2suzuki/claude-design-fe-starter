// AST 出所照合 gate: screen AST の provenance が現行の凍結 export と一致することを検証する。
// 再凍結後に AST を取り直さないと、下流の gate が旧 mock の構造を正として走る
import { expect, test } from "@playwright/test";
import { collectStaleScreens, listScreenAsts } from "../src/ast-provenance";
import { MOCK_ROOT, UI_AST_SCREENS_DIR } from "../src/mock-server";

test.describe("docs/presentation/ui-ast — provenance", () => {
  test("screen AST matches the frozen export it was extracted from", async () => {
    test.skip(
      listScreenAsts(UI_AST_SCREENS_DIR).length === 0,
      "docs/presentation/ui-ast/screens/ が空 — 最初の /ast-extract 後にこの gate が有効化される",
    );
    const stale = await collectStaleScreens(UI_AST_SCREENS_DIR, MOCK_ROOT);
    expect(stale, "AST が現行 mock を向いていない — /ast-extract で再抽出する").toEqual([]);
  });
});
