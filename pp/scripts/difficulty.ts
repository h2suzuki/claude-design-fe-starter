#!/usr/bin/env tsx
// 画面ごとの実装難易度（S/M/L）を、凍結 mock の実測（状態グラフ・登録 route・分岐抽出）だけで決める。
// PP_MOCK_FILE に依存しないよう SCREENS を直接読む（screen-registry 経由だと未登録 slug で throw する）
import fs from "node:fs";
import path from "node:path";
import { ARTIFACT_DIR } from "../src/artifact-writer";
import { difficultyTier } from "../src/difficulty";
import type { DifficultyTier } from "../src/difficulty";
import { listSiteScreens, screenSlug } from "../src/mock-screens";
import { EXPORT_DIR, REFERENCE_PAGES_FILE } from "../src/mock-server";
import { SCREENS } from "../src/screens";
import { STATES_DIR, loadStateGraph } from "../src/state-walk";
import { extractBranches } from "./mock-branches.mjs";

const VIEWPORTS = ["mobile", "desktop"] as const;

// test は PP_REPO_ROOT で別の repo を指すので、出力先もその repo の pp/artifacts に寄せる
const OUT_DIR = process.env.PP_REPO_ROOT ? path.join(process.env.PP_REPO_ROOT, "pp/artifacts") : ARTIFACT_DIR;

interface ScreenDifficulty {
  tier: DifficultyTier;
  states: number;
  routes: number;
  history: boolean;
  overlay: boolean;
}

// 状態グラフは viewport ごとに別に採られる。重い方が実装の重さなので max を取る
const measureStates = (slug: string): { states: number; back: boolean } => {
  let states = 0;
  let back = false;
  for (const viewport of VIEWPORTS) {
    const graph = loadStateGraph(STATES_DIR, slug, viewport);
    if (!graph) continue;
    states = Math.max(states, Object.keys(graph.states).length);
    back ||= graph.edges.some((edge) => edge.action.kind === "back");
  }
  return { states, back };
};

// 画面が叩く backend route 数。個別 route と pattern route を同じ 1 本として数える
const countRoutes = (slug: string): number => {
  const screen = SCREENS[slug];
  if (!screen) return 0;
  return Object.keys(screen.fixtures ?? {}).length + (screen.fixturePatterns?.length ?? 0);
};

const main = (): void => {
  const files = fs.existsSync(EXPORT_DIR) ? listSiteScreens(EXPORT_DIR, REFERENCE_PAGES_FILE, []) : [];
  if (files.length === 0) {
    console.log("difficulty: 対象なし（docs/presentation/ui-mock/export/ が空）");
    return;
  }
  const screens: Record<string, ScreenDifficulty> = {};
  for (const file of files) {
    const slug = screenSlug(file);
    const { states, back } = measureStates(slug);
    const source = fs.readFileSync(path.join(EXPORT_DIR, file), "utf8");
    const history = back || extractBranches(source, file).some((row) => row.kind === "history");
    const routes = countRoutes(slug);
    // root 以外の状態があるなら、そこへ行くのは dialog を開く click なので overlay とみなす
    const overlay = states >= 2;
    screens[slug] = { tier: difficultyTier({ states, routes, history, overlay }), states, routes, history, overlay };
  }
  const entries = Object.entries(screens).sort(([a], [b]) => a.localeCompare(b));
  for (const [slug, screen] of entries) {
    console.log(
      `${slug}: ${screen.tier}（状態 ${screen.states} / route ${screen.routes} / history ${screen.history ? "あり" : "なし"}）`,
    );
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "difficulty.json"),
    `${JSON.stringify({ version: "1", generatedAt: new Date().toISOString(), screens }, null, 2)}\n`,
  );
  const count = (tier: DifficultyTier): number => entries.filter(([, screen]) => screen.tier === tier).length;
  console.log(`difficulty: ${entries.length} 画面 / S ${count("S")} / M ${count("M")} / L ${count("L")}`);
};

main();
