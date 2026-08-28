// KEEP_IMPL 台帳の読み取り。人が読む markdown を正本にし、gate も同じ表を見る（許可を 2 箇所に割らない）
export interface KeepImplEntry {
  index: string;
  date: string;
  target: string;
}

// 画像の除外はこの接頭辞でだけ効く。台帳に無い画像の差は今までどおり落ちる
const IMAGE_PREFIX = "img:";

export function parseKeepImpl(markdown: string): KeepImplEntry[] {
  return markdown
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    // 見出しと区切りは番号を持たない。番号のある行だけが裁定
    .filter((cells) => cells.length >= 3 && /^\d+$/.test(cells[0] ?? ""))
    .map((cells) => ({ index: cells[0]!, date: cells[1]!, target: cells[2]! }));
}

export function imageTargets(entries: readonly KeepImplEntry[]): string[] {
  return entries
    .filter((entry) => entry.target.startsWith(IMAGE_PREFIX))
    .map((entry) => entry.target.slice(IMAGE_PREFIX.length).trim())
    .filter(Boolean);
}
