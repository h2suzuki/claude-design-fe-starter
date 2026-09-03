// ⑧ の screenshot レビューは人手なので、実施したという記憶だけでは promote を止められない。
// 「どの画像を・いつ・どの model で見て・指摘をどう裁定したか」を記録に固定し、機械が赤を出せる形にする
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { checkReviews } from "../scripts/review-check.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/review-check.mjs");

type Dirs = {
  exportDir: string;
  screenshotsDir: string;
  reviewDir: string;
  referencePagesFile: string;
  ledgerFile: string;
};

const temps: string[] = [];

function makeDirs(): Dirs {
  const root = mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "review-check-"));
  temps.push(root);
  const dirs = {
    exportDir: path.join(root, "export"),
    screenshotsDir: path.join(root, "screenshots"),
    reviewDir: path.join(root, "ui-review"),
    referencePagesFile: path.join(root, "reference-pages.json"),
    ledgerFile: path.join(root, "DESIGN-POLICY.md"),
  };
  for (const dir of [dirs.exportDir, dirs.screenshotsDir, dirs.reviewDir]) mkdirSync(dir, { recursive: true });
  writeFileSync(dirs.referencePagesFile, JSON.stringify({ version: "1", pages: [] }));
  writeFileSync(dirs.ledgerFile, "# KEEP_IMPL\n\n- KI-001 日付欄は実装の書式を残す（2026-08-27 裁定）\n");
  return dirs;
}

test.afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function addScreen(dirs: Dirs, slug: string, file = `${slug}.dc.html`): void {
  writeFileSync(path.join(dirs.exportDir, file), `<html><body>${slug}</body></html>`);
}

function addShot(dirs: Dirs, name: string, body = name): string {
  writeFileSync(path.join(dirs.screenshotsDir, name), body);
  return createHash("sha256").update(body).digest("hex");
}

function addRecord(dirs: Dirs, slug: string, record: unknown): void {
  writeFileSync(path.join(dirs.reviewDir, `${slug}.json`), JSON.stringify(record, null, 2));
}

function greenRecord(slug: string, screenshots: { file: string; sha256: string }[]): Record<string, unknown> {
  return {
    version: "1",
    screen: slug,
    reviewedAt: "2026-09-03T11:00:00+09:00",
    model: "opus",
    effort: "high",
    screenshots,
    findings: [],
  };
}

// 全部そろった記録だけが緑。緑行は「何枚を・どの model で・いつ」見たかを読める形で残す
test("記録がそろっていれば緑になり、枚数と model と日時を出す", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const shots = [
    { file: "trial.mobile.png", sha256: addShot(dirs, "trial.mobile.png") },
    { file: "trial.desktop.png", sha256: addShot(dirs, "trial.desktop.png") },
  ];
  addRecord(dirs, "trial", greenRecord("trial", shots));
  const result = checkReviews(dirs);
  expect(result.red).toBe(0);
  expect(result.screens.map((s) => s.lines)).toEqual([["trial: レビュー済み（2 枚、opus/high、2026-09-03T11:00:00+09:00）"]]);
});

test("記録が無い画面は赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  addShot(dirs, "trial.mobile.png");
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toContain("trial: 記録なし（");
  expect(result.screens[0].lines[0]).toContain("trial.json）");
});

// 画像が撮り直されたら前回の判断は無効。sha256 の食い違いを stale として落とす
test("screenshot が撮り直されていれば再レビューを要求する", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png", "old");
  addRecord(dirs, "trial", greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]));
  addShot(dirs, "trial.mobile.png", "new");
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: trial.mobile.png が変わった（再レビュー）");
});

test("記録に載っていない screenshot があれば赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png");
  addShot(dirs, "trial.desktop.png");
  addRecord(dirs, "trial", greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]));
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: trial.desktop.png が記録に無い（再レビュー）");
});

test("記録にあるのに消えた screenshot があれば赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png");
  addRecord(dirs, "trial", greenRecord("trial", [
    { file: "trial.mobile.png", sha256: sha },
    { file: "trial.desktop.png", sha256: "0".repeat(64) },
  ]));
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: trial.desktop.png が消えた（再レビュー）");
});

test("未裁定の指摘があれば赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png");
  const record = greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]);
  record.findings = [
    { text: "余白が mock より広い", disposition: "open" },
    { text: "見出しの字間", disposition: "open" },
    { text: "影の濃さ", disposition: "fixed" },
  ];
  addRecord(dirs, "trial", record);
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: 未裁定の指摘 2 件");
});

