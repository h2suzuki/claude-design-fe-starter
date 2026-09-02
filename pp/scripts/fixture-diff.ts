#!/usr/bin/env tsx
// fixture にあって BE 出力に無い値を route ごとに出す（docs/design-sync.md 2.3 の 2 段目）。
// PP_MOCK_FILE に依存しないよう SCREENS を直接読む（screen-registry 経由だと未登録 slug で throw する）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beFileName, fixtureDiff } from "../src/fixture-diff";
import { APP_API_FIXTURES } from "../src/fixtures/app-fixtures";
import type { JsonResponder } from "../src/fixtures/route-intercept";
import { SCREENS } from "../src/screens";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BE_DIR = path.resolve(SCRIPT_DIR, "../fixtures/be");

// 同じ route を共通 fixture と画面 fixture の両方が持つことがある。先に登録された方を 1 度だけ見る
const collectResponders = (): Map<string, JsonResponder> => {
  const out = new Map<string, JsonResponder>(Object.entries(APP_API_FIXTURES));
  for (const screen of Object.values(SCREENS)) {
    for (const [route, responder] of Object.entries(screen.fixtures ?? {})) {
      if (!out.has(route)) out.set(route, responder);
    }
  }
  return out;
};

const main = (): void => {
  const responders = collectResponders();
  if (responders.size === 0) {
    console.log("fixture-diff: 対象なし（fixture が登録されていない）");
    return;
  }
  let differences = 0;
  let missing = 0;
  for (const [route, responder] of [...responders].sort(([a], [b]) => a.localeCompare(b))) {
    const file = beFileName(route);
    const beFile = path.join(BE_DIR, file);
    if (!fs.existsSync(beFile)) {
      missing += 1;
      console.log(`${route}: BE 出力なし（pp/fixtures/be/${file} を BE の test から書き出す、または responder の隣に手書きの理由を書く）`);
      continue;
    }
    const lines = fixtureDiff(responder(), JSON.parse(fs.readFileSync(beFile, "utf8")));
    if (lines.length === 0) {
      console.log(`${route}: 差なし`);
      continue;
    }
    differences += lines.length;
    console.log(`${route}:`);
    for (const line of lines) console.log(`  ${line}`);
  }
  console.log(`fixture-diff: ${responders.size} route / 差分 ${differences} 件 / BE 出力なし ${missing} 件`);
  if (differences > 0) process.exitCode = 1;
};

main();
