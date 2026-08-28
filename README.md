# claude-design-fe-starter

Mock-first frontend development starter — Claude Design mock as the single
source of truth, converged on by a Playwright parity harness. Docs are in
Japanese.

## これは何

Claude Design の mock を意匠の唯一の正本（SSOT）とし、

1. mock を作って承認 → export 凍結 + sha256 pin
2. 部品先行で実装（tokens → components → 薄い page composition）
3. 機械 gate（structural parity・幅スイープ・状態スイープ・スクショ自己回帰・出所照合）で mock へ収束
4. LLM スクショ一次レビュー + 人間受入を機械 gate と別立てで常設

という順序を day-0 から強制するための seed。前プロジェクトで実証済みの検証ハーネスと規約文書から、ドメイン固有部を除去して汎用化した。前提はモバイルファースト。

### 幅の数字は 3 系統ある

役割が違うので混ぜない。**すべての正本は `pp/src/config.ts`** で、doc は値を持たずそこを指す。

| 数字 | 役割 | そこで何を見るか | 正本 |
|---|---|---|---|
| **390×844** | mobile の基準 viewport（第一正本） | mock と実装の **pixel 一致**（`sample-parity` / `page-parity`） | `MOBILE_VIEWPORT` |
| **1280×800** | desktop の基準 viewport（第二正本） | 同上 | `DESKTOP_VIEWPORT` |
| **360〜1920** | 幅スイープの範囲（既定値） | **崩れないことだけ** — 横スクロール・はみ出し・衝突・欠落。pixel 一致は取らない（`width-sweep`） | `SWEEP_WIDTHS` |

- **基準幅とスイープ範囲は別の検証。** 前者は「同じに見えるか」、後者は「壊れていないか」を見る
- 390 は基準幅であると同時にスイープにも含まれる（基準幅でも崩れは見る）
- 下限は 2026-08-27 に **320 → 360** へ変更した（ユーザー裁定「320 は小さいから、最小は 360 にしようか」）。320px 級の端末を支える PJ は `SWEEP_WIDTHS` を戻す
- **発注規約（`seed-docs/design-order-template.md` 項目 1）に書く下限・上限は `SWEEP_WIDTHS` と同じ数値にする。** 発注した範囲と検証する範囲がずれると、守られていない要件を検証し続けることになる

## 構成

```text
├── CLAUDE.md          mock-first 行動規範（数行・outcome 原則のみ）
├── docs/              規約 5 docs（ui-quality-policy / pixel-perfect / design-sync / ui-caveats / ast-layer）
├── .claude/           project skills（/fe-kickoff・/design-order・/mock-freeze・/ast-extract）+ 機械判定 hook 3 本
├── docs/presentation/ui-mock/  mock 凍結置き場（export + screenshots + sha256 台帳 + KEEP_IMPL 台帳）
├── docs/presentation/ui-ast/   UI AST 置き場（schema 2 本 + registry.json + screens/）
├── frontend/          SvelteKit skeleton（$lib/ui/{tokens,components} + src/routes、依存導入は bun）
├── pp/                parity harness（dump / diff / sweep / self-baseline / provenance）
├── tools/             design_sync（Claude Design 同期）+ ast_validate / ast-tree / ast-viewer（AST gate と可視化）+ toolchain-dir（browser/bun/cache の置き場解決）+ install.sh（既存 repo への copy-in）
└── seed-docs/         プロセス文書（adoption / walking-skeleton / screen-loop / design-order-template / first-prompts / pre-implementation-questions）
```

## 採用スタックとその理由（2026-08 時点）

役割が違う 4 つを重ねている。**bun と Vite は競合ではなく分担**で、どちらか一方に寄せる形にはならない。

```mermaid
flowchart TB
  subgraph DEV["開発機 / CI"]
    BUN["bun<br/>package manager + script runner"]
    BUN --> FE["frontend/<br/>bun.lock"]
    BUN --> PP["pp/<br/>bun.lock"]
    FE --> VITE["Vite<br/>bundler + dev server"]
    VITE --> KIT["SvelteKit<br/>routing / SSR / adapter"]
    KIT --> SVELTE["Svelte 5<br/>component"]
    PP --> NODE["Node<br/>Playwright を走らせる"]
    NODE --> CHROME["固定 Chromium<br/>pixel の出所"]
  end
  subgraph SHIP["本番"]
    ADAPTER["adapter-auto<br/>→ adapter-vercel"] --> VERCEL{{"Vercel"}}
  end
  KIT --> ADAPTER
  CHROME -. "app を描画して突合" .-> VITE
```

