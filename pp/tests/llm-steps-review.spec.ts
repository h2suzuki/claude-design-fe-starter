// 表は素案なので実測で直す。cell ごとの「1 段上げる / 下げる」提案が、
// 人が後から書き足す fixRounds / laterBugs と token 中央値から出ることを固定する
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { reviewCells } from "../scripts/llm-steps-review.mjs";
import type { LogEntry } from "../scripts/llm-steps-review.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/llm-steps-review.mjs");

const entry = (over: Partial<LogEntry>): LogEntry => ({ step: "screen-review", tier: "M", tokens: 1000, verdict: "green", ...over });

test("fix round 2 回以上か後発バグ 1 件以上の cell は 1 段上げる候補", () => {
  const up = reviewCells([entry({ fixRounds: 2 }), entry({})]);
  expect(up.rows[0]).toMatchObject({ step: "screen-review", tier: "M", count: 2, proposal: "1 段上げる候補" });
  expect(reviewCells([entry({ laterBugs: 1 })]).rows[0].proposal).toBe("1 段上げる候補");
});

test("同 step の中央値の 2 倍超を赤 0 で使っている cell は 1 段下げる候補", () => {
  const result = reviewCells([
    entry({ tier: "S", tokens: 500 }),
    entry({ tier: "S", tokens: 500 }),
    entry({ tier: "L", tokens: 5000 }),
  ]);
  expect(result.rows.map((row) => `${row.tier}:${row.proposal}`)).toEqual(["S:", "L:1 段下げる候補"]);
  expect(result.proposals).toBe(1);
});

test("赤が出ている cell は token が多くても下げない", () => {
  const result = reviewCells([
    entry({ tier: "S", tokens: 500 }),
    entry({ tier: "S", tokens: 500 }),
    entry({ tier: "L", tokens: 5000, verdict: "red" }),
  ]);
  expect(result.rows.find((row) => row.tier === "L")).toMatchObject({ red: 1, proposal: "" });
});

test("token が 1 件も測れない cell は中央値なしで数えるだけ", () => {
  expect(reviewCells([entry({ tokens: null })]).rows[0]).toMatchObject({ count: 1, tokens: null, proposal: "" });
});

const temps: string[] = [];

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function run(file: string): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync(process.execPath, [SCRIPT, file], { encoding: "utf8" }), status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; status?: number };
    return { stdout: failure.stdout ?? "", status: failure.status ?? 1 };
  }
}

test("log が無ければ対象なしで rc 0", () => {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "llm-steps-review-"));
  temps.push(root);
  const { stdout, status } = run(path.join(root, "agent-log.jsonl"));
  expect(status).toBe(0);
  expect(stdout).toContain("llm-steps-review: 対象なし（pp/artifacts/agent-log.jsonl が無い）");
});

test("log があれば cell ごとに件数・token 中央値・赤を並べる", () => {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "llm-steps-review-"));
  temps.push(root);
  const file = path.join(root, "agent-log.jsonl");
  writeFileSync(file, [entry({ tokens: 800 }), entry({ tokens: 1200, verdict: "red" })].map((line) => JSON.stringify(line)).join("\n"));
  const { stdout, status } = run(file);
  expect(status).toBe(0);
  expect(stdout).toContain("screen-review / M: 2 件 / token 中央値 1000 / 赤 1 件");
  expect(stdout).toContain("llm-steps-review: 1 cell / 提案 0 件");
});
