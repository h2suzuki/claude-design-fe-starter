// AST から selector 対を導けなかった visual id は SELECTOR_MAP に入らない。誰も読まなければ
// その id は黙って parity の対象外になり、「全 visual id が一致」の"全"が知らぬ間に縮む
import { expect, test } from "@playwright/test";
import { SELECTOR_MAP_ISSUES } from "../src/selector-map";

test.describe("selector-map — derivation", () => {
  test("every visual id in the screen AST resolves to a selector pair", () => {
    expect(SELECTOR_MAP_ISSUES).toEqual([]);
  });
});
