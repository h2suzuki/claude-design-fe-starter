// 「表どおりの executor で回した」は記憶では証明できない。transcript の sidechain 行と記録の agentId を
// 突き合わせ、親 session が自分で書いた（呼び忘れ）と、表より上下にずれた model / effort が赤になることを固定する
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { agentMetrics, auditArtefacts } from "../scripts/agent-audit.mjs";
import type { Artefact } from "../scripts/agent-audit.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/agent-audit.mjs");

function sidechain(agentId: string, model: string, effort: string, extra: Record<string, unknown> = {}) {
  return { isSidechain: true, agentId, effort, type: "assistant", message: { model, ...extra } };
}

const review = (agentId?: string, tier: "S" | "M" | "L" | null = "L", at: string | null = "2026-09-03T10:00:00.000Z"): Artefact => ({
  file: "trial.json",
  step: "screen-review",
  slug: "trial",
  tier,
  agentId,
  at,
});

test("表どおりの model / effort で回した記録は緑", () => {
  const result = auditArtefacts([review("a1")], [sidechain("a1", "claude-opus-5", "high")]);
  expect(result.red).toBe(0);
  expect(result.rows[0].line).toBe("trial.json: a1 claude-opus-5/high — 表どおり");
  expect(result.summary).toBe("1 件 / 赤 0 件");
});

test("時刻の無い記録は赤（時刻で帰属を引けない）", () => {
  const result = auditArtefacts([review(undefined, "L", null)], []);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("reviewedAt が無い");
});

test("transcript に sidechain が無い agentId は呼び忘れとして赤", () => {
  const result = auditArtefacts([review("a1")], [sidechain("a2", "claude-opus-5", "high")]);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("呼び忘れ");
});

test("表が opus を要求する step を sonnet で回していたら赤", () => {
  const result = auditArtefacts([review("a1")], [sidechain("a1", "claude-sonnet-4-5", "high")]);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("表より下");
});

test("表より上の effort も赤（token の無駄）", () => {
  const result = auditArtefacts([review("a1")], [sidechain("a1", "claude-opus-5", "xhigh")]);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("表より上（もったいない、要求は opus/high）");
});

test("難易度が読めない記録は difficulty.json 不在として赤", () => {
  const result = auditArtefacts([review("a1", null)], [sidechain("a1", "claude-opus-5", "high")]);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("difficulty.json が無い");
});

test("transcript が見つからないときは agentId 付きの記録を赤にする", () => {
  const result = auditArtefacts([review("a1")], null);
  expect(result.red).toBe(1);
  expect(result.rows[0].line).toContain("transcript が見つからない");
});

test("記録が無ければ行も赤も出ない", () => {
  expect(auditArtefacts([], [])).toMatchObject({ rows: [], red: 0 });
});

test("token と所要は sidechain 行の usage と timestamp から出す", () => {
  const lines = [
    { ...sidechain("a1", "claude-opus-5", "high"), timestamp: "2026-09-03T10:00:00.000Z" },
    { ...sidechain("a1", "claude-opus-5", "high", { usage: { input_tokens: 100, output_tokens: 20 } }), timestamp: "2026-09-03T10:00:30.000Z" },
  ];
  expect(agentMetrics(lines)).toEqual({ tokens: 120, durationSeconds: 30 });
  expect(agentMetrics([sidechain("a1", "claude-opus-5", "high")])).toEqual({ tokens: null, durationSeconds: null });
});

function attributedSidechain(agentId: string, timestamp: string, attributionSkill: string, content: string | { type: string; text: string }[] = "") {
  return { isSidechain: true, agentId, timestamp, attributionSkill, effort: "high", type: "user", message: { model: "claude-opus-5", content } };
}

test("不正な agentId でも skill と時刻で transcript の agentId に帰属して緑になる", () => {
  const at = "2026-09-03T10:00:00.000Z";
  const result = auditArtefacts([review("screen-review", "L", at)], [attributedSidechain("subagent-1", at, "screen-review", "trial")]);
  expect(result).toMatchObject({ red: 0, rows: [{ agentId: "subagent-1" }] });
  expect(result.rows[0].line).toContain("agentId（transcript から: subagent-1）");
});

test("skill が合っても時刻の範囲外なら赤になる", () => {
  const result = auditArtefacts(
    [review("wrong", "L", "2026-09-03T10:06:00.000Z")],
    [attributedSidechain("subagent-1", "2026-09-03T10:00:00.000Z", "screen-review", "trial")],
  );
  expect(result.rows[0].line).toContain("該当する subagent が transcript に無い");
});

