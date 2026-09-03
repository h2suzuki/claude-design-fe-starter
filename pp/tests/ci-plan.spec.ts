// ci.sh の unit 段は bun test と同じ集合（frontend/ 配下の test file、node_modules 除く）で有無を決める。
// src 限定だと frontend/test の unit が黙って skip され、緑記録が unit 抜きで書かれる
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tools/ci.sh");
const temps: string[] = [];

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeRoot(files: string[]): string {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "ci-plan-"));
  temps.push(root);
  mkdirSync(path.join(root, "tools"));
  copyFileSync(CI, path.join(root, "tools/ci.sh"));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), "");
  }
  return root;
}

function plan(root: string, ...args: string[]): string {
  return execFileSync("bash", [path.join(root, "tools/ci.sh"), "--plan", ...args], { encoding: "utf8" });
}

test("frontend/test の *.test.ts があれば unit 段を走らせる", () => {
  const root = makeRoot(["frontend/test/schedule.test.ts"]);
  expect(plan(root)).toContain("frontend-unit    run");
});

test("frontend/src の *.spec.ts と _test 形も unit 段の対象", () => {
  expect(plan(makeRoot(["frontend/src/lib/a.spec.ts"]))).toContain("frontend-unit    run");
  expect(plan(makeRoot(["frontend/src/lib/a_test.ts"]))).toContain("frontend-unit    run");
});

test("node_modules の test file は数えず、無ければ skip と印字する", () => {
  const root = makeRoot(["frontend/node_modules/dep/index.test.js", "frontend/src/app.ts"]);
  expect(plan(root)).toContain("frontend-unit    skip (no unit tests)");
});

test("--plan は段の一覧だけを出し、--no-gate では gate-all を skip と印字する", () => {
  const out = plan(makeRoot([]), "--no-gate");
  expect(out.split("\n").filter(Boolean)).toEqual([
    "frontend-check   run",
    "frontend-unit    skip (no unit tests)",
    "pp-typecheck     run",
    "gate-all         skip (--no-gate)",
    "frontend-build   run",
  ]);
});
