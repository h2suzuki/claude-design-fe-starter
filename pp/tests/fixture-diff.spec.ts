// gate の死角（fixture にあって BE に無い値）を、満席枠の実例で固定する。
// BE 側にだけある key は app が無視できるので差分にしない
import { expect, test } from "@playwright/test";
import { beFileName, fixtureDiff } from "../src/fixture-diff";

test("BE が返さない配列要素（満席枠）が 1 件だけ出る", () => {
  const lines = fixtureDiff(
    { slots: [{ id: 1, available: true }, { id: 2, available: false }] },
    { slots: [{ id: 1, available: true }] },
  );
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("$.slots[1]");
});

test("入れ子の key 欠落は path つきで出る", () => {
  const lines = fixtureDiff({ slots: [{ id: 1, available: true }] }, { slots: [{ id: 1 }] });
  expect(lines).toEqual(["$.slots[0].available: fixture にあって BE に無い"]);
});

test("同じ値なら差分は空", () => {
  const value = { slots: [{ id: 1, available: true }], total: 1 };
  expect(fixtureDiff(value, JSON.parse(JSON.stringify(value)))).toEqual([]);
});

test("BE 側にだけある key は差分にしない", () => {
  expect(fixtureDiff({ id: 1 }, { id: 1, internalNote: "x" })).toEqual([]);
});

test("型違いは差分になる", () => {
  expect(fixtureDiff({ id: 1 }, { id: "1" })).toEqual(["$.id: 型が違う — fixture number / BE string"]);
});

test("BE の出力ファイル名は route path の / を __ にした名前", () => {
  expect(beFileName("/api/schedule")).toBe("api__schedule.json");
});
