# pixel-perfect 合わせ込みの手法

本書は、mock と app の視覚一致（pixel-perfect、以下 pp）を合わせ込む際の手法を定める。
読者は、pp 整合の発注書を書く者と、それを実行する実装者である。
pp 検証の実行手順は `pp/README.md` を、
意図的差分の台帳は `design-reference/DESIGN-POLICY.md` を正とする（§4）。

## 1. 失敗事例: 圧縮された mock 描画への合わせ込み

以下は前 PJ で実際に起きた事例であり、普遍的な教訓として内容を保って残す。

前 PJ の commit 66f9269（2026-07-25）は、次の経緯で app の設計意匠を破壊した。
再発防止のため、本書全体の判断基準としてここに固定する。

1. 当時の pp harness は再現性のため viewport を 1440×900 の 1 点に固定していた
   （本 repo で viewport を定める場所は `pp/src/config.ts`）。
2. この固定 viewport では、対象一覧画面の mock は本来の幅より圧縮されて描画される。
3. 実装者はこの圧縮された描画を `getBoundingClientRect` で実測し、
   端数値（銘柄列 `120.21875px` 等）を app の CSS へ固定転記した。
4. その結果、ユーザー指示の列幅契約 — 銘柄列 `clamp(190px, 14%, 280px)` が余白を吸収する
   fluid ellipsis（伸縮して余白を使い、溢れは省略記号で切る）と table の `min-width: 1536px` —
   が破棄され（`min-width` は viewport 幅と同じ `1440px` へ変更）、銘柄名が読めなくなった。
5. pp テストは全 pack 緑のまま、この意匠破壊を検出しなかった。

mock は Claude Design の広幅表示では正常であり、「mock が悪い」のではない。
誤りは「圧縮された描画を実測し、その計測値へ app を合わせた手法」にある。

## 2. 原則

### 2.1 計測妥当性 gate

app を mock へ合わせる前に、比較 viewport での mock 描画が設計意匠
（Claude Design 上の見え方）と一致することを、参照スクリーンショットで検証する。
圧縮、フォント欠落、部分レンダリング等で壊れた描画は、合わせ込みの入力として使わない。

### 2.2 構造一致

合わせるのは CSS 契約 — `clamp`、`%`、`flex`、`table-layout` といった規則そのもの — である。
実行時計測ピクセルの転記は禁止する。
diff に端数ピクセル（例: `120.21875px`）が現れたら、計測値転記の red flag として手を止める。

### 2.3 KEEP_IMPL 経路

app 側がユーザー指示で mock より良くなっている箇所は、黙って mock へ戻さない。
`design-reference/DESIGN-POLICY.md` の KEEP_IMPL 台帳へ登録し、
pp テストは delta pin（既知差分を期待値としてテスト側に固定する手法）で吸収する。
前 PJ ではパネル差分の維持や固定 delta の pin がこの経路で台帳へ登録され、
§1 の列幅契約も同じ経路で登録された。
mock 追随の変更を書く前に、git 履歴とユーザー裁定の記録を照合する。

### 2.4 多視点検証（基準 2 点 + 連続スイープ）

基準 viewport は 2 点とする: mobile 390×844（第一正本・DPR 2–3・touch emulation）と
desktop 1280×800（第二正本）。数値は例であり、PJ の実値は `pp/src/config.ts` で差し替える。
基準 2 点では structural pixel 一致を検証し、間と外（下限 320〜上限 1920）は
連続幅スイープで invariant（崩れ・衝突・欠落・横スクロール無し）を検証する。
§1 の失敗が示すとおり単一 viewport 固定は圧縮描画への合わせ込みを見逃すため、
多視点検証は連続スイープが担う。構造一致は任意の幅で保たれなければならない。
viewport 固有のテスト pin は pp テスト側に閉じ、app の CSS に viewport 固有の値を持ち込まない。

## 3. 発注書チェックリスト

pp 整合を委譲する際は、次を発注書へそのまま転記する。

禁止:

- 実測ピクセル値の CSS への転記
- ユーザー指示契約（`clamp`・fluid 等）の縮退
- `design-reference/DESIGN-POLICY.md` 未照合の mock 追随
- 「テスト緑 = 完了」判定（緑でも意匠破壊はあり得る）

必須証跡:

- [ ] 比較 viewport での mock 参照スクリーンショットと、その妥当性判定
- [ ] before / after の app スクリーンショット（基準 2 viewport 分）
- [ ] KEEP_IMPL 台帳との照合結果

レビュー red flags:

- 端数 px 値の diff
- `min-width` が viewport 幅と一致する変更
- `clamp` や `%` の px 固定化

## 4. 関連文書

| 文書 | 役割 |
| --- | --- |
| `design-reference/DESIGN-POLICY.md` | 意図的差分の台帳（what） |
| 本書 | 合わせ込みの手法（how） |
| `pp/README.md` | pp 実行の正規手順 |