test("時刻が合っても別 skill の束は候補にしない", () => {
  const at = "2026-09-03T10:00:00.000Z";
  const result = auditArtefacts([review("wrong", "L", at)], [attributedSidechain("subagent-1", at, "verify-claims", "trial")]);
  expect(result.rows[0].line).toContain("skill screen-review");
});

test("複数候補は最初の user 行にある slug で 1 つに絞る", () => {
  const at = "2026-09-03T10:00:00.000Z";
  const result = auditArtefacts(
    [review("wrong", "L", at)],
    [
      attributedSidechain("other", at, "screen-review", "別画面"),
      attributedSidechain("trial-agent", at, "screen-review", [{ type: "text", text: "trial をレビュー" }]),
    ],
  );
  expect(result).toMatchObject({ red: 0, rows: [{ agentId: "trial-agent" }] });
});

test("帰属を引く時刻が無い記録は候補があっても赤になる", () => {
  const result = auditArtefacts([review("wrong", "L", null)], [attributedSidechain("subagent-1", "2026-09-03T10:00:00.000Z", "screen-review", "trial")]);
  expect(result.rows[0].line).toContain("reviewedAt が無い");
});

const temps: string[] = [];

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

type Dirs = { reviewDir: string; transcript: string; log: string; difficulty: string };

function makeDirs(): Dirs {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "agent-audit-"));
  temps.push(root);
  const dirs = {
    reviewDir: path.join(root, "ui-review"),
    transcript: path.join(root, "session.jsonl"),
    log: path.join(root, "agent-log.jsonl"),
    difficulty: path.join(root, "difficulty.json"),
  };
  mkdirSync(dirs.reviewDir, { recursive: true });
  writeFileSync(dirs.difficulty, JSON.stringify({ version: "1", screens: { trial: { tier: "M" } } }));
  return dirs;
}

function run(dirs: Dirs): { stdout: string; status: number } {
  const args = [SCRIPT, "--review-dir", dirs.reviewDir, "--log", dirs.log, "--difficulty", dirs.difficulty];
  try {
    const stdout = execFileSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, CLAUDE_TRANSCRIPT: dirs.transcript } });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; status?: number };
    return { stdout: failure.stdout ?? "", status: failure.status ?? 1 };
  }
}

test("agentId 付きの記録が 1 件も無ければ対象なしで rc 0", () => {
  const dirs = makeDirs();
  writeFileSync(path.join(dirs.reviewDir, "trial.json"), JSON.stringify({ version: "1", screen: "trial" }));
  writeFileSync(dirs.transcript, "");
  const { stdout, status } = run(dirs);
  expect(status).toBe(0);
  expect(stdout).toContain("agent-audit: 対象なし（docs/presentation/ui-review/ に agentId 付きの記録が無い）");
});

test("verify-*.json も監査対象で、赤があれば rc 1。判定は agent-log に 1 度だけ追記される", () => {
  const dirs = makeDirs();
  writeFileSync(path.join(dirs.reviewDir, "trial.json"), JSON.stringify({ screen: "trial", agentId: "a1" }));
  writeFileSync(path.join(dirs.reviewDir, "verify-1.json"), JSON.stringify({ agentId: "a2" }));
  writeFileSync(
    dirs.transcript,
    `${JSON.stringify(sidechain("a1", "claude-opus-5", "high"))}\n${JSON.stringify(sidechain("a2", "claude-sonnet-4-5", "high"))}\n`,
  );
  const { stdout, status } = run(dirs);
  expect(status).toBe(1);
  expect(stdout).toContain("trial.json: a1 claude-opus-5/high — 表どおり");
  expect(stdout).toContain("verify-1.json: a2 claude-sonnet-4-5/high — 表より下");
  expect(stdout).toContain("agent-audit: 2 件 / 赤 1 件");

  run(dirs);
  const log = readFileSync(dirs.log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(log).toHaveLength(2);
  expect(log[0]).toMatchObject({ file: "trial.json", step: "screen-review", slug: "trial", tier: "M", verdict: "green", expectedEffort: "high" });
  expect(log[1]).toMatchObject({ file: "verify-1.json", step: "verify-claims", slug: null, tier: "L", verdict: "red" });
});
