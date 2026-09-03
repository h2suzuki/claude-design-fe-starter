// gate の死角（fixture にあって BE に無い値）を、満席枠の実例で固定する。
// BE 側にだけある key は app が無視できるので差分にしない
import { expect, test } from "@playwright/test";
import { beFileName, fixtureDiff } from "../src/fixture-diff";

test("BE が返さない配列要素（満席枠）は key つきで気づきに出る", () => {
  const { red, advice } = fixtureDiff(
    { slots: [{ id: 1, available: true }, { id: 2, available: false }] },
    { slots: [{ id: 1, available: true }] },
  );
  expect(red).toEqual([]);
  expect(advice).toEqual(["$.slots[id=2]: BE 出力に無い（気づき）"]);
});

test("key で対応づけた要素の値違いは赤で出る", () => {
  const { red, advice } = fixtureDiff(
    { slots: [{ start: "2026-04-23T15:00:00+09:00", available: false }] },
    { slots: [{ start: "2026-04-23T06:00:00.000Z", available: true }] },
  );
  expect(advice).toEqual([]);
  expect(red).toEqual(["$.slots[start=2026-04-23T06:00:00.000Z].available: fixture false / BE true"]);
});

test("同じ瞬間の ISO 文字列は offset が違っても差分にしない", () => {
  const diff = fixtureDiff({ at: "2026-04-23T15:00:00+09:00" }, { at: "2026-04-23T06:00:00.000Z" });
  expect(diff).toEqual({ red: [], advice: [] });
});

test("前後の空白だけ違う文字列は差分にしない", () => {
  expect(fixtureDiff({ name: " 田中 " }, { name: "田中" })).toEqual({ red: [], advice: [] });
});

test("index がずれても key が一致すれば対応づける", () => {
  const { red } = fixtureDiff(
    { slots: [{ id: "b", label: "夜" }] },
    { slots: [{ id: "a", label: "朝" }, { id: "b", label: "昼" }] },
  );
  expect(red).toEqual(["$.slots[id=b].label: fixture 夜 / BE 昼"]);
});

test("fixture 側だけの要素が 10 件を超えると残りは件数で畳む", () => {
  const slots = Array.from({ length: 13 }, (_, i) => ({ id: i }));
  const { red, advice } = fixtureDiff({ slots }, { slots: [{ id: 0 }] });
  expect(red).toEqual([]);
  expect(advice).toHaveLength(11);
  expect(advice.at(-1)).toBe("…他 2 件");
});

test("共通 key が無い配列は deep-equal に落とし、差は気づきに出る", () => {
  const { red, advice } = fixtureDiff({ tags: [["a"], ["b"]] }, { tags: [["a"]] });
  expect(red).toEqual([]);
  expect(advice).toHaveLength(1);
  expect(advice[0]).toContain("$.tags[1]");
});

test("入れ子の key 欠落は path つきで出る", () => {
  const { red } = fixtureDiff({ slots: [{ id: 1, available: true }] }, { slots: [{ id: 1 }] });
  expect(red).toEqual(["$.slots[id=1].available: fixture にあって BE に無い"]);
});

test("同じ値なら差分は空", () => {
  const value = { slots: [{ id: 1, available: true }], total: 1 };
  expect(fixtureDiff(value, JSON.parse(JSON.stringify(value)))).toEqual({ red: [], advice: [] });
});

test("BE 側にだけある key は差分にしない", () => {
  expect(fixtureDiff({ id: 1 }, { id: 1, internalNote: "x" })).toEqual({ red: [], advice: [] });
});

test("型違いは差分になる", () => {
  expect(fixtureDiff({ id: 1 }, { id: "1" }).red).toEqual(["$.id: 型が違う — fixture number / BE string"]);
});

test("BE の出力ファイル名は route path の / を __ にした名前", () => {
  expect(beFileName("/api/schedule")).toBe("api__schedule.json");
});
