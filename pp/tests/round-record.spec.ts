// 巡の実測は session が終わると消える。成果物から機械で記録に落ち、人手欄が保持され、promote 前の --check が赤を出せることを固定する
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { checkRound, parseStateLines, recordRound } from "../scripts/round-record.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/round-record.mjs");
const temps: string[] = [];

type Dirs = {
  root: string;
  roundsDir: string;
  report: string;
  statesDir: string;
  screenshotsDir: string;
  baseline: string;
  integrity: string;
  agentLog: string;
  difficulty: string;
  reviewDir: string;
  exportDir: string;
  referencePages: string;
  declarations: string;
};

function makeDirs(): Dirs {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "round-record-"));
  temps.push(root);
  const dirs = {
    root,
    roundsDir: path.join(root, "rounds"),
    report: path.join(root, "playwright-report.json"),
    statesDir: path.join(root, "states"),
    screenshotsDir: path.join(root, "screenshots"),
    baseline: path.join(root, "mock-baseline.sha256"),
    integrity: path.join(root, "mock-integrity.json"),
    agentLog: path.join(root, "agent-log.jsonl"),
    difficulty: path.join(root, "difficulty.json"),
    reviewDir: path.join(root, "ui-review"),
    exportDir: path.join(root, "export"),
    referencePages: path.join(root, "reference-pages.json"),
    declarations: path.join(root, "gate-not-applicable.json"),
  };
  for (const dir of [dirs.roundsDir, dirs.statesDir, dirs.screenshotsDir, dirs.reviewDir, dirs.exportDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(dirs.baseline, "");
  writeFileSync(dirs.referencePages, JSON.stringify({ version: "1", pages: [] }));
  writeFileSync(dirs.declarations, JSON.stringify({ entries: [] }));
  return dirs;
}

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function gateReport(slug: string, startTime: string, specs: unknown[], stats: Record<string, number> = {}): object {
  return {
    config: { metadata: { mockEntryFile: `${slug}.dc.html` } },
    stats: { startTime, duration: 2600, expected: 1, unexpected: 0, flaky: 0, ...stats },
    suites: [{ suites: [{ specs }] }],
  };
}

function spec(file: string, status: string, duration = 100, stdout: string[] = []): object {
  return { file, tests: [{ status, results: [{ duration, stdout: stdout.map((text) => ({ text })) }] }] };
}

function writeReport(dirs: Dirs, value: object): void {
  writeFileSync(dirs.report, JSON.stringify(value, null, 2));
}

function command(dirs: Dirs, args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }), stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
}

function recordArgs(dirs: Dirs, round = "1"): string[] {
  return [round, "--rounds-dir", dirs.roundsDir, "--report", dirs.report, "--states-dir", dirs.statesDir,
    "--screenshots-dir", dirs.screenshotsDir, "--baseline", dirs.baseline, "--integrity", dirs.integrity,
    "--agent-log", dirs.agentLog, "--difficulty", dirs.difficulty, "--review-dir", dirs.reviewDir,
    "--export-dir", dirs.exportDir, "--reference-pages", dirs.referencePages, "--declarations", dirs.declarations,
    "--now", "2026-09-03T12:00:00.000Z"];
}

test("既存成果物から記録と Markdown を作り、人手欄を保持する", () => {
  const dirs = makeDirs();
  writeReport(dirs, gateReport("home", "2026-09-03T11:00:00.000Z", [spec("tests/home.spec.ts", "expected", 133, [
    "state initial: ids 2 / diff 0 / 許容 ±2 / heap 34 MB",
  ])]));
  writeFileSync(dirs.baseline, "a\n\nb\n");
  writeFileSync(path.join(dirs.screenshotsDir, "home.desktop.png"), "png");
  writeFileSync(path.join(dirs.screenshotsDir, "ignore.txt"), "x");
  writeFileSync(dirs.integrity, JSON.stringify({ defects: ["d"], advice: ["a", "b"] }));
  writeFileSync(dirs.difficulty, JSON.stringify({ screens: { home: { tier: "M" } } }));
  writeFileSync(path.join(dirs.statesDir, "home.json"), JSON.stringify({
    version: "1", file: "home.dc.html", limits: {}, viewports: {
      desktop: { states: { initial: {}, menu: {} }, edges: [{ action: { kind: "click" } }, { action: { kind: "navigate" } }], unchanged: 1, sampled: 2, boundsHit: ["states"] },
    },
  }));
  writeFileSync(path.join(dirs.reviewDir, "home.json"), JSON.stringify({
    reviewedAt: "2026-09-03T11:10:00.000Z", model: "opus", effort: "high", screenshots: [{}, {}], findings: [{ disposition: "open" }, { disposition: "fixed" }],
  }));
  writeFileSync(dirs.agentLog, `${JSON.stringify({ at: "2026-09-03T11:20:00.000Z", slug: "home", step: "screen-review", model: "opus", effort: "high", expectedModel: "opus", expectedEffort: "high", verdict: "green", tokens: 42, durationSeconds: 9 })}\n`);
  writeFileSync(path.join(dirs.roundsDir, "1.json"), JSON.stringify({
    version: "1", round: 1, recordedAt: "old", freeze: null, screens: { home: { smoke: ["smoke を確認"], escaped: ["escaped を受理"] } }, notes: ["人手メモ"],
  }));

  const result = command(dirs, recordArgs(dirs));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("round-record: 第 1 巡 home を記録した（gate rc 0 / 3 秒 / 状態 parity 1 件・到達不能 0）");
  const record = JSON.parse(readFileSync(path.join(dirs.roundsDir, "1.json"), "utf8"));
  expect(record).toMatchObject({ recordedAt: "2026-09-03T12:00:00.000Z", notes: ["人手メモ"] });
  expect(record.freeze).toMatchObject({ exportFiles: 2, screenshots: 1, integrity: { defects: 1, advice: 2 } });
  expect(record.freeze.states.home.desktop).toMatchObject({ states: 2, edges: 2, kinds: { click: 1, navigate: 1 } });
  expect(record.screens.home).toMatchObject({ tier: "M", smoke: ["smoke を確認"], escaped: ["escaped を受理"], review: { screenshots: 2, findings: 2, open: 1 } });
  expect(record.screens.home.llm).toHaveLength(1);
  const markdown = readFileSync(path.join(dirs.roundsDir, "1.md"), "utf8");
  expect(markdown).toContain("<!-- round:record が 1.json から生成する。直すなら json を直す -->");
  expect(markdown).toContain("- smoke を確認");
  expect(markdown).toContain("- escaped を受理");
  expect(markdown).toContain("- 人手メモ");
});

