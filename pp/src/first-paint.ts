// 描画前に決まる色の採取と比較。ready マーカーを待つ gate は hydration 後しか見ないので、
// 1 枚目（hydration を止めた描画）と hydration 後を同じ形で採って突き合わせる
import type { Page } from "@playwright/test";

export interface PaintProbe {
  htmlBackgroundColor: string;
  htmlColor: string;
  bodyBackgroundColor: string;
  bodyColor: string;
  // 色が違ったとき「どの切替が遅れたか」を読むための診断値
  dataTheme: string | null;
  className: string;
}

export const readPaintProbe = (page: Page): Promise<PaintProbe> =>
  page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      htmlBackgroundColor: html.backgroundColor,
      htmlColor: html.color,
      bodyBackgroundColor: body.backgroundColor,
      bodyColor: body.color,
      dataTheme: document.documentElement.getAttribute("data-theme"),
      className: document.documentElement.className,
    };
  });

export const describeProbe = (probe: PaintProbe): string =>
  `html ${probe.htmlBackgroundColor}/${probe.htmlColor} body ${probe.bodyBackgroundColor}/${probe.bodyColor}` +
  ` data-theme=${probe.dataTheme ?? "（無し）"} class=${probe.className || "（無し）"}`;

export const paintDiff = (first: PaintProbe, hydrated: PaintProbe): string | null => {
  const surfaces = [
    ["html", first.htmlBackgroundColor, first.htmlColor, hydrated.htmlBackgroundColor, hydrated.htmlColor],
    ["body", first.bodyBackgroundColor, first.bodyColor, hydrated.bodyBackgroundColor, hydrated.bodyColor],
  ] as const;
  const lines = surfaces
    .filter(([, fb, fc, hb, hc]) => fb !== hb || fc !== hc)
    .map(([where, fb, fc, hb, hc]) => `${where}: first paint ${fb}/${fc} ≠ hydrated ${hb}/${hc}`);
  return lines.length ? lines.join(" / ") : null;
};
