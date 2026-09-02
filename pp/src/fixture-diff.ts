// fixture にあって BE 出力に無い値を列挙する。BE 側にだけある key は app が無視できるので差分にしない
// （逆向きを混ぜると、内部用の項目が毎回ノイズになって「本番で欠ける値」が埋もれる）

const kindOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// 差分行に載せる実物。長い要素を丸ごと出すと 1 件で画面が流れる
const trim = (value: unknown): string => {
  const json = JSON.stringify(value) ?? "undefined";
  return json.length <= 80 ? json : `${json.slice(0, 80)}…`;
};

export const fixtureDiff = (fixture: unknown, backend: unknown, path = "$"): string[] => {
  const [fixtureKind, backendKind] = [kindOf(fixture), kindOf(backend)];
  if (fixtureKind !== backendKind) return [`${path}: 型が違う — fixture ${fixtureKind} / BE ${backendKind}`];

  if (fixtureKind === "array") {
    const backendItems = backend as unknown[];
    return (fixture as unknown[]).flatMap((item, index) => {
      if (backendItems.some((candidate) => deepEqual(item, candidate))) return [];
      // 同順の相手がいれば中身の差を指す。いなければ「BE が返さない要素」そのもの
      if (index < backendItems.length) return fixtureDiff(item, backendItems[index], `${path}[${index}]`);
      return [`${path}[${index}]: BE の配列に同じ要素が無い — ${trim(item)}`];
    });
  }

  if (fixtureKind === "object") {
    const backendObject = backend as Record<string, unknown>;
    return Object.entries(fixture as Record<string, unknown>).flatMap(([key, value]) =>
      key in backendObject
        ? fixtureDiff(value, backendObject[key], `${path}.${key}`)
        : [`${path}.${key}: fixture にあって BE に無い`],
    );
  }

  return [];
};

// docs/design-sync.md 2.3 の命名規約。BE の test 側と割れると diff が「BE 出力なし」に化ける
export const beFileName = (routePath: string): string =>
  `${routePath.replace(/^\//, "").replaceAll("/", "__")}.json`;
