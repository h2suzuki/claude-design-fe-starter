// 参照スクショと診断の対象になる画面の列挙。既定を export 全体にしておかないと、
// 渡し忘れた画面が黙って撮られないまま凍結される
import { readdirSync } from "node:fs";
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