// keep-impl は台帳の裁定を指しているときだけ裁定済み。指し先が無い keep-impl は逃げ道になる
test("keep-impl は台帳に文面があれば緑、無ければ赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png");
  const record = greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]);
  record.findings = [{ text: "日付欄の書式", disposition: "keep-impl:KI-001" }];
  addRecord(dirs, "trial", record);
  expect(checkReviews(dirs).red).toBe(0);

  record.findings = [{ text: "日付欄の書式", disposition: "keep-impl:KI-999" }];
  addRecord(dirs, "trial", record);
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: 台帳に無い keep-impl（KI-999）");
});

test("記録の model / effort が空なら赤", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  const sha = addShot(dirs, "trial.mobile.png");
  const record = greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]);
  record.model = "";
  delete record.effort;
  addRecord(dirs, "trial", record);
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: 記録が不完全（model / effort）");
});

test("screenshot が 1 枚も無ければ撮影を先に求める", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  addRecord(dirs, "trial", greenRecord("trial", []));
  const result = checkReviews(dirs);
  expect(result.red).toBe(1);
  expect(result.screens[0].lines[0]).toBe("trial: 記録できる screenshot が無い（bun run --cwd pp mock:screenshots を先に）");
});

// 見本帳は route にならない page。レビュー記録を求めると永久に赤のままになる
test("reference page は対象から外す", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  addScreen(dirs, "tokens");
  writeFileSync(dirs.referencePagesFile, JSON.stringify({ version: "1", pages: ["tokens.dc.html"] }));
  const sha = addShot(dirs, "trial.mobile.png");
  addRecord(dirs, "trial", greenRecord("trial", [{ file: "trial.mobile.png", sha256: sha }]));
  const result = checkReviews(dirs);
  expect(result.screens.map((s) => s.slug)).toEqual(["trial"]);
  expect(result.red).toBe(0);
});

test("export が空なら対象なしで緑", () => {
  const dirs = makeDirs();
  const result = checkReviews(dirs);
  expect(result.screens).toEqual([]);
  expect(result.red).toBe(0);
  expect(result.summary).toBe("対象なし（docs/presentation/ui-mock/export/ が空）");
});

// template は「判断だけ書けば緑になる」形で出す。ここが崩れると reviewer が sha256 を手で書く羽目になる
test("--template の出力に判断を書き足すと緑になる", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  addShot(dirs, "trial.mobile.png");
  addShot(dirs, "trial.desktop.state-open.png");
  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--template",
    "trial",
    "--export-dir", dirs.exportDir,
    "--screenshots-dir", dirs.screenshotsDir,
    "--review-dir", dirs.reviewDir,
    "--reference-pages", dirs.referencePagesFile,
    "--ledger", dirs.ledgerFile,
  ], { encoding: "utf8" });
  const template = JSON.parse(stdout) as Record<string, string | unknown[]>;
  expect(template.screen).toBe("trial");
  expect(template.model).toBe("");
  expect(template.effort).toBe("");
  expect(template.reviewedAt).toBe("");
  expect(template.agentId).toBe("");
  expect(template.findings).toEqual([]);
  expect((template.screenshots as { file: string }[]).map((s) => s.file)).toEqual([
    "trial.desktop.state-open.png",
    "trial.mobile.png",
  ]);

  writeFileSync(path.join(dirs.reviewDir, "trial.json"), JSON.stringify({
    ...template,
    reviewedAt: "2026-09-03T11:00:00+09:00",
    model: "opus",
    effort: "high",
  }));
  const result = checkReviews(dirs);
  expect(result.red).toBe(0);
  expect(result.screens[0].lines[0]).toContain("レビュー済み（2 枚");
});

test("--json は画面ごとの結果を機械可読で出し、赤なら rc 1", () => {
  const dirs = makeDirs();
  addScreen(dirs, "trial");
  addShot(dirs, "trial.mobile.png");
  let status = 0;
  let stdout = "";
  try {
    stdout = execFileSync(process.execPath, [
      SCRIPT,
      "--json",
      "--export-dir", dirs.exportDir,
      "--screenshots-dir", dirs.screenshotsDir,
      "--review-dir", dirs.reviewDir,
      "--reference-pages", dirs.referencePagesFile,
      "--ledger", dirs.ledgerFile,
    ], { encoding: "utf8" });
  } catch (error) {
    const failure = error as { status: number; stdout: string };
    status = failure.status;
    stdout = failure.stdout;
  }
  expect(status).toBe(1);
  const payload = JSON.parse(stdout) as { red: number; screens: { slug: string; ok: boolean }[] };
  expect(payload.red).toBe(1);
  expect(payload.screens).toHaveLength(1);
  expect(payload.screens[0]).toMatchObject({ slug: "trial", ok: false });
});
