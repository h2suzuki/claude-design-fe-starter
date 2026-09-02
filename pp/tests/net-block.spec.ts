// net-block は外部を全部 abort する。live な外部 embed の abort まで「閉包の取りこぼし」に数えると、
// 意図どおりの guard 動作で凍結手順が落ちる — その仕分けをここで固定する
import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";
import { isEmbedRequest } from "../src/net-block";

function fakeRequest(navigation: boolean, inSubFrame: boolean): Request {
  return {
    isNavigationRequest: () => navigation,
    frame: () => ({ parentFrame: () => (inSubFrame ? {} : null) }),
  } as unknown as Request;
}

test.describe("net-block — 外部 embed の見分け", () => {
  test("画面自身の navigation は embed ではない", () => {
    expect(isEmbedRequest(fakeRequest(true, false))).toBe(false);
  });

  test("子 frame の navigation は live な外部 embed", () => {
    expect(isEmbedRequest(fakeRequest(true, true))).toBe(true);
  });

  test("子 frame の中の資産取得は embed 自身ではない", () => {
    // iframe 内の画像まで embed 扱いにすると、閉包の取りこぼしが embed に紛れて見えなくなる
    expect(isEmbedRequest(fakeRequest(false, true))).toBe(false);
  });
});
