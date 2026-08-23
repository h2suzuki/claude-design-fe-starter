---
name: fe-kickoff
description: Day-0 setup runbook for starting a mock-first FE project from this seed.
when_to_use: TRIGGER when starting a new project generated from this seed, when copy-in installing the seed into an existing repo, or when "day-0 セットアップ" is requested. SKIP after the walking skeleton has completed once.
---

# FE Kickoff

seed からの立ち上げを day-0 手順で完走させる。詳細手順の正は `seed-docs/walking-skeleton.md`。

## Process

1. 導入形態を確認する: template 生成済みならそのまま。既存 repo への後付けなら対象 repo で `tools/install.sh` を実行する（引数省略で cwd。内容の違う既存 file に当たったら何も書かずに停止し対象を列挙するので、置き換える判断をしたときだけ `--overwrite` を付ける。最後に未 commit の seed path をまとめて commit するか 1 キーで聞かれる — `y` / `Y` だけが進み、他のキーは即 cancel）
2. 既に動いている実装がある repo なら `seed-docs/adoption.md` を先に読む（worktree で main を凍結したまま作り替える・既存実装は参照資料に留める・段階移行の順序）
3. `seed-docs/walking-skeleton.md` を読み、Day-0 チェックリストを Task 登録する
4. 依存を導入する: `frontend/` は `bun install`、`pp/` は `npm install`（pp は Node + Playwright 固定）。pp では Playwright browser も導入する（コマンドと環境注意は `pp/README.md` の setup 節）
5. 検証条件を確定する: `pp/src/config.ts` の基準 viewport 2 点・locale/timezone・固定時刻
6. Claude Design の 2 project 体制を用意する（design-system 型 = 部品ライブラリ、通常 = mock 用）。**これは輸送の話ではなく設計の話**で、mock を最初から部品ライブラリで組ませるための轍 #10 対策なので、export をどう受け取るかに関わらず要る。repo が project を直接触る運用なら環境変数 `DESIGN_PROJECT_ID` も設定する — ユーザーから export 一式を受け取る運用ならこの環境変数は不要で、project の用意はユーザー側で完結する（取得経路は `docs/presentation/ui-mock/README.md`）
7. 発注規約 1 枚を用意する（/design-order が `seed-docs/design-order-template.md` から組み立てる）
8. `{{...}}` placeholder を grep で列挙し、残る差し替え点を確定させる（`frontend/src/app.html` の `{{PRODUCT_NAME}}` を含む）
9. walking skeleton を一周する: 最初の 1 部品で mock → /mock-freeze → 実装 → parity → sweep。pp の skip が全て外れて緑になってから画面量産に入る

## Rules

- mock 承認前に UI 実装へ入らない（CLAUDE.md の mock-first 原則）
- 一周が終わるまで画面を増やさない — 検証 harness の後付けは高くつく
- skip された gate を「合格」と報告しない

## Related

- `design-order` — Claude Design への発注文の組み立て
- `mock-freeze` — export 凍結 + sha256 pin
