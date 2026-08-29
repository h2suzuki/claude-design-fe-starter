// KEEP_IMPL 台帳の読み取り。人が読む markdown を正本にし、gate も同じ表を見る（許可を 2 箇所に割らない）
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GeometryDiffEntry, StyleDiffEntry } from "./diff";
import { MOCK_ROOT } from "./mock-server";

export interface KeepImplEntry {
  index: string;
  date: string;
  target: string;
}

// 除外はこの 3 つの接頭辞でだけ効く。台帳に無い差は今までどおり落ちる
const IMAGE_PREFIX = "img:";
const STYLE_PREFIX = "style:";
const GEOMETRY_PREFIX = "geometry:";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseKeepImpl(markdown: string): KeepImplEntry[] {
  return markdown
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    // 見出しと区切りは番号を持たない。番号のある行だけが裁定
    .filter((cells) => cells.length >= 3 && /^\d+$/.test(cells[0] ?? ""))
    .map((cells) => ({ index: cells[0]!, date: cells[1]!, target: cells[2]! }));
}

const targetsWith = (entries: readonly KeepImplEntry[], prefix: string): string[] =>
  entries
    .filter((entry) => entry.target.startsWith(prefix))
    .map((entry) => entry.target.slice(prefix.length).trim())
    .filter(Boolean);

export const imageTargets = (entries: readonly KeepImplEntry[]): string[] => targetsWith(entries, IMAGE_PREFIX);

// 画像は src の一部で名指しするが、id と prop は完全一致にする。前方一致だと隣の部品まで黙って通る
export const styleTargets = (entries: readonly KeepImplEntry[]): string[] => targetsWith(entries, STYLE_PREFIX);

export const geometryTargets = (entries: readonly KeepImplEntry[]): string[] => targetsWith(entries, GEOMETRY_PREFIX);

export const withoutDeclaredStyles = (
  diffs: readonly StyleDiffEntry[],
  targets: readonly string[],
): StyleDiffEntry[] => diffs.filter((diff) => !targets.includes(`${diff.visualId}/${diff.prop}`));

export const withoutDeclaredGeometry = (
  diffs: readonly GeometryDiffEntry[],
  targets: readonly string[],
): GeometryDiffEntry[] => diffs.filter((diff) => !targets.includes(`${diff.visualId}/${diff.axis}`));

// 散文で書かれた対象は gate が 1 行も読まない。読めない entry を黙って無視せず名指しで出す
export function ledgerProblems(entries: readonly KeepImplEntry[]): string[] {
  const prefixes = [IMAGE_PREFIX, STYLE_PREFIX, GEOMETRY_PREFIX];
  return entries.flatMap((entry) => {
    const prefix = prefixes.find((candidate) => entry.target.startsWith(candidate));
    if (!prefix || !entry.target.slice(prefix.length).trim()) {
      return [`#${entry.index} 対象「${entry.target}」が名指しになっていない（${prefixes.join(" / ")} のいずれかで書く）`];
    }
    const target = entry.target.slice(prefix.length).trim();
    // `img:` は src の部分一致なので、dir だけ書くとその配下すべてが外れ、台帳が効かないのと同じになる
    if (prefix === IMAGE_PREFIX && target.endsWith("/")) {
      return [`#${entry.index} 対象「${target}」は dir なので file を名指ししていない（配下の画像がすべて外れる）`];
    }
    if (!ISO_DATE.test(entry.date)) {
      return [`#${entry.index} 日付「${entry.date}」が YYYY-MM-DD でない`];
    }
    return [];
  });
}

/** 台帳は mock の隣に置く。無い PJ は entry なしとして扱う */
export function keepImplEntries(): KeepImplEntry[] {
  const ledger = path.join(MOCK_ROOT, "DESIGN-POLICY.md");
  return existsSync(ledger) ? parseKeepImpl(readFileSync(ledger, "utf8")) : [];
}