| 層 | 採ったもの | 何を担うか | 実体 |
|---|---|---|---|
| 依存導入 / script | **bun** | `frontend/` と `pp/` の両方。lockfile は `bun.lock` に統一 | `frontend/bun.lock`・`pp/bun.lock` |
| bundler / dev server | **Vite** | mock と app を同じ条件で描かせるための素地 | `frontend/vite.config.ts` |
| framework | **SvelteKit** | file-based routing・SSR/prerender・`$app/*`・adapter | `sveltekit()` plugin |
| UI | **Svelte 5** | runes ベースの component | `frontend/src/lib/ui/` |
| deploy | **adapter-auto → adapter-vercel** | Vercel の Build Output API 形式を生成 | `frontend/svelte.config.js` |
| 検証 | **Node + 固定 Playwright** | 固定 Chromium で pixel を出す。**version を上げると text metrics/AA が動く** | `pp/package.json`（`^` なしの完全固定） |

### Vite は外せない — SvelteKit の実装本体だから

- `@sveltejs/kit` は **`vite` を optional でない peerDependency** に持つ（`^5.0.3 || ^6.0.0 || ^7.0.0-beta.0 || ^8.0.0`。optional 扱いは `@opentelemetry/api` と `typescript` だけ）
- kit の exports に `./vite` があり、`vite.config.ts` はそこから `sveltekit()` を読む。**routing manifest 生成・SSR build・adapter 呼び出しが Vite plugin として実装されている**
- Bun 向けの `svelte-adapter-bun` ですら「`vite build` 後に Bun の standalone server を起動する」形である（確認日 2026-08-21）

つまり「Vite を外して bun だけにする」は SvelteKit ごと降りることを意味し、routing・SSR・`$app/*`・adapter が自作に変わる。

### bun をどこまで使うか（実測 2026-08-28）

| 使い方 | 実測 | 採否 |
|---|---|---|
| `bun install`（`frontend/`・`pp/`） | pp を bun で導入し Node の Playwright で回して 71 passed / 14 skipped — npm tree と同数 | **採用** |
| `bun run <script>` | `gate` まで通る。script 側は runner 名を持たないので `npm run` でも同じ | **採用** |
| `bun --bun`（Vite を Bun runtime で走らせる） | build は通るが、minifier の識別子割り当てが変わり entry chunk の hash が変わる。SvelteKit の version を固定しても差は残り、同一 runtime 2 回なら byte 一致 | **不採用** — 成果物の hash が runtime 依存になる |
| Playwright を Bun runtime で | 71 passed / 14 skipped で動く。ただし pixel 比較路の同一性は app 無しでは測れていない | **保留** — 実地で測るまで Node |

`bun --bun` は **vite の version を選ばない**。実測すると `node で実行 = vite/8.2.2 node-v24.20.0` / `bun --bun で実行 = vite/8.2.2 bun-v26.3.0` で、変わるのは runtime だけである。version を決めるのは `package.json` と `bun.lock`、決まる時点は `bun install` である。

### Vercel 側の現況（確認日 2026-08-21）

- Vercel の **Bun Runtime は Beta**。公開ベータ告知（2025-10-28）が挙げる対象に SvelteKit は含まれていない
- 一方 `adapter-vercel` の現行ソースは `bun1.x` を有効な runtime として扱う（experimental）
- **`bun.lock` があれば、Node runtime を使う場合でも Vercel は `bun install` を実行する**。つまり「bun で導入する」ことは Vercel 側の障害にならない

この 3 点から、**deploy runtime は Node のまま、導入だけ bun** を既定にしている。Bun Runtime が GA になり SvelteKit が対象に入った時点で再検討する。

### この節は時点付きである

判断は「Bun Runtime が Beta」「`adapter-vercel` の bun 対応が experimental」という 2026-08 の状況に依存している。状況が変われば結論も変わるので、**日付と出典を外して引用しない**。一次調査は 2026-08-21 に実施し、出典 URL は次のとおり。

