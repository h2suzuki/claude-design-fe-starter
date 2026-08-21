# Walking Skeleton — day-0 立ち上げ手順

新規プロジェクトが画面量産に入る前に整えることの全て。本書の checklist と「一周」を完了してから、画面追加の定常ループ (seed-docs/screen-loop.md) へ進む。立ち上げは /fe-kickoff が案内する。

## 前提

この seed は次の構成を前提とする。

- web FE (vite・frontend/) + Claude Design mock 正本 (docs/presentation/ui-mock/) + Playwright 検証 harness (pp/)
- モバイルファースト: mobile viewport が第一正本、desktop が第二正本

## 轍 → day-0 対策

前プロジェクトが授業料を払った失敗と、この seed に組み込んだ対策。左列の状況に心当たりが出たら、右列を跳ばしていないか疑う。

| # | 轍の本質 | day-0 対策 (この seed の対応物) |
|---|---|---|
| 1 | mock なしで実装を重ね、UI 品質が収束しなかった | mock-first を DoD に: mock 完成宣言 → 凍結 (/mock-freeze) が着工条件 (docs/ui-quality-policy.md) |
| 2 | 検証 harness を後付けし、実装収束後に篩を新設する羽目になった | walking skeleton: 最初の 1 部品で全経路を一周してから量産 (本書後半) |
| 3 | ページ単位実装で同一部品が複数実装に分裂し、色が重複定義された | 部品先行: frontend/src/ui/ + 単体 fixture。page は薄い composition (frontend/src/pages/) |
| 4 | 描画から実測した端数 px を実装に固定し、壊れた描画への合わせ込みになった | 構造契約 (token / clamp / %) を最初から規約に (docs/pixel-perfect.md) |
| 5 | 検証 gate の突合先が旧 mock・古いデータへドリフトし、その間の逸脱を検出できなかった | export 凍結 + sha256 provenance pin + mock-provenance spec を画面 1 枚目から (docs/presentation/ui-mock/) |
| 6 | 既定状態しか見ず、空状態・操作後・長文のバグ群を見逃した | states fixture を部品の完成条件に + width-sweep / poststate-sweep を定常 gate に (pp/) |
| 7 | mock との意図的差分を口頭運用し、裁定が失われて再発した | KEEP_IMPL 台帳を空で設置し、日付付き裁定のみ記録 (docs/presentation/ui-mock/DESIGN-POLICY.md) |
| 8 | mock と検証データの二重管理でフィールド欠落・ドリフトが起きた | fixture は API schema 派生の単一データセット。mock と test が同源参照 (seed-docs/screen-loop.md ④) |
| 9 | 意味論バグ (値の不整合・機能しない操作) が機械検証をすり抜けた | LLM スクショ一次レビュー + 人間受入を機械 gate と別立てで常設 (seed-docs/screen-loop.md ⑦) |
| 10 | 完成後の部品化・ライブラリ分離は高コストだった | design-system project を PJ 開始時に新設し、mock を最初から部品ライブラリで組む (下記「Claude Design 2 project 体制」) |

## Day-0 チェックリスト

画面を 1 枚も作る前に、上から順に完了させる。

### 1. 検証条件の固定

- 基準 viewport 2 点: mobile 390×844 (第一正本・DPR 2–3・touch) / desktop 1280×800 (第二正本)。数値は例 — 各 PJ が pp/src/config.ts で確定する
- 基準 2 点の間と外側 (320〜1920) は連続幅スイープで invariant 検証する
- フォント同梱 (実体 = pp/vendor に取得記録つきで置き、frontend/src/ui/tokens/tokens.css の --font-sans を差し替える)
- 時計・locale・DPR・touch は pp/src/config.ts の context options で明示固定する (UA まで固定したい場合は devices preset に置き換える)

### 2. repo 骨格の確認

