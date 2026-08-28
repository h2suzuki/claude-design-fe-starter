# スタック

構成要素・版・依存宣言・制約の一覧。値の正本は各 `package.json` と `pp/src/config.ts`。

## 実行時の経路

```mermaid
flowchart TB
  BROWSER(["Web Browser"])
  subgraph PROD["Vercel"]
    EDGE["Edge Network<br/>client bundle・静的資産"]
    FN["SvelteKit server<br/>Vercel Function（Node runtime）"]
  end
  BE[("Backend<br/>PJ が用意する")]
  BROWSER -->|HTTPS| EDGE
  BROWSER -->|SSR・data request| FN
  FN -->|API| BE
  classDef outside fill:#eeeeee,stroke:#999999,color:#555555
  class BE outside
```

## ビルドと検証の経路

```mermaid
flowchart TB
  BUN["bun<br/>依存導入 + script"]
  BUN --> FEDEPS["frontend/ の依存"]
  BUN --> PPDEPS["pp/ の依存"]
  FEDEPS --> SVELTE["Svelte 5"]
  SVELTE --> VPS["vite-plugin-svelte"]
  VPS --> VITE["Vite"]
  VITE --> KIT["SvelteKit"]
  KIT --> ADAPTER["adapter-auto"]
  ADAPTER --> OUT["Build Output API 形式"]
  OUT -->|deploy| PROD2{{"Vercel"}}
  PPDEPS --> PP["pp harness<br/>Node + Playwright"]
  PP --> CHROME["固定 Chromium"]
  MOCKSRV["pp の mock server<br/>http origin を与える"] --> CHROME
  FROZEN["凍結 mock<br/>ui-mock/export/"] --> MOCKSRV
  VITE -->|dev server| CHROME
```

## 構成要素

| 要素 | 版 | 版の正本 | 役割 |
|---|---|---|---|
| `svelte` | 5.56.10 | `frontend/package.json` | component |
| `@sveltejs/vite-plugin-svelte` | 7.3.0 | `frontend/package.json` | Svelte を Vite に載せる。`vitePreprocess()` が `frontend/svelte.config.js` の実体 |
| `vite` | 8.2.2 | `frontend/package.json` | bundler・dev server |
| `@sveltejs/kit` | 2.70.3 | `frontend/package.json` | routing・SSR/prerender・`$app/*`。Vite plugin として動く |
| `@sveltejs/adapter-auto` | 7.0.1 | `frontend/package.json` | deploy 先を build 時に解決し、具体 adapter へ委譲 |
| `bun` | 1.4.0 | 実行機の `bun --version` | 依存導入・script 実行（`frontend/` と `pp/` の両方） |
| `@playwright/test` | 1.61.1（`^` なし） | `pp/package.json` | 検証。同梱 Chromium が pixel の出所 |
| pp mock server | — | `pp/src/mock-server.ts` | 凍結 mock に http origin を与える（`file://` では fetch と dynamic import が壊れる） |
| Vercel | — | — | deploy 先。配線は seed の範囲外 |
| Backend | — | — | PJ の API。seed は持たない。検証中は `pp/src/fixtures/` が応答する |

## 依存宣言

`@sveltejs/kit` 2.70.3 の `peerDependencies`。

| 対象 | 許容 range | optional |
|---|---|---|
| `vite` | `^5.0.3 \|\| ^6.0.0 \|\| ^7.0.0-beta.0 \|\| ^8.0.0` | いいえ |
| `svelte` | `^4.0.0 \|\| ^5.0.0-next.0` | いいえ |
| `@sveltejs/vite-plugin-svelte` | `^3.0.0 \|\| ^4.0.0-next.1 \|\| ^5.0.0 \|\| ^6.0.0-next.0 \|\| ^7.0.0` | いいえ |
| `typescript` | `^5.3.3 \|\| ^6.0.0` | はい |
| `@opentelemetry/api` | `^1.0.0` | はい |

`@sveltejs/vite-plugin-svelte` 7.3.0 の `peerDependencies`: `vite: ^8.0.0-beta.7 \|\| ^8.0.0`、`svelte: ^5.46.4`。

## Node

