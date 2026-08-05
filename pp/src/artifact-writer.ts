// visual id ごとの diff artifact（style/geometry JSON・canvas heat-map）と pass/fail summary を書き出す
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DumpResult } from "./dump";
import type { StyleDiffEntry, GeometryDiffEntry, MissingEntry } from "./diff";
import type { CanvasDiffResult } from "./canvas-diff";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_DIR = path.join(HERE, "..", "artifacts");

export interface VisualIdReport {
  visualId: string;
  styleDiffs: StyleDiffEntry[];
  geometryDiffs: GeometryDiffEntry[];
  canvas?: CanvasDiffResult;
}

export function writeRunSummary(
  suiteName: string,
  reports: VisualIdReport[],
  missing: MissingEntry[],
  mockDump: DumpResult,
  appDump: DumpResult,
): { pass: boolean; summaryPath: string } {
  const dir = path.join(ARTIFACT_DIR, suiteName);
  mkdirSync(dir, { recursive: true });

  for (const r of reports) {
    const idDir = path.join(dir, r.visualId);
    mkdirSync(idDir, { recursive: true });
    writeFileSync(path.join(idDir, "style-diff.json"), JSON.stringify(r.styleDiffs, null, 2));
    writeFileSync(path.join(idDir, "geometry-diff.json"), JSON.stringify(r.geometryDiffs, null, 2));
    writeFileSync(
      path.join(idDir, "elements.json"),
      JSON.stringify({ mock: mockDump.elements[r.visualId], app: appDump.elements[r.visualId] }, null, 2),
    );
    if (r.canvas) {
      writeFileSync(path.join(idDir, "canvas-diff.json"), JSON.stringify({ ...r.canvas, diffPng: undefined }, null, 2));
      if (r.canvas.diffPng) writeFileSync(path.join(idDir, "canvas-diff.png"), r.canvas.diffPng);
    }
  }

  // anchor 不在時の rect は viewport 絶対値へ fallback しており比較として無意味 — run ごと失敗させる
  const anchorFound = { mock: mockDump.anchorFound, app: appDump.anchorFound };
  const pass =
    anchorFound.mock &&
    anchorFound.app &&
    missing.length === 0 &&
    reports.every((r) => r.styleDiffs.length === 0 && r.geometryDiffs.length === 0 && (!r.canvas || r.canvas.matched));

  const summaryPath = path.join(dir, "summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        pass,
        anchorFound,
        missing,
        perVisualId: reports.map((r) => ({
          visualId: r.visualId,
          styleDiffCount: r.styleDiffs.length,
          geometryDiffCount: r.geometryDiffs.length,
          canvasDiffPixels: r.canvas?.diffPixels ?? null,
        })),
      },
      null,
      2,
    ),
  );
  return { pass, summaryPath };
}
