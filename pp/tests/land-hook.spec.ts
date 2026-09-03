import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.resolve(HERE, "../../.claude/hooks/block-land-without-ci.sh");
const SUGGEST = path.resolve(HERE, "../../.claude/hooks/suggest-pr-ci.sh");
const temps: string[] = [];
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.com" };

type Repo = { root: string; featureSha: string; headSha: string };
type Result = { stdout: string; stderr: string; status: number };

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: gitEnv });
}

function makeRepo(patterns?: string[]): Repo {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "land-hook-"));
  temps.push(root);
  execFileSync("git", ["init", root], { encoding: "utf8", env: gitEnv });
  mkdirSync(path.join(root, "pp"), { recursive: true });
  mkdirSync(path.join(root, "drafts/gate-logs"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), "initial\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "initial"]);
  git(root, ["checkout", "-b", "feature"]);
  writeFileSync(path.join(root, "README.md"), "feature\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "feature"]);
  if (patterns) writeFileSync(path.join(root, "pp/land-commands.json"), `${JSON.stringify({ version: "1", patterns })}\n`);
  return { root, featureSha: git(root, ["rev-parse", "feature"]).trim(), headSha: git(root, ["rev-parse", "HEAD"]).trim() };
}

function run(script: string, root: string, input: string): Result {
  const stderrPath = path.join(root, ".hook-stderr");
  const stderrFd = openSync(stderrPath, "w");
  try {
    const stdout = execFileSync("bash", [script], { encoding: "utf8", input, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, stdio: ["pipe", "pipe", stderrFd] });
    closeSync(stderrFd);
    return { stdout, stderr: readFileSync(stderrPath, "utf8"), status: 0 };
  } catch (error) {
    closeSync(stderrFd);
    const failure = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: failure.stdout ?? "", stderr: readFileSync(stderrPath, "utf8"), status: failure.status ?? 1 };
  }
}

function payload(command: string): string {
  return JSON.stringify({ tool_input: { command } });
}

function record(repo: Repo, sha: string): void {
  writeFileSync(path.join(repo.root, "drafts/gate-logs", `ci-green.${sha}`), "green\n");
}

test("台帳が無ければ通す", () => {
  const repo = makeRepo();
  expect(run(HOOK, repo.root, payload("git merge feature")).status).toBe(0);
});

test("pattern が空なら通す", () => {
  const repo = makeRepo([]);
  expect(run(HOOK, repo.root, payload("git merge feature")).status).toBe(0);
});

test("merge は対象 sha の記録が無ければ止め、あれば通す", () => {
  const repo = makeRepo(["^git merge"]);
  const denied = run(HOOK, repo.root, payload("git merge feature"));
  expect(denied.status).toBe(2);
  expect(denied.stderr).toContain(repo.featureSha);
  expect(denied.stderr).toContain(`ci-green.${repo.featureSha}`);
  record(repo, repo.featureSha);
  expect(run(HOOK, repo.root, payload("git merge feature")).status).toBe(0);
});

test("push は HEAD の記録を要求する", () => {
  const repo = makeRepo(["^git push"]);
  expect(run(HOOK, repo.root, payload("git push origin main")).status).toBe(2);
  record(repo, repo.headSha);
  expect(run(HOOK, repo.root, payload("git push origin main")).status).toBe(0);
});

test("merge --abort は通す", () => {
  const repo = makeRepo(["^git merge"]);
  expect(run(HOOK, repo.root, payload("git merge --abort")).status).toBe(0);
});

test("merge option は ref を見て、branch 削除は通す", () => {
  const repo = makeRepo(["^git merge", "^git push"]);
  const denied = run(HOOK, repo.root, payload("git merge --ff-only feature"));
  expect(denied.status).toBe(2);
  expect(denied.stderr).toContain(repo.featureSha);
  expect(run(HOOK, repo.root, payload("git push --delete feature")).status).toBe(0);
});

test("空 payload は usage を出して通す", () => {
  const repo = makeRepo(["^git merge"]);
  const result = run(HOOK, repo.root, "");
  expect(result.status).toBe(0);
  expect(result.stderr).toContain("Usage:");
});

test("SessionStart の compact と pr-check 不在 startup は何もしない", () => {
  const repo = makeRepo();
  const compact = run(SUGGEST, repo.root, JSON.stringify({ hook_event_name: "SessionStart", source: "compact" }));
  expect(compact).toEqual({ stdout: "", stderr: "", status: 0 });
  const startup = run(SUGGEST, repo.root, JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }));
  expect(startup).toEqual({ stdout: "", stderr: "", status: 0 });
});

test("git -C merge は指定 repo の記録を要求する", () => {
  const repo = makeRepo(["^git( -C \\S+)? (merge|push)"]);
  const command = `git -C ${repo.root} merge feature`;
  const denied = run(HOOK, repo.root, payload(command));
  expect(denied.status).toBe(2);
  expect(denied.stderr).toContain(`Repository directory checked: ${repo.root}`);
  record(repo, repo.featureSha);
  expect(run(HOOK, repo.root, payload(command)).status).toBe(0);
});

test("git -C push は指定 repo の HEAD 記録を要求する", () => {
  const repo = makeRepo(["^git( -C \\S+)? (merge|push)"]);
  const command = `git -C ${repo.root} push origin main`;
  expect(run(HOOK, repo.root, payload(command)).status).toBe(2);
  record(repo, repo.headSha);
  expect(run(HOOK, repo.root, payload(command)).status).toBe(0);
});
