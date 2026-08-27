// computed-style の正規化。mock は run ごとに違う ephemeral port から配られるので、
// url() を生値で比べると同じ資産でも毎回差が出て基準幅 parity が構造的に落ちる
import { expect, test } from "@playwright/test";
import { normalizeStyleValue } from "../src/diff";

test.describe("normalizeStyleValue — url() origins", () => {
  test("the same asset served from two origins compares equal", () => {
    const mock = normalizeStyleValue("backgroundImage", 'url("http://127.0.0.1:35185/assets/logo.png")');
    const app = normalizeStyleValue("backgroundImage", 'url("http://127.0.0.1:42373/assets/logo.png")');
    expect(mock).toBe(app);
  });

  test("a different path is still a difference", () => {
    const mock = normalizeStyleValue("backgroundImage", 'url("http://127.0.0.1:35185/assets/logo.png")');
    const app = normalizeStyleValue("backgroundImage", 'url("http://127.0.0.1:42373/assets/logo-2.png")');
    expect(mock).not.toBe(app);
  });

  test("every layer of a stacked background is folded", () => {
    const value = 'url("http://a.test/one.png"), url("http://b.test/two.png")';
    expect(normalizeStyleValue("backgroundImage", value)).toBe('url("/one.png"), url("/two.png")');
  });

  test("an unquoted url() is folded too", () => {
    expect(normalizeStyleValue("backgroundImage", "url(http://127.0.0.1:1/a.png)")).toBe("url(/a.png)");
  });

  test("values without a url() are untouched", () => {
    const gradient = "linear-gradient(rgb(255, 255, 255), rgb(0, 0, 0))";
    expect(normalizeStyleValue("backgroundImage", gradient)).toBe(gradient);
    expect(normalizeStyleValue("backgroundImage", "none")).toBe("none");
  });

  test("data: URIs are left alone", () => {
    const inline = 'url("data:image/png;base64,AAAA")';
    expect(normalizeStyleValue("backgroundImage", inline)).toBe(inline);
  });

  test("full-opacity rgba still folds to rgb", () => {
    expect(normalizeStyleValue("color", "rgba(1, 2, 3, 1)")).toBe("rgb(1, 2, 3)");
  });
});
