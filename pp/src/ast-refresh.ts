// 再凍結後に screen AST を追従させるための純関数。browser を要る計測は scripts/ast-refresh.ts が持つ
export interface AstNode extends Record<string, unknown> {
  id?: unknown;
  props?: unknown;
  source?: unknown;
  children?: unknown;
}

export interface PropString {
  pathName: string;
  value: string;
}

// textContent に出ない props（差し替え点）。PJ 固有の属性系 props 名はここへ足す
export const NON_TEXT_PROP_KEYS = new Set([
  "alt", "ariaLabel", "href", "icon", "id", "name", "placeholder",
  "rel", "role", "src", "target", "title", "type", "value",
]);

// sha256sum の出力形式。binary mode の ` *` は marker であって path の一部ではない
const CHECKSUM_LINE = /^([0-9a-f]{64})\s+[* ]?(.+)$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBaseline(text: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = CHECKSUM_LINE.exec(line.trim());
    if (match) hashes.set(match[2]!, match[1]!);
  }
  return hashes;
}

export function collectNodes(nodes: unknown): AstNode[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((value) => (isObject(value) ? [value as AstNode, ...collectNodes(value.children)] : []));
}

// 直近の key で除外を決める。配列の要素は key を持たないので、その配列を抱える key を引き継ぐ
export function propStrings(props: unknown): PropString[] {
  const walk = (value: unknown, pathName: string, key: string | undefined): PropString[] => {
    if (typeof value === "string") return !key || NON_TEXT_PROP_KEYS.has(key) ? [] : [{ pathName, value }];
    if (Array.isArray(value)) return value.flatMap((item, index) => walk(item, `${pathName}[${index}]`, key));
    if (!isObject(value)) return [];
    return Object.entries(value).flatMap(([childKey, childValue]) => walk(childValue, `${pathName}.${childKey}`, childKey));
  };
  return walk(props, "props", undefined);
}

// mock server は export/ を root として配る
export function mockEntryFile(mockFile: string): string {
  return mockFile.startsWith("export/") ? mockFile.slice("export/".length) : mockFile;
}
