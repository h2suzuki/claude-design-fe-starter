// 2 つの DumpResult の機械 diff。gate = 全 visual id で style diff 0 かつ geometry diff 0
import type { DumpResult, Rect } from "./dump";

export interface StyleDiffEntry {
  visualId: string;
  pseudo: "self" | "before" | "after";
  prop: string;
  mock: string;
  app: string;
}

export interface GeometryDiffEntry {
  visualId: string;
  axis: "x" | "y" | "width" | "height";
  mock: number;
  app: number;
  deltaPx: number;
}

export interface MissingEntry {
  visualId: string;
  side: "mock" | "app";
  reason: "not-found" | "ambiguous"; // ambiguous = matchCount > 1 の selector-map バグ
  matchCount: number;
}

// Chromium の computed-style は既に正規形 — full opacity の rgba/rgb 二重表現と空白だけ潰す
export function normalizeStyleValue(_prop: string, value: string): string {
  const v = value.trim().replace(/\s+/g, " ");
  const m = /^rgba\((\d+), ?(\d+), ?(\d+), ?1\)$/.exec(v);
  if (m) return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  return v;
}

export function diffStyles(
  mock: DumpResult,
  app: DumpResult,
  visualIds: string[],
  allowlist: readonly string[],
): { diffs: StyleDiffEntry[]; missing: MissingEntry[] } {
  const diffs: StyleDiffEntry[] = [];
  const missing: MissingEntry[] = [];
  for (const visualId of visualIds) {
    const m = mock.elements[visualId];
    const a = app.elements[visualId];
    if (!m || !m.found || m.matchCount !== 1) {
      missing.push({ visualId, side: "mock", reason: m && m.matchCount > 1 ? "ambiguous" : "not-found", matchCount: m?.matchCount ?? 0 });
      continue;
    }
    if (!a || !a.found || a.matchCount !== 1) {
      missing.push({ visualId, side: "app", reason: a && a.matchCount > 1 ? "ambiguous" : "not-found", matchCount: a?.matchCount ?? 0 });
      continue;
    }
    for (const bucket of ["style", "beforeStyle", "afterStyle"] as const) {
      const pseudo = bucket === "style" ? "self" : bucket === "beforeStyle" ? "before" : "after";
      for (const prop of allowlist) {
        const mv = normalizeStyleValue(prop, m[bucket][prop] ?? "");
        const av = normalizeStyleValue(prop, a[bucket][prop] ?? "");
        if (mv !== av) diffs.push({ visualId, pseudo, prop, mock: mv, app: av });
      }
    }
  }
  return { diffs, missing };
}

export function diffGeometry(
  mock: DumpResult,
  app: DumpResult,
  visualIds: string[],
  tolerancePx = 0,
): { diffs: GeometryDiffEntry[] } {
  const diffs: GeometryDiffEntry[] = [];
  for (const visualId of visualIds) {
    const m = mock.elements[visualId];
    const a = app.elements[visualId];
    if (!m?.rect || !a?.rect) continue; // 欠落は diffStyles の missing 側で報告済み
    const mr: Rect = m.rect;
    const ar: Rect = a.rect;
    for (const axis of ["x", "y", "width", "height"] as const) {
      const deltaPx = Math.round((ar[axis] - mr[axis]) * 100) / 100;
      if (Math.abs(deltaPx) > tolerancePx) {
        diffs.push({ visualId, axis, mock: mr[axis], app: ar[axis], deltaPx });
      }
    }
  }
  return { diffs };
}
