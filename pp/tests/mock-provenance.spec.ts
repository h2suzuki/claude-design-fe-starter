// 出所照合 gate: 凍結 export と sha256 台帳の一致を検証する。
// 突合先のドリフト（gate が旧 mock を向く事故）は他の全検証を静かに無効化するため、独立 spec で常設する
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { EXPORT_DIR } from "../src/mock-server";

const BASELINE_PATH = path.join(EXPORT_DIR, "..", "mock-baseline.sha256");

function listExportFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listExportFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

test.describe("design-reference — provenance", () => {
  test("export/ matches mock-baseline.sha256", async () => {
    const files = existsSync(EXPORT_DIR) ? listExportFiles(EXPORT_DIR) : [];
    test.skip(files.length === 0, "design-reference/export/ が空 — 最初の /mock-freeze 後にこの gate が有効化される");
    expect(existsSync(BASELINE_PATH), "mock-baseline.sha256 が無い — /mock-freeze で台帳を生成する").toBe(true);

    const entries = new Map<string, string>();
    for (const line of (await readFile(BASELINE_PATH, "utf8")).split("\n")) {
      const m = /^([0-9a-f]{64})\s+[* ]?(.+)$/.exec(line.trim());
      if (m) entries.set(m[2] as string, m[1] as string);
    }

    // 台帳の path は design-reference/ からの相対（export/...）— 凍結手順の sha256sum 出力と一致する形
    const mismatches: string[] = [];
    for (const rel of files) {
      const key = `export/${rel}`;
      const listed = entries.get(key);
      const digest = createHash("sha256").update(await readFile(path.join(EXPORT_DIR, rel))).digest("hex");
      if (!listed) mismatches.push(`${key}: 台帳に未登録`);
      else if (listed !== digest) mismatches.push(`${key}: hash 不一致（凍結後に変更されている）`);
      entries.delete(key);
    }
    for (const leftover of entries.keys()) mismatches.push(`${leftover}: 台帳にあるが実体が無い`);

    expect(mismatches, "台帳と実体の不一致 — /mock-freeze で再凍結するか、実体を復元する").toEqual([]);
  });
});
