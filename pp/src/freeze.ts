// CSS animation・smooth scroll と全 timer を止めてから capture する。止めないと computed-style/canvas や scrollY が run 間で揺れる
import type { Page } from "@playwright/test";

const FREEZE_STYLE_ID = "pp-freeze-style";

// 冪等 — load 直後と各 capture 直前に呼んでよい
export async function freezePage(page: Page): Promise<void> {
  await page.evaluate((styleId) => {
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = "*{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
      document.head.appendChild(style);
    }
    // timer id は setInterval/setTimeout 共有の単調カウンタ — 新規 1 個の id から下って一括 clear する
    // fake clock 下では id が 1e12 始まりのため 0 まで下らず bound する（10 万超の生存 timer は現実に無い）
    const topId = window.setInterval(() => {}, 1 << 30);
    const lowerBound = Math.max(0, topId - 100_000);
    for (let id = topId; id > lowerBound; id--) {
      window.clearInterval(id);
      window.clearTimeout(id);
    }
  }, FREEZE_STYLE_ID);
}