```text
docs/presentation/ui-mock/   mock 正本。export/ (凍結 export)・mock-baseline.sha256 (台帳)・
                    DESIGN-POLICY.md (KEEP_IMPL 台帳)・README.md (凍結手順)
frontend/           vite app。src/ui/tokens/tokens.css・src/ui/components/・src/pages/
pp/                 parity harness。基準 viewport は pp/src/config.ts で差し替え
docs/               規約 4 本 (ui-quality-policy / pixel-perfect / design-sync / ui-caveats)
tools/design_sync   Claude Design との同期 (環境変数 DESIGN_PROJECT_ID で project 指定)
seed-docs/          本書ほかプロセス文書
.claude/            project skills (/fe-kickoff・/design-order・/mock-freeze)
```

### 3. Claude Design 2 project 体制

- **design-system 型 project** (部品ライブラリ) を新設する。publish すると org の新規 project に自動適用される — これは公式メカニズムで、手動で参照させるのではない
- **mock 用の通常 project** は作成時に design system を継承する。「部品から組まれた mock」が既定挙動になる
- 初回プロンプトと運用の注意は seed-docs/first-prompts.md

### 4. 台帳・規約 docs の確認

- KEEP_IMPL 台帳 (docs/presentation/ui-mock/DESIGN-POLICY.md) が空台帳として在ること
- docs/ の 4 本を読み、PJ 固有の差し替え点 (意味色の名前・語彙など) を埋めること

### 5. 発注規約 1 枚の準備

- seed-docs/design-order-template.md をプロダクトに合わせて差し替える。Claude Design へ持ち込む規約はこの 1 枚だけ (docs/ は repo 側の規約であり持ち込まない)

## walking skeleton 一周

最初の 1 部品で mock → 実装 → 検証の全経路を通し、harness が本当に動くことを証明する。

1. **mock**: design system の基礎部品 1 つを含む最小画面を Claude Design で作る (seed-docs/first-prompts.md)
2. **凍結**: /mock-freeze で standalone HTML export を docs/presentation/ui-mock/export/ へ置き、sha256 を docs/presentation/ui-mock/mock-baseline.sha256 に pin する
3. **部品実装**: frontend/src/ui/components/ に、token (frontend/src/ui/tokens/tokens.css) 参照で実装する
4. **states fixture**: default / empty / loading / error / 長文 + touch 操作を単体 fixture で揃える
5. **parity**: pp の SELECTOR_MAP に部品を登録し、sample-parity spec を緑にする
6. **sweep + 回帰**: width-sweep / poststate-sweep / self-baseline / mock-provenance を全て実行して緑にする (self-baseline は初回 `--update-snapshots` で baseline を生成し、再実行で緑を確認する)

完了条件: 全 gate が「skip ではなく実行されて緑」。1 spec でも skip のまま「一周した」と宣言しない。ここまで緑になって初めて画面量産 (seed-docs/screen-loop.md) に入る。

## モバイルファースト調整 5 点

1. **基準 viewport は 2 点**: mobile を第一正本、desktop を第二正本として pixel 級検証。間と外は連続幅スイープの invariant 検証とし、離散多点の pixel parity は採らない (検出力が低い)
2. **mock は単一レスポンシブ HTML**: 幅別に別 mock を作らせない。幅別 2 mock 体制は二重管理ドリフト (轍 #8 と同型) の再発源。「320〜1920 で成立させる」を発注要件に含める (seed-docs/design-order-template.md 項目 1)
3. **CSS 規約**: page shell = @media (viewport 基準) / 部品 = @container (置かれた幅基準) / 内容 = intrinsic sizing。breakpoint 急変点は境界 ±1px のスイープで検証する
4. **入力モダリティを fixture の軸に**: touch target 44px・hover 非存在でも操作完結・safe area。hover 依存 UI は部品単体 fixture の段階で検出する
5. **device emulation を機械 gate に**: DPR・touch を pp/src/config.ts の context options で明示固定して pp を回す (UA 固定が要るなら devices preset に置き換える)。実機確認は受入段 (screen-loop.md ⑦) のみ
