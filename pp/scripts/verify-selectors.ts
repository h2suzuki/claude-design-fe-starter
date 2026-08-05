// mock 側 selector の実在確認。静的読解由来の selector は、diff を信じる前にここで match 数を検証する。
// 状態依存で MISS になる id は誤りではない — spec 側の per-state リストで期待状態を判定する（本 script は情報表示）
import { chromium } from "@playwright/test";
import { MOBILE_CONTEXT_OPTIONS, MOCK_CONFIGURED, MOCK_ENTRY_FILE, PP_LAUNCH_OPTIONS } from "../src/config";
import { installNetworkGuard } from "../src/net-block";
import { openMock } from "../src/targets/mock-target";
import { SELECTOR_MAP } from "../src/selector-map";

async function main(): Promise<void> {
  const entries = Object.entries(SELECTOR_MAP);
  if (!MOCK_CONFIGURED || entries.length === 0) {
    console.log("verify-selectors: PP_MOCK_FILE と SELECTOR_MAP を設定してから実行する");
    return;
  }
  const browser = await chromium.launch(PP_LAUNCH_OPTIONS);
  const context = await browser.newContext(MOBILE_CONTEXT_OPTIONS);
  await installNetworkGuard(context);
  // 待ち受けは中立な body にする — 先頭 entry を待つと、まさに診断したい MISS で計測前に crash する
  const page = await openMock(context, MOCK_ENTRY_FILE, "body");
  await page.waitForLoadState("networkidle");

  for (const [visualId, pair] of entries) {
    const n = await page.locator(pair.mockSel).count().catch((e: Error) => {
      console.error(`ERR  ${visualId}: ${e.message}`);
      return -1;
    });
    const flag = n === 1 ? "OK  " : n === 0 ? "MISS" : "AMBI";
    console.log(`${flag} ${visualId} (${n}) <- ${pair.mockSel}`);
  }
  await browser.close();
  console.log("\nNOTE: 特定状態でだけ存在する要素の MISS は正常。期待状態での MISS/AMBI だけを直す");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
