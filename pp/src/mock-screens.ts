// 参照スクショと診断の対象になる画面の列挙。既定を export 全体にしておかないと、
// 渡し忘れた画面が黙って撮られないまま凍結される
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PAGE_RE = /\.html?$/i;

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name), path.join(prefix, entry.name))
      : PAGE_RE.test(entry.name)
        ? [path.join(prefix, entry.name)]
        : [],
  );
}

/** 画面 slug は file 名の最初の dot まで（slug に dot は入らない） */
export function screenSlug(file: string): string {
  return path.basename(file).split(".", 1)[0] ?? "";
}

// 引数は「絞り込み」であって「対象の定義」ではない。export に無い名前は打ち間違いなので落とす
export function listMockScreens(exportDir: string, args: readonly string[]): string[] {
  const all = walk(exportDir).sort();
  if (args.length === 0) return all;
  const unknown = args.filter((arg) => !all.includes(arg));
  if (unknown.length > 0) {
    throw new Error(`pp: not in the frozen export — ${unknown.join(", ")}`);
  }
  return all.filter((file) => args.includes(file));
}

// 見本帳（route として実装しない仕様書 page）の宣言。宣言が無い / 空なら見本帳は無いものとして扱う
export function readReferencePages(file: string, screens: readonly string[]): string[] {
  if (!existsSync(file)) return [];
  const pages: unknown = (JSON.parse(readFileSync(file, "utf8")) as { pages?: unknown }).pages ?? [];
  if (!Array.isArray(pages) || pages.some((page) => typeof page !== "string")) {
    throw new Error(`pp: ${file} の pages は export 内の file 名を並べた配列で書く`);
  }
  const unknown = pages.filter((page) => !screens.includes(page as string));
  if (unknown.length > 0) {
    throw new Error(`pp: not in the frozen export — ${unknown.join(", ")}`);
  }
  return pages as string[];
}