test("宣言済み skip と未宣言 skip を分け、未宣言なら gate を赤にする", () => {
  const dirs = makeDirs();
  writeFileSync(dirs.declarations, JSON.stringify({ entries: [{ screen: "skip", spec: "declared", reason: "対象なし", date: "2026-09-03" }] }));
  writeReport(dirs, gateReport("skip", "2026-09-03T11:00:00.000Z", [spec("tests/declared.spec.ts", "skipped"), spec("tests/unverified.spec.ts", "skipped")], { expected: 0 }));
  const record = recordRound({ ...dirs, round: 1, now: "2026-09-03T12:00:00.000Z" });
  expect(record.screens.skip.gate).toMatchObject({ skipped: 1, declared: 1, rc: 1, specs: { declared: { status: "declared" }, unverified: { status: "skipped" } } });
});

test("状態 parity の到達不能、差分、許容、heap、上限を集計する", () => {
  expect(parseStateLines([
    "state one: ids 1 / 到達不能 / 許容 ±2 / heap 30 MB",
    "state two: ids 2 / diff あり / heap 40 MB",
    "state three: ids 3 / diff MISS 1 style 2 geometry 3 / 許容 ±4 / heap 80 MB",
    "state four: ids 4 / diff 0 / heap 70 MB",
    "state 上限 12 に達した",
  ])).toEqual({ checked: 4, unreachable: 1, diff: 2, tolerance: 4, heapMaxMB: 80, limitHit: true });
  expect(parseStateLines([])).toBeNull();
});

test("check は記録なし、gate 欠落、古い gate を赤にし、揃えば緑にする", () => {
  const dirs = makeDirs();
  expect(checkRound({ ...dirs, round: 1 }).problems).toEqual(["第 1 巡の記録が無い（bun run --cwd pp round:record 1）"]);
  writeFileSync(path.join(dirs.exportDir, "trial.dc.html"), "<html></html>");
  writeReport(dirs, gateReport("trial", "2026-09-03T11:00:00.000Z", []));
  writeFileSync(path.join(dirs.roundsDir, "1.json"), JSON.stringify({ screens: {} }));
  expect(checkRound({ ...dirs, round: 1 }).problems).toEqual(["trial: gate が記録されていない"]);
  writeFileSync(path.join(dirs.roundsDir, "1.json"), JSON.stringify({ screens: { trial: { gate: { at: "old" } } } }));
  expect(checkRound({ ...dirs, round: 1 }).problems).toEqual(["trial: 最新の gate（2026-09-03T11:00:00.000Z）が記録されていない"]);
  writeFileSync(path.join(dirs.roundsDir, "1.json"), JSON.stringify({ screens: { trial: { gate: { at: "2026-09-03T11:00:00.000Z" } } } }));
  const result = command(dirs, ["--check", "1", "--rounds-dir", dirs.roundsDir, "--report", dirs.report, "--export-dir", dirs.exportDir, "--reference-pages", dirs.referencePages]);
  expect(result).toMatchObject({ status: 0, stdout: "round-record: 第 1 巡は最新（1 画面）\n" });
});

test("前巡の gate 所要を Markdown に添える", () => {
  const dirs = makeDirs();
  writeFileSync(path.join(dirs.roundsDir, "1.json"), JSON.stringify({ version: "1", round: 1, recordedAt: "old", freeze: null, screens: { trial: { gate: { durationSeconds: 7 } } }, notes: [] }));
  writeReport(dirs, gateReport("trial", "2026-09-03T11:00:00.000Z", [spec("tests/trial.spec.ts", "expected")]));
  recordRound({ ...dirs, round: 2, now: "2026-09-03T12:00:00.000Z" });
  expect(readFileSync(path.join(dirs.roundsDir, "2.md"), "utf8")).toContain("（前巡 7 秒）");
});

test("未知の引数は rc 2 で理由を出す", () => {
  const dirs = makeDirs();
  const result = command(dirs, ["--unknown"]);
  expect(result.status).toBe(2);
  expect(result.stderr).toBe("round-record: 未知の引数 --unknown\n");
});
