// KEEP_IMPL 台帳は人が読む markdown が正本。gate も同じ表を読むので、許可が 2 箇所に割れない。
// 読み違えると、承認していない差分を黙って通すか、承認済みの差分で落ち続けるかのどちらかになる
import { expect, test } from "@playwright/test";
import { imageTargets, parseKeepImpl } from "../src/keep-impl";

const LEDGER = `# DESIGN-POLICY — KEEP_IMPL 台帳

- 前書きの箇条書き。表ではないので拾わない

| # | 日付 | 対象 | mock の表示 | 実装の表示 | 裁定 |
|---|------|------|------------|-----------|------|
| 1 | 2026-08-28 | img: assets/venue-kojimachi.png | 3.3 MB の PNG | 表示寸法の 2 倍へ縮小 | 軽量化を承認 |
| 2 | 2026-08-28 | list-row-density | 密 | 疎 | 実装を残す |
`;

test.describe("parseKeepImpl", () => {
  test("every numbered row becomes an entry", () => {
    expect(parseKeepImpl(LEDGER).map((e) => e.index)).toEqual(["1", "2"]);
  });

  test("the header and the separator are not entries", () => {
    // 見出し行を entry にすると、対象が「対象」という文字列の許可になる
    expect(parseKeepImpl(LEDGER).every((e) => e.target !== "対象")).toBe(true);
  });

  test("date and target come from their own columns", () => {
    const first = parseKeepImpl(LEDGER)[0]!;
    expect(first.date).toBe("2026-08-28");
    expect(first.target).toBe("img: assets/venue-kojimachi.png");
  });

  test("an empty ledger yields no entries", () => {
    expect(parseKeepImpl("# DESIGN-POLICY\n\n| # | 日付 | 対象 |\n|---|---|---|\n")).toEqual([]);
  });
});

test.describe("imageTargets", () => {
  test("only rows written as an image target are used to mask", () => {
    // 台帳に載っていない画像の差は落ちる。載せる形を間違えると黙って通る
    expect(imageTargets(parseKeepImpl(LEDGER))).toEqual(["assets/venue-kojimachi.png"]);
  });

  test("a row without the img prefix is not an image target", () => {
    expect(imageTargets([{ index: "1", date: "2026-08-28", target: "list-row-density" }])).toEqual([]);
  });

  test("an img row with nothing after the prefix is refused", () => {
    // 空の対象を許すと、すべての画像に一致して全 pixel が比較対象から消える
    expect(imageTargets([{ index: "1", date: "2026-08-28", target: "img:" }])).toEqual([]);
  });
});
