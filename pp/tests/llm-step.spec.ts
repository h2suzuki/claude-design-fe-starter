// 表（seed-docs/llm-steps.md）の写しは 1 か所にしか置かない。発注側も agent-audit もここを引くので、
// 難易度で effort が上がること・codex 行の model が正式 id であることを固定する
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { expectFor } from "../scripts/llm-step.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/llm-step.mjs");

test("effort は難易度で上がり、model は判定の種類で決まる", () => {
  expect(expectFor("screen-review", "S")).toEqual({ executor: "claude-subagent", model: "opus", effort: "medium" });
  expect(expectFor("screen-review", "L")).toEqual({ executor: "claude-subagent", model: "opus", effort: "high" });
  expect(expectFor("keep-impl-draft", "L")).toEqual({ executor: "claude-subagent", model: "sonnet", effort: "medium" });
  expect(expectFor("verify-claims", "S")).toEqual({ executor: "claude-subagent", model: "opus", effort: "high" });
});

test("境界を超える実装は codex 行で、難易度ごとに model が変わる", () => {
  expect(expectFor("implement", "S")).toEqual({ executor: "codex", model: "gpt-5.6-luna", effort: "default" });
  expect(expectFor("implement", "M")).toEqual({ executor: "codex", model: "gpt-5.6-terra", effort: "default" });
  expect(expectFor("implement", "L")).toEqual({ executor: "codex", model: "gpt-5.6-sol", effort: "high" });
});

test("表に無い step と難易度は黙って既定に落とさず止める", () => {
  expect(() => expectFor("unknown-step", "S")).toThrow(/表に無い step/);
  expect(() => expectFor("screen-review", "XL")).toThrow(/S \/ M \/ L/);
});

const temps: string[] = [];

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], env: Record<string, string> = {}): { stdout: string; status: number } {
  try {
    return { stdout: execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { ...process.env, ...env } }), status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; status?: number };
    return { stdout: failure.stdout ?? "", status: failure.status ?? 1 };
  }
}

test("--expect は difficulty.json の tier を引いて発注に貼れる 1 行を出す", () => {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "llm-step-"));
  temps.push(root);
  writeFileSync(path.join(root, "difficulty.json"), JSON.stringify({ version: "1", screens: { trial: { tier: "M" } } }));
  const { stdout, status } = run(["--expect", "screen-review", "trial"], { PP_DIFFICULTY_FILE: path.join(root, "difficulty.json") });
  expect(status).toBe(0);
  expect(stdout.trim()).toBe("screen-review trial: tier M → executor claude-subagent / model opus / effort high");
  const json = JSON.parse(run(["--expect", "screen-review", "trial", "--json"], { PP_DIFFICULTY_FILE: path.join(root, "difficulty.json") }).stdout);
  expect(json).toEqual({ step: "screen-review", slug: "trial", tier: "M", executor: "claude-subagent", model: "opus", effort: "high" });
});

test("difficulty.json が無ければ先に difficulty を回すよう言って rc 1", () => {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "llm-step-"));
  temps.push(root);
  const { stdout, status } = run(["--expect", "screen-review", "trial"], { PP_DIFFICULTY_FILE: path.join(root, "difficulty.json") });
  expect(status).toBe(1);
  expect(stdout).toContain("difficulty.json が無い（bun run --cwd pp difficulty を先に）");
});
