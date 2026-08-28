# Walking Skeleton — day-0 立ち上げ手順

新規プロジェクトが画面量産に入る前に整えることの全て。本書の checklist と「一周」を完了してから、画面追加の定常ループ (seed-docs/screen-loop.md) へ進む。立ち上げは /fe-kickoff が案内する。

## 前提

この seed は次の構成を前提とする。

- web FE (SvelteKit・frontend/。依存導入と local 実行は bun) + Claude Design mock 正本 (docs/presentation/ui-mock/) + Playwright 検証 harness (pp/)
- モバイルファースト: mobile viewport が第一正本、desktop が第二正本

## 轍 → day-0 対策

前プロジェクトが授業料を払った失敗と、この seed に組み込んだ対策。左列の状況に心当たりが出たら、右列を跳ばしていないか疑う。

| # | 轍の本質 | day-0 対策 (この seed の対応物) |
|---|---|---|
| 1 | mock なしで実装を重ね、UI 品質が収束しなかった | mock-first を DoD に: mock 完成宣言 → 凍結 (/mock-freeze) が着工条件 (docs/ui-quality-policy.md) |
| 2 | 検証 harness を後付けし、実装収束後に篩を新設する羽目になった | walking skeleton: 最初の 1 部品で全経路を一周してから量産 (本書後半) |
| 3 | ページ単位実装で同一部品が複数実装に分裂し、色が重複定義された | 部品先行: frontend/src/lib/ui/ + 単体 fixture。page は薄い composition (frontend/src/routes/) |
| 4 | 描画から実測した端数 px を実装に固定し、壊れた描画への合わせ込みになった | 構造契約 (token / clamp / %) を最初から規約に (docs/pixel-perfect.md) |
| 5 | 検証 gate の突合先が旧 mock・古いデータへドリフトし、その間の逸脱を検出できなかった | export 凍結 + sha256 provenance pin + mock-provenance spec を画面 1 枚目から (docs/presentation/ui-mock/) |
| 6 | 既定状態しか見ず、空状態・操作後・長文のバグ群を見逃した | states fixture を部品の完成条件に + width-sweep / poststate-sweep を定常 gate に (pp/) |
| 7 | mock との意図的差分を口頭運用し、裁定が失われて再発した | KEEP_IMPL 台帳を空で設置し、日付付き裁定のみ記録 (docs/presentation/ui-mock/DESIGN-POLICY.md) |
| 8 | mock と検証データの二重管理でフィールド欠落・ドリフトが起きた | fixture は API schema 派生の単一データセット。mock と test が同源参照 (seed-docs/screen-loop.md ⑤) |
| 9 | 意味論バグ (値の不整合・機能しない操作) が機械検証をすり抜けた | LLM スクショ一次レビュー + 人間受入を機械 gate と別立てで常設 (seed-docs/screen-loop.md ⑧) |
| 10 | 完成後の部品化・ライブラリ分離は高コストだった | design-system project を PJ 開始時に新設し、mock を最初から部品ライブラリで組む (下記「Claude Design 2 project 体制」) |

## Day-0 チェックリスト

画面を 1 枚も作る前に、上から順に完了させる。

### 1. 検証条件の固定

- 基準 viewport 2 点: mobile 390×844 (第一正本・DPR 2–3・touch) / desktop 1280×800 (第二正本)。数値は例 — 各 PJ が pp/src/config.ts で確定する
- 基準 2 点の間と外側 (`SWEEP_WIDTHS` の下限〜上限) は連続幅スイープで invariant 検証する — 基準幅と違い、崩れないことだけを見る
- フォントは同梱する (検証中の CDN 取得は pp/src/net-block.ts が abort する)。ただし day-0 で決めるのは「同梱する」という条件だけ — 書体の選定は design system の出力なので、実体の取得と tokens.css の --font-sans 差し替えは mock 確定後 (下の一周「vendor 化」) に行う
- 時計・locale・DPR・touch は pp/src/config.ts の context options で明示固定する (UA まで固定したい場合は devices preset に置き換える)