- [Vercel Bun Runtime](https://vercel.com/docs/functions/runtimes/bun) / [Bun Runtime public beta](https://vercel.com/changelog/bun-runtime-now-in-public-beta-for-vercel-functions) / [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [adapter-vercel utils.js](https://raw.githubusercontent.com/sveltejs/kit/main/packages/adapter-vercel/utils.js)（`bun1.x` の扱い）
- [svelte-adapter-bun README](https://raw.githubusercontent.com/gornostay25/svelte-adapter-bun/main/README.md)（`vite build` 前提）

version の上げ方と、適用先がそれをどう受け取るかは `seed-docs/adoption.md` の「依存を上げる」節にある。

## 使い方

新規プロジェクト（基本形）:

1. GitHub の「Use this template」で repo を生成する
2. Claude Code で `/fe-kickoff` を実行し、day-0 セットアップ（`seed-docs/walking-skeleton.md`）を進める
3. 最初の 1 部品で mock → 凍結 → 実装 → parity → sweep を一周させてから画面量産に入る

既存 repo への後付け導入（BE 先行 repo 等）:

```bash
git clone --depth 1 https://github.com/h2suzuki/claude-design-fe-starter /tmp/fe-seed
/tmp/fe-seed/tools/install.sh
```

対象 dir は相対パスでよく、省略すると cwd になる。前回 install のまま触られていないファイルは黙って新版へ入れ替わり、**PJ が手を入れたファイル**（`pp/src/config.ts` などの差し替え点）はそのまま残して末尾に列挙する。まだ seed が入っていない repo で衝突したときだけ、対象違いを疑って何も書かずに停止する（置き換えたい場合は `--overwrite`）。最後に、まだ commit されていない seed の path をまとめて commit するか 1 キーで聞く（`y` / `Y` だけが進み、他のキーは即 cancel。`--commit` / `--no-commit` で固定でき、cancel しても再実行で同じ確認に戻る）。詳細は `SEED-CONTRACT.md`。

既に動いている実装がある repo（BE 先行・旧 FE あり等）は、導入後にまず `seed-docs/adoption.md` を読む（worktree で main を凍結したまま作り替える手順・既存実装を参照資料として扱う規律・段階移行の順序）。

導入後はそのまま `/fe-kickoff` で day-0 を進める（project skills は自動 hot-reload される。認識されないときは `/reload-skills`、hooks 登録を含む settings の変更が効かないときのみ再起動）。`.claude/settings.json` が既存だった場合は、hooks の手動 merge を先に行う（installer が NOTE で知らせる）。

## 全体の流れ

repo を作ってから本番に出すまで。seed が覆うのは **Phase 0〜3** で、Phase 4（公開・BE 配線）は道具も手順も持っていない。

```mermaid
flowchart TD
  subgraph P0["Phase 0 — 器を作る"]
    A["repo 生成<br/>(template / 既存 repo)"] --> B["tools/install.sh"]
    B --> C["Claude Code を起動<br/>/fe-kickoff で day-0"]
  end
  subgraph P1["Phase 1 — 意匠を決める"]
    C --> D["1 通目: プロダクト概要<br/>2 通目: design system 発注 + 発注規約"]
    D --> CD1{{"Claude Design"}}
    CD1 --> E["色・トーンを裁定 → publish"]
  end
  subgraph P2["Phase 2 — 画面 1 枚を通す (walking skeleton)"]
    E --> F["画面 mock を発注"]
    F --> CD2{{"Claude Design"}}
    CD2 --> G["完成宣言 → export 一式を受け取る<br/>(zip を drafts/ へ / design_sync fetch)"]
    G --> H["/mock-freeze<br/>棚卸し → 参照スクショ → sha256 pin"]
    H --> I["/ast-extract<br/>AST + 重い箇所の目星"]
    I --> J["実装前ヒアリング<br/>対策を示して承認を得る (必須)"]
    J --> K["部品実装 → page composition"]
    K --> L["bun run --cwd pp gate"]
    L --> M["LLM 一次レビュー + 人間受入"]
    M --> N["差分の裁定 (KEEP_IMPL)"]
  end
  subgraph P3["Phase 3 — 画面量産"]
    N --> O["screen-loop を画面ごとに繰り返す"]
    O -.->|"mock の破れ・意匠の修正"| CD2
  end
  subgraph P4["Phase 4 — 公開 (seed の外)"]
    O --> Q["Vercel に preview 公開"]
    Q --> R["BE 実装 → API 配線"]
    R --> S["再 push → 本番へ promote"]
  end
```

### 各段で何が起きるか

| # | 段 | 誰が動かすか | 入力 | 出力 | 次へ進む条件 |
|---|---|---|---|---|---|
| 0-1 | repo 生成 | 人 | — | 空の repo | — |
| 0-2 | `tools/install.sh` | 人 or Claude Code | seed の checkout | seed 一式が repo に入る | 既存 repo なら `seed-docs/adoption.md` を先に読む |
| 0-3 | `/fe-kickoff` | Claude Code | — | 差し替え点が埋まった状態 | `{{...}}` の残りがゼロ |
| 1-1 | 1 通目・2 通目を渡す | 人 | `seed-docs/first-prompts.md` + `design-order-template.md` の規約 block | design system | 人が色・トーンを裁定 |
| 1-2 | publish | 人 | 承認した design system | org の新規 project へ自動適用 | — |
| 2-1 | 画面 mock を発注 | 人 | 要件 + 規約 block | 画面 mock | 人の完成宣言 |
| 2-2 | export を受け取る | 人 → Claude Code | zip を `drafts/` へ、または `tools/design_sync fetch` | 取得物 | 取得が切れていないこと（`lint:mock` の MOCK103） |
| 2-3 | `/mock-freeze` | Claude Code | 取得物 | `docs/presentation/ui-mock/export/` + `mock-baseline.sha256` + 参照スクショ | `test:provenance` が緑 |
| 2-4 | `/ast-extract` | Claude Code | 凍結 export | `docs/presentation/ui-ast/screens/<slug>.ui-ast.json` | `tools/ast_validate` が緑 |
| 2-5 | **実装前ヒアリング** | Claude Code → 人 | MOCK104 の一覧 + mock を読んだ所見 | 対策とその**承認** | **承認が取れるまで実装に入らない** |
| 2-6 | 部品実装 → 合成 | Claude Code | AST + 承認済みの対策 | `frontend/src/lib/ui/` と `routes/` | states fixture が揃う |
| 2-7 | 機械 gate | Claude Code | 実装 + 凍結 mock | 判定 | **skip ゼロで全緑**（skip は未検証であって合格ではない） |
| 2-8 | LLM 一次 + 人間受入 | Claude Code → 人 | 実データの画面 | 指摘 | 指摘ゼロ、または全指摘が裁定に載る |
| 2-9 | 差分の裁定 | 人 | 残った差分 | 実装修正 or KEEP_IMPL entry | 未裁定ゼロ |
| 3 | 画面量産 | 両方 | — | 画面が増える | 画面ごとに 2-1〜2-9 を回す |
| 4 | 公開・BE 配線 | 人 | gate 緑の FE | 本番 | **seed の管轄外** |

### 迷いやすいところ

- **Claude Code は Phase 0 から要る。** 「mock ができてから起動」ではない — `install.sh` の後すぐ `/fe-kickoff` で day-0 の差し替え点を埋める段がある
- **design system が先、画面 mock が後。** 画面から作ると部品が画面ごとに増殖する
- **export の受け取りは 2 経路。** 手渡しの zip は `drafts/` に展開してから `/mock-freeze` が `export/` へ配置する（`export/` へ直接置かない — 凍結前の編集 gate が働く）
- **mock の破れは実装で直さない。** Phase 3 の点線どおり Claude Design へ差し戻す（`seed-docs/first-prompts.md` の (c)）
- **Phase 4 は seed が持っていない。** Vercel も BE 配線も、道具・手順ともに未整備（`todos.md` に不足として記録してある）

## mock を更新したとき

1. 修正は Claude Design 側で行う（構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集）
2. 完成宣言 → `/mock-freeze` で再凍結する（export 差し替えと sha256 台帳更新を同一 commit に）
3. 対象画面の KEEP_IMPL 台帳（`docs/presentation/ui-mock/DESIGN-POLICY.md`）を走査し、裁定済みの実装表示を mock へ反映して entry を閉じる — 台帳は縮小方向が定常（放置すると mock と実装が乖離し続ける）
4. pp を再実行して新 mock 基準で全 gate を緑へ（SELECTOR_MAP・spec の追随を含む）。残る差分は実装修正か新規裁定の 2 択

詳細は `docs/design-sync.md`（同期経路・台帳運用）。

## seed との往復（更新の運び方）

- **seed → PJ**: `git remote add seed <この repo の URL>` して必要 commit を `git cherry-pick` する（PJ 側で placeholder を差し替えている前提のため、一括上書きの機構は持たない）
- **PJ → seed**: pp harness 等の汎用部を強化・修正したら seed へ back-port する。運ぶのは **seed が配っている file** の修正だけで、PJ 固有物（SELECTOR_MAP の中身・fixture・screen 定義・差し替え済み placeholder・PJ が自分で `tools/` や `docs/` に足した file）は運ばない。dir 名で判定しない — `docs/` `tools/` `.claude/` は merge 領域で両者が同居する（`git -C <seed> ls-files --error-unmatch -- <path>` が rc 0 なら seed の配布物）。cherry-pick がそのまま当たらない場合は手動で port し、出典 commit を message に記す
- 共通部の package 化（npm 等）は 3 プロジェクト目まで見送る（rule of three）

## 設計原則: 強制の階層

モデルの自由度を保ちつつ成果物を機械検証する。上の層ほど優先。

| 層 | 置くもの | この seed での実体 |
|---|---|---|
| テスト/CI | FE の不変条件ほぼ全部 | `pp/` の parity・sweep・provenance・self-baseline |
| hooks | 機械判定できる少数の門だけ | 凍結 mock の編集 block・mock 未凍結での UI 実装 block・commit 前の sha256 照合の 3 本 |
| CLAUDE.md | outcome 原則の数行 | `CLAUDE.md` |
| skills | on-demand の手順書 | `/fe-kickoff`・`/design-order`・`/mock-freeze` |
| docs | 参照知識 | `docs/` 5 本（発注書から必須参照でリンク） |

## License

MIT