| 要求元 | `engines.node` |
|---|---|
| `vite` 8.2.2 | `^20.19.0 \|\| >=22.12.0` |
| `@sveltejs/vite-plugin-svelte` 7.3.0 | `^20.19 \|\| ^22.12 \|\| >=24` |
| `@sveltejs/kit` 2.70.3 | `>=18.13` |
| `svelte` 5.56.10 | `>=18` |

実効要件は最も狭い `^20.19 || ^22.12 || >=24`。Node 21・23 は `vite-plugin-svelte` が除外する。`frontend/package.json`・`pp/package.json` に `engines` の宣言は無く、`.nvmrc` も置いていない。

## 制約

| 制約 | 根拠 | 違反したときの症状 |
|---|---|---|
| `vite` を依存に残す | `@sveltejs/kit` の非 optional peer。kit は `./vite` export の plugin として routing manifest 生成・SSR build・adapter 呼び出しを実装する | SvelteKit が動かない。routing・SSR・`$app/*`・adapter が自作対象になる |
| `@playwright/test` を `^` なしで固定する | 同梱 Chromium が pixel の出所 | text metrics と anti-aliasing が動き、pixel gate が全面的に赤くなる |
| build と CI の Node 版を揃える | 同一 runtime 内の build は byte 一致する。runtime をまたぐと entry chunk 1 本の minify 識別子が変わり、内容 hash と file 名が変わる（`vite` 8.2.2 で観測。minify は `rolldown` 側で走るため機構は未特定） | 成果物 hash が build した環境に依存し、CI と手元で file 名が食い違う |
| deploy runtime は Node に置く | Vercel の Bun Runtime は Beta で、公開ベータ告知が挙げる対象に SvelteKit が無い | 保証範囲外の runtime に本番が乗る |
| 依存の peer range を満たした状態で保つ | 宣言違反の tree は動いても次の解決で別版に化ける | 版が黙って変わる |

`typescript` は kit の **optional** peer であり、`frontend/package.json` が `~5.9.3` で直接 pin している。kit の宣言 range（`^5.3.3 || ^6.0.0`）は解決を左右しないが、range 外の版では kit の型が保証されない。

## deploy 先の解決

`@sveltejs/adapter-auto` 7.0.1 の挙動（`node_modules/@sveltejs/adapter-auto/index.js`）。

| 段 | 内容 |
|---|---|
| 判定 | build 時に環境変数で host を判定する（Vercel なら `VERCEL`） |
| 導入 | 該当 adapter が未導入なら、lockfile から package manager を判定し `execSync` で導入する |
| 未判定時 | host を判定できないと警告を出して具体 adapter を解決しない。ローカル build では Vercel 向け出力が出ない |
| 警告 | 継続して同じ host へ deploy するなら、具体 adapter（`@sveltejs/adapter-vercel`）への置き換えを促す |

`@sveltejs/adapter-vercel` は `frontend/package.json` に無く、`node_modules` にも入っていない。deploy 経路には build 時に導入される未 pin の依存が 1 本ある。

## bun と Node の分担

| 対象 | 実行系 |
|---|---|
| `frontend/` と `pp/` の依存導入 | bun（lockfile は `bun.lock`） |
| `frontend/` の build・dev server | Node |
| `pp/` の spec | Node（Playwright） |
| `pp/` の script 起動 | `bun run`。ただし `gate` と `test:*` は内部で `npm test` を呼ぶため npm も要る |

## 出典

deploy runtime の制約は Vercel 側の提供状況に依存する。Bun Runtime が GA になり SvelteKit が対象に入れば見直す。

| 出典 | 確認日 |
|---|---|
| [Vercel Bun Runtime](https://vercel.com/docs/functions/runtimes/bun) | 2026-08-21 |
| [Bun Runtime public beta](https://vercel.com/changelog/bun-runtime-now-in-public-beta-for-vercel-functions) | 2026-08-21 |
| [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)（`bun.lock` があれば Node runtime でも `bun install` が走る） | 2026-08-21 |
| [adapter-vercel utils.js](https://raw.githubusercontent.com/sveltejs/kit/main/packages/adapter-vercel/utils.js)（`bun1.x` を runtime として扱う） | 2026-08-21 |
| [svelte-adapter-bun README](https://raw.githubusercontent.com/gornostay25/svelte-adapter-bun/main/README.md)（`vite build` を前提とする） | 2026-08-21 |

版を上げる手順は `seed-docs/adoption.md` §7。