### 2. repo 骨格の確認

```text
docs/presentation/ui-mock/   mock 正本。export/ (凍結 export)・mock-baseline.sha256 (台帳)・
                    DESIGN-POLICY.md (KEEP_IMPL 台帳)・README.md (凍結手順)
frontend/           SvelteKit app。src/lib/ui/tokens/tokens.css・src/lib/ui/components/・src/routes/
pp/                 parity harness。基準 viewport は pp/src/config.ts で差し替え
docs/presentation/ui-ast/    UI AST 正本。schema 2 本・registry.json (共通語彙)・screens/ (画面別)
docs/               規約 5 本 (ui-quality-policy / pixel-perfect / design-sync / ui-caveats / ast-layer)
tools/design_sync   Claude Design との同期 (環境変数 DESIGN_PROJECT_ID で project 指定)
tools/ast_validate  AST の機械 gate。ast-tree / ast-viewer は裁定用の可視化
seed-docs/          本書ほかプロセス文書
.claude/            project skills (/fe-kickoff・/design-order・/mock-freeze・/ast-extract)
```

### 3. 依存の導入

**`frontend/` も `pp/` も bun で導入する** (lockfile は `bun.lock` の 1 種類)。host に bun があり既定 cache も書けるなら、この形で足りる。

```bash
bun install --cwd frontend
bun install --cwd pp
```

`pp/` の spec を走らせるのは Playwright で、こちらは Node 向けに固定してある。**導入は bun、実行は Node** という分担で、混ぜても壊れない (`pp/README.md` setup 節)。

**どちらかが満たせない環境では下の形を使う。** 満たしているかは打ってみれば分かる — bun が無ければ `command not found`、cache が書けなければ EROFS で落ちる。

既定の cache 先へ書けない環境（sandbox 等）では、cache を repo-local へ振る。置き場は `tools/toolchain-dir` が決める（main repo 側を優先し、書けなければ worktree 側へ退避する）。

```bash
DRAFTS="$(tools/toolchain-dir)"
# host に bun が無い環境では下で落とす実体を使う（PATH には載らない）
BUN="$(command -v bun || echo "$DRAFTS/bun/bun-linux-x64/bun")"
BUN_INSTALL_CACHE_DIR="$DRAFTS/bun/cache" "$BUN" install --cwd frontend
BUN_INSTALL_CACHE_DIR="$DRAFTS/bun/cache" "$BUN" install --cwd pp
```

host に bun が無くても、Playwright browser と同じく repo-local に置けば足りる (実体は gitignore 下・installer は配らない)。先に下の取得を済ませてから上を実行する。

```bash
BUN_DIR="$(tools/toolchain-dir)/bun"
mkdir -p "$BUN_DIR"
curl -fsSL -o "$BUN_DIR/bun.zip" https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip
unzip -qo "$BUN_DIR/bun.zip" -d "$BUN_DIR"
"$BUN_DIR/bun-linux-x64/bun" --version
```

bun の version は固定しない — 機械 gate は bun を呼ばず (pp は Node + Playwright 固定)、依存の再現性は commit 済みの `frontend/bun.lock` が担う。

### 4. Claude Design 2 project 体制

- **design-system 型 project** (部品ライブラリ) を新設する。publish すると org の新規 project に自動適用される — これは公式メカニズムで、手動で参照させるのではない
- **mock 用の通常 project** は作成時に design system を継承する。「部品から組まれた mock」が既定挙動になる
- 初回プロンプトと運用の注意は seed-docs/first-prompts.md
- export に design system の見本 page が混ざることがある。凍結はするが実装対象の画面には数えない（docs/presentation/ui-mock/README.md の「デザインシステム page が混ざっている場合」）

### 5. 台帳・規約 docs の確認

