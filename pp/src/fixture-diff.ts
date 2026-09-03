// fixture にあって BE 出力に無い値を列挙する。BE 側にだけある key は app が無視できるので差分にしない
// （逆向きを混ぜると、内部用の項目が毎回ノイズになって「本番で欠ける値」が埋もれる）

export type FixtureDiffResult = { red: string[]; advice: string[] };

const kindOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// 差分行に載せる実物。長い要素を丸ごと出すと 1 件で画面が流れる
const trim = (value: unknown): string => {
  const json = JSON.stringify(value) ?? "undefined";
  return json.length <= 80 ? json : `${json.slice(0, 80)}…`;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

// 同じ瞬間を "+09:00" と "Z" で書いた fixture / BE を差分にしないための正規化
const instantOf = (value: string): number | null => {
  const text = value.trim();
  if (!ISO_RE.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
};

const normalize = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const ms = instantOf(value);
  return ms === null ? value.trim() : `@instant:${ms}`;
};

// path に載せる key 値。ISO は正規化後の姿（UTC）で書き、fixture / BE のどちらから見ても同じ行になる
const keyLabel = (value: unknown): string => {
  if (typeof value !== "string") return String(value);
  const ms = instantOf(value);
  return ms === null ? value.trim() : new Date(ms).toISOString();
};

const KEY_CANDIDATES = ["id", "key", "start", "date", "slug", "name"];
const ADVICE_LIMIT = 10;

const isPlainObject = (value: unknown): value is Record<string, unknown> => kindOf(value) === "object";

// 両配列の全要素が持つ最初の候補名。index 一致に頼ると件数が違うだけで全件が差分に化ける
const matchKeyOf = (fixture: unknown[], backend: unknown[]): string | null => {
  const all = [...fixture, ...backend];
  if (all.length === 0 || !all.every(isPlainObject)) return null;
  return KEY_CANDIDATES.find((key) => all.every((item) => key in (item as Record<string, unknown>))) ?? null;
};

const empty = (): FixtureDiffResult => ({ red: [], advice: [] });

const merge = (parts: FixtureDiffResult[]): FixtureDiffResult => ({
  red: parts.flatMap((part) => part.red),
  advice: parts.flatMap((part) => part.advice),
});

// BE に無い要素は赤ではなく気づき。件数差だけで gate が落ちると、値違いの 1 件が埋もれる
const capAdvice = (lines: string[]): string[] =>
  lines.length <= ADVICE_LIMIT ? lines : [...lines.slice(0, ADVICE_LIMIT), `…他 ${lines.length - ADVICE_LIMIT} 件`];

const diffArray = (fixture: unknown[], backend: unknown[], path: string): FixtureDiffResult => {
  const key = matchKeyOf(fixture, backend);
  if (key === null) {
    const missing: string[] = [];
    for (const [index, item] of fixture.entries()) {
      if (!backend.some((candidate) => deepEqual(item, candidate))) {
        missing.push(`${path}[${index}]: BE 出力に無い（気づき） — ${trim(item)}`);
      }
    }
    return { red: [], advice: capAdvice(missing) };
  }

  const byKey = new Map(
    backend.map((item) => [String(normalize((item as Record<string, unknown>)[key])), item] as const),
  );
  const parts: FixtureDiffResult[] = [];
  const missing: string[] = [];
  for (const item of fixture) {
    const raw = (item as Record<string, unknown>)[key];
    const label = `${path}[${key}=${keyLabel(raw)}]`;
    const counterpart = byKey.get(String(normalize(raw)));
    if (counterpart === undefined) missing.push(`${label}: BE 出力に無い（気づき）`);
    else parts.push(fixtureDiff(item, counterpart, label));
  }
  const merged = merge(parts);
  return { red: merged.red, advice: [...merged.advice, ...capAdvice(missing)] };
};

export const fixtureDiff = (fixture: unknown, backend: unknown, path = "$"): FixtureDiffResult => {
  const [fixtureKind, backendKind] = [kindOf(fixture), kindOf(backend)];
  if (fixtureKind !== backendKind) {
    return { red: [`${path}: 型が違う — fixture ${fixtureKind} / BE ${backendKind}`], advice: [] };
  }

  if (fixtureKind === "array") return diffArray(fixture as unknown[], backend as unknown[], path);

  if (fixtureKind === "object") {
    const backendObject = backend as Record<string, unknown>;
    return merge(
      Object.entries(fixture as Record<string, unknown>).map(([key, value]) =>
        key in backendObject
          ? fixtureDiff(value, backendObject[key], `${path}.${key}`)
          : { red: [`${path}.${key}: fixture にあって BE に無い`], advice: [] },
      ),
    );
  }

  if (normalize(fixture) === normalize(backend)) return empty();
  return { red: [`${path}: fixture ${String(fixture)} / BE ${String(backend)}`], advice: [] };
};

// docs/design-sync.md 2.3 の命名規約。BE の test 側と割れると diff が「BE 出力なし」に化ける
export const beFileName = (routePath: string): string =>
  `${routePath.replace(/^\//, "").replaceAll("/", "__")}.json`;
