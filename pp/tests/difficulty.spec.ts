// 難易度は「どの LLM step をどの model / effort で回すか」の入口なので、S / M / L の境界を実測で固定する。
// 境界が動くと発注の重さが黙って変わるため、seed-docs/llm-steps.md の表の閾値そのものを test で押さえる
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { difficultyTier } from "../src/difficulty";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/difficulty.ts");

const plain = { states: 1, routes: 0, history: false, overlay: false };

test("状態 1・route 0・overlay も history も無しだけが S", () => {
  expect(difficultyTier(plain)).toBe("S");
  expect(difficultyTier({ ...plain, states: 0 })).toBe("S");
});

test("状態 10 は M のまま、11 で L に上がる", () => {
  expect(difficultyTier({ ...plain, states: 10, overlay: true })).toBe("M");
  expect(difficultyTier({ ...plain, states: 11, overlay: true })).toBe("L");
});

test("route は 1 本で S を外れ、3 本で L になる", () => {
  expect(difficultyTier({ ...plain, routes: 1 })).toBe("M");
  expect(difficultyTier({ ...plain, routes: 2 })).toBe("M");
  expect(difficultyTier({ ...plain, routes: 3 })).toBe("L");
});

test("overlay か history が 1 つなら M、2 つ揃うと L", () => {
  expect(difficultyTier({ ...plain, history: true })).toBe("M");
  expect(difficultyTier({ ...plain, overlay: true })).toBe("M");
  expect(difficultyTier({ ...plain, overlay: true, history: true })).toBe("L");
});

const temps: string[] = [];

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "difficulty-"));
  temps.push(root);
  mkdirSync(path.join(root, "docs/presentation/ui-mock/export"), { recursive: true });
  mkdirSync(path.join(root, "docs/presentation/ui-mock/states"), { recursive: true });
  return root;
}

function run(root: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", SCRIPT], {
      encoding: "utf8",
      cwd: path.dirname(SCRIPT),
      env: { ...process.env, PP_REPO_ROOT: root },
    });
    return { stdout, status: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; status?: number };
    return { stdout: failure.stdout ?? "", status: failure.status ?? 1 };
  }
}

test("export が空なら対象なしで rc 0", () => {
  const { stdout, status } = run(makeRepo());
  expect(status).toBe(0);
  expect(stdout).toContain("difficulty: 対象なし（docs/presentation/ui-mock/export/ が空）");
});

test("状態グラフの状態数と history 辺から画面ごとの tier を出す", () => {
  const root = makeRepo();
  const exportDir = path.join(root, "docs/presentation/ui-mock/export");
  const statesDir = path.join(root, "docs/presentation/ui-mock/states");
  writeFileSync(path.join(exportDir, "flat.dc.html"), "<html><body>flat</body></html>");
  writeFileSync(path.join(exportDir, "deep.dc.html"), "<html><body>deep</body></html>");
  writeFileSync(
    path.join(statesDir, "deep.json"),
    JSON.stringify({
      viewports: {
        mobile: { states: { root: { depth: 0 }, open: { depth: 1 } }, edges: [] },
        desktop: {
          states: { root: { depth: 0 }, open: { depth: 1 }, back: { depth: 2 } },
          edges: [{ action: { kind: "back", selector: "a", file: "flat.dc.html" } }],
        },
      },
    }),
  );
  const { stdout, status } = run(root);
  expect(status).toBe(0);
  expect(stdout).toContain("flat: S（状態 0 / route 0 / history なし）");
  expect(stdout).toContain("deep: L（状態 3 / route 0 / history あり）");
  expect(stdout).toContain("difficulty: 2 画面 / S 1 / M 0 / L 1");
});