- KEEP_IMPL 台帳 (docs/presentation/ui-mock/DESIGN-POLICY.md) が空台帳として在ること
- docs/ の 5 本を読み、PJ 固有の差し替え点 (意味色の名前・語彙など) を埋めること

### 6. 発注規約 1 枚の準備

- seed-docs/design-order-template.md をプロダクトに合わせて差し替える。Claude Design へ持ち込む規約はこの 1 枚だけ (docs/ は repo 側の規約であり持ち込まない)

## walking skeleton 一周

最初の 1 部品で mock → 実装 → 検証の全経路を通し、harness が本当に動くことを証明する。

1. **mock**: design system の基礎部品 1 つを含む最小画面を Claude Design で作る (seed-docs/first-prompts.md)
2. **凍結**: /mock-freeze で export 一式を docs/presentation/ui-mock/export/ へ置き、sha256 を docs/presentation/ui-mock/mock-baseline.sha256 に pin する
3. **vendor 化**: `bun run lint:mock` が挙げる外部参照 (フォント・JS ライブラリ) を pp/vendor へ落として `pp/vendor/routes.json` に登録し、取得コマンドを pp/vendor/README.md へ記録する。フォントはここで tokens.css の --font-sans も差し替える
4. **部品実装**: frontend/src/lib/ui/components/ に、token (frontend/src/lib/ui/tokens/tokens.css) 参照で実装する
5. **states fixture**: default / empty / loading / error / 長文 + touch 操作を単体 fixture で揃える
6. **parity**: /ast-extract で screen AST を起こす (SELECTOR_MAP はそこから導出される)。導けない対だけ pp の MANUAL_PAIRS に書き、ast-provenance・ast-conformance・sample-parity を緑にする
7. **sweep + 回帰**: width-sweep / poststate-sweep / self-baseline / mock-provenance を全て実行して緑にする (self-baseline は初回 `--update-snapshots` で baseline を生成し、再実行で緑を確認する)。生成された `pp/tests/*-snapshots/` の PNG は **commit する** — 追跡しないと clone や新しい worktree で毎回再生成され、比較対象が無いまま緑になる (詳細は pp/README.md)

完了条件: 全 gate が「skip ではなく実行されて緑」。1 spec でも未検証の skip を残したまま「一周した」と宣言しない。ここまで緑になって初めて画面量産 (seed-docs/screen-loop.md) に入る。

例外は 1 つだけ。**その画面に検査対象の部品がそもそも無い** gate は、`pp/gate-not-applicable.json` に画面・日付・理由を書いて宣言すれば skip のまま通る (詳細は pp/README.md)。無い部品を作って gate を通すのは轍 #4 と同型なので採らない。

## モバイルファースト調整 5 点

1. **基準 viewport は 2 点**: mobile を第一正本、desktop を第二正本として pixel 級検証。間と外は連続幅スイープの invariant 検証とし、離散多点の pixel parity は採らない (検出力が低い)
2. **mock は単一レスポンシブ HTML**: 幅別に別 mock を作らせない。幅別 2 mock 体制は二重管理ドリフト (轍 #8 と同型) の再発源。「`SWEEP_WIDTHS` の下限〜上限で成立させる」を発注要件に含める (seed-docs/design-order-template.md 項目 1)
3. **CSS 規約**: page shell = @media (viewport 基準) / 部品 = @container (置かれた幅基準) / 内容 = intrinsic sizing。breakpoint 急変点は境界 ±1px のスイープで検証する
4. **入力モダリティを fixture の軸に**: touch target 44px・hover 非存在でも操作完結・safe area。hover 依存 UI は部品単体 fixture の段階で検出する
5. **device emulation を機械 gate に**: DPR・touch を pp/src/config.ts の context options で明示固定して pp を回す (UA 固定が要るなら devices preset に置き換える)。実機確認は受入段 (screen-loop.md ⑧) のみ
