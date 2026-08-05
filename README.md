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
├── docs/              規約 4 docs（ui-quality-policy / pixel-perfect / design-sync / ui-caveats）
├── .claude/           project skills（/fe-kickoff・/design-order・/mock-freeze）+ 機械判定 hook 2 本
├── design-reference/  mock 凍結置き場（export + screenshots + sha256 台帳 + KEEP_IMPL 台帳）
├── frontend/          vite skeleton（src/ui/{tokens,components} + src/pages）
├── pp/                parity harness（dump / diff / sweep / self-baseline / provenance）
├── tools/             design_sync（Claude Design 同期）+ install.sh（既存 repo への copy-in）
└── seed-docs/         プロセス文書（walking-skeleton / screen-loop / design-order-template / first-prompts）
```

## 使い方

新規プロジェクト（基本形）:

1. GitHub の「Use this template」で repo を生成する
2. Claude Code で `/fe-kickoff` を実行し、day-0 セットアップ（`seed-docs/walking-skeleton.md`）を進める
3. 最初の 1 部品で mock → 凍結 → 実装 → parity → sweep を一周させてから画面量産に入る

既存 repo への後付け導入（BE 先行 repo 等）:

```bash
git clone --depth 1 https://github.com/h2suzuki/claude-design-fe-starter /tmp/fe-seed
/tmp/fe-seed/tools/install.sh .
```

installer は追加のみ（既存ファイルは上書きしない・冪等）。詳細は `SEED-CONTRACT.md`。

生成後に seed 側の改善を取り込むときは installer を再実行するのではなく、`git remote add seed <この repo の URL>` して必要 commit を `git cherry-pick` する（PJ 側で placeholder を差し替えている前提のため、一括上書きの機構は持たない）。

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
