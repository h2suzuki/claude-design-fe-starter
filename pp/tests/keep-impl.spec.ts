// KEEP_IMPL 台帳は人が読む markdown が正本。gate も同じ表を読むので、許可が 2 箇所に割れない。
// 読み違えると、承認していない差分を黙って通すか、承認済みの差分で落ち続けるかのどちらかになる
import { expect, test } from "@playwright/test";
import {
  imageTargets,
  keepImplEntries,
  ledgerProblems,
  parseKeepImpl,
  withoutDeclaredGeometry,
  withoutDeclaredStyles,
} from "../src/keep-impl";

const LEDGER = `# DESIGN-POLICY — KEEP_IMPL 台帳

- 前書きの箇条書き。表ではないので拾わない

| # | 日付 | 対象 | mock の表示 | 実装の表示 | 裁定 |
|---|------|------|------------|-----------|------|
| 1 | 2026-08-28 | img: assets/venue-kojimachi.png | 3.3 MB の PNG | 表示寸法の 2 倍へ縮小 | 軽量化を承認 |
| 2 | 2026-08-28 | style: hero-badge/fontFamily | 明朝 | ゴシック | 実装を残す |
| 3 | 2026-08-29 | geometry: hero-badge/height | 40 | 48 | 実装を残す |
`;

test.describe("parseKeepImpl", () => {
  test("every numbered row becomes an entry", () => {
    expect(parseKeepImpl(LEDGER).map((e) => e.index)).toEqual(["1", "2", "3"]);
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
    expect(imageTargets([{ index: "1", date: "2026-08-28", target: "style: hero-badge/fontFamily" }])).toEqual([]);
  });

  test("an img row with nothing after the prefix is refused", () => {
    // 空の対象を許すと、すべての画像に一致して全 pixel が比較対象から消える
    expect(imageTargets([{ index: "1", date: "2026-08-28", target: "img:" }])).toEqual([]);
  });
});

const entry = (target: string) => ({ index: "1", date: "2026-08-29", target });
const styleDiff = (visualId: string, prop: string) => ({ visualId, pseudo: "self" as const, prop, mock: "a", app: "b" });
const geometryDiff = (visualId: string, axis: "x" | "y" | "width" | "height") => ({ visualId, axis, mock: 1, app: 2, deltaPx: 1 });

test.describe("withoutDeclaredStyles", () => {
  test("台帳が名指しした style 差分だけ落ちない", () => {
    const diffs = [styleDiff("hero-badge", "fontFamily"), styleDiff("hero-badge", "color")];
    const kept = withoutDeclaredStyles(diffs, ["hero-badge/fontFamily"]);
    expect(kept.map((d) => d.prop)).toEqual(["color"]);
  });

  test("名指しは完全一致で、前方一致では効かない", () => {
    // `hero` で `hero-badge` まで消えると、承認していない差分が黙って通る
    const diffs = [styleDiff("hero-badge", "fontFamily")];
    expect(withoutDeclaredStyles(diffs, ["hero"]).length).toBe(1);
    expect(withoutDeclaredStyles(diffs, ["hero-badge/font"]).length).toBe(1);
  });

  test("台帳が空なら 1 件も落ちない", () => {
    expect(withoutDeclaredStyles([styleDiff("a", "color")], []).length).toBe(1);
  });
});

test.describe("withoutDeclaredGeometry", () => {
  test("軸まで名指しした差分だけ落ちない", () => {
    const diffs = [geometryDiff("hero-badge", "height"), geometryDiff("hero-badge", "width")];
    expect(withoutDeclaredGeometry(diffs, ["hero-badge/height"]).map((d) => d.axis)).toEqual(["width"]);
  });
});

test.describe("ledgerProblems", () => {
  test("読める台帳は問題を出さない", () => {
    expect(ledgerProblems(parseKeepImpl(LEDGER))).toEqual([]);
  });

  test("知らない接頭辞は名指しになっていないので問題として出す", () => {
    // 散文で書かれた対象は gate が 1 行も読まない。黙って通るのを防ぐ
    expect(ledgerProblems([entry("全画面の画像 13 枚")])).toHaveLength(1);
    expect(ledgerProblems([entry("全画面の画像 13 枚")])[0]).toContain("全画面の画像 13 枚");
  });

  test("接頭辞のあとが空なら問題として出す", () => {
    expect(ledgerProblems([entry("img:")])).toHaveLength(1);
  });

  test("日付が ISO 形式でなければ問題として出す", () => {
    expect(ledgerProblems([{ index: "1", date: "2026/08/29", target: "img: a.png" }])).toHaveLength(1);
  });

  test("問題は entry ごとに 1 件ずつ挙がる", () => {
    expect(ledgerProblems([entry("散文 A"), entry("散文 B")])).toHaveLength(2);
  });
});

test.describe("この PJ の台帳", () => {
  test("すべての entry が gate の読める形で書かれている", () => {
    // 散文で書いた対象は 1 行も読まれない。落ちない代わりに、承認していない差分まで通ってしまう
    const entries = keepImplEntries();
    expect(ledgerProblems(entries), `entry ${entries.length} 件`).toEqual([]);
  });
});
