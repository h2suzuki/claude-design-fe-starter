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

という順序を day-0 から強制するための seed。前プロジェクトで実証済みの検証ハーネスと規約文書から、ドメイン固有部を除去して汎用化した。前提はモバイルファースト（基準 viewport = mobile 390×844 + desktop 1280×800 の 2 点、320〜1920 は幅スイープ = 多点サンプリング + breakpoint 境界で invariant 検証）。

## 構成

```text
├── CLAUDE.md          mock-first 行動規範（数行・outcome 原則のみ）
├── docs/              規約 5 docs（ui-quality-policy / pixel-perfect / design-sync / ui-caveats / ast-layer）
├── .claude/           project skills（/fe-kickoff・/design-order・/mock-freeze・/ast-extract）+ 機械判定 hook 2 本
├── docs/presentation/ui-mock/  mock 凍結置き場（export + screenshots + sha256 台帳 + KEEP_IMPL 台帳）
├── docs/presentation/ui-ast/   UI AST 置き場（schema 2 本 + registry.json + screens/）
├── frontend/          SvelteKit skeleton（$lib/ui/{tokens,components} + src/routes、依存導入は bun）
├── pp/                parity harness（dump / diff / sweep / self-baseline / provenance）
├── tools/             design_sync（Claude Design 同期）+ ast_validate / ast-tree / ast-viewer（AST gate と可視化）+ install.sh（既存 repo への copy-in）
└── seed-docs/         プロセス文書（adoption / walking-skeleton / screen-loop / design-order-template / first-prompts）
```

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

対象 dir は相対パスでよく、省略すると cwd になる。前回 install のまま触られていないファイルは黙って新版へ入れ替わり、**PJ が手を入れたファイル**に当たったときだけ何も書かずに停止して対象を列挙する（置き換えたい場合だけ `--overwrite`）。最後に配った path の commit を `[Y/n]` で聞く（`--commit` / `--no-commit` で固定でき、辞退しても再実行で同じ確認に戻る）。詳細は `SEED-CONTRACT.md`。

既に動いている実装がある repo（BE 先行・旧 FE あり等）は、導入後にまず `seed-docs/adoption.md` を読む（worktree で main を凍結したまま作り替える手順・既存実装を参照資料として扱う規律・段階移行の順序）。

導入後はそのまま `/fe-kickoff` で day-0 を進める（project skills は自動 hot-reload される。認識されないときは `/reload-skills`、hooks 登録を含む settings の変更が効かないときのみ再起動）。`.claude/settings.json` が既存だった場合は、hooks の手動 merge を先に行う（installer が NOTE で知らせる）。

## mock を更新したとき

1. 修正は Claude Design 側で行う（構造変更 = chat / 部品単位の指摘 = inline comment / 微調整 = canvas 直接編集）
2. 完成宣言 → `/mock-freeze` で再凍結する（export 差し替えと sha256 台帳更新を同一 commit に）
3. 対象画面の KEEP_IMPL 台帳（`docs/presentation/ui-mock/DESIGN-POLICY.md`）を走査し、裁定済みの実装表示を mock へ反映して entry を閉じる — 台帳は縮小方向が定常（放置すると mock と実装が乖離し続ける）
4. pp を再実行して新 mock 基準で全 gate を緑へ（SELECTOR_MAP・spec の追随を含む）。残る差分は実装修正か新規裁定の 2 択

詳細は `docs/design-sync.md`（同期経路・台帳運用）。

## seed との往復（更新の運び方）

- **seed → PJ**: `git remote add seed <この repo の URL>` して必要 commit を `git cherry-pick` する（PJ 側で placeholder を差し替えている前提のため、一括上書きの機構は持たない）
- **PJ → seed**: pp harness 等の汎用部を強化・修正したら seed へ back-port する。運ぶのは機構（`pp/src`・spec の骨格・`pp/scripts`・`tools/`）だけで、PJ 固有物（SELECTOR_MAP の中身・fixture・screen 定義・差し替え済み placeholder）は運ばない。cherry-pick がそのまま当たらない場合は手動で port し、出典 commit を message に記す
- 共通部の package 化（npm 等）は 3 プロジェクト目まで見送る（rule of three）

## 設計原則: 強制の階層

モデルの自由度を保ちつつ成果物を機械検証する。上の層ほど優先。

| 層 | 置くもの | この seed での実体 |
|---|---|---|
| テスト/CI | FE の不変条件ほぼ全部 | `pp/` の parity・sweep・provenance・self-baseline |
| hooks | 機械判定できる少数の門だけ | 凍結 mock の編集 block・commit 前の sha256 照合の 2 本 |
| CLAUDE.md | outcome 原則の数行 | `CLAUDE.md` |
| skills | on-demand の手順書 | `/fe-kickoff`・`/design-order`・`/mock-freeze` |
| docs | 参照知識 | `docs/` 4 本（発注書から必須参照でリンク） |

## License

MIT
