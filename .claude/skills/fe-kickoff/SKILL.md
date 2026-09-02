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
4. 依存を導入する: `frontend/` も `pp/` も bun（lockfile は `bun.lock` に統一。spec を走らせるのは Node 向けに固定した Playwright で、導入と実行の分担が違う）。**コマンドを素で打たず `seed-docs/walking-skeleton.md` §3 と `pp/README.md` setup 節の形で実行する** — host に bun が無い環境と既定 cache が書けない環境があり、置き場は `tools/toolchain-dir` が決める。Playwright browser の導入も setup 節に含まれる
5. 検証条件を確定する: `pp/src/config.ts` の基準 viewport 2 点・locale/timezone・固定時刻・app の mount 点。画面ごとの route・セレクタ・操作は `pp/src/screens.ts` へ、凍結した画面から順に登録する
6. Claude Design の 2 project 体制を用意する（design-system 型 = 部品ライブラリ、通常 = mock 用）。**これは輸送の話ではなく設計の話**で、mock を最初から部品ライブラリで組ませるための轍 #10 対策なので、export をどう受け取るかに関わらず要る。環境変数 `DESIGN_PROJECT_ID` は、export をユーザーから受け取る運用なら **day-0 の時点では要らない**（取得経路は `docs/presentation/ui-mock/README.md`）。「以後ずっと不要」ではない — 実装を mock へ書き戻す段（`docs/design-sync.md` の push back、`seed-docs/first-prompts.md` の実装済み部品への置換）は `tools/design_sync` を通り、project アクセスを要求する。受け取りで済むのは **intake の片道だけ**である
7. 発注規約 1 枚を用意する（/design-order が `seed-docs/design-order-template.md` から組み立てる）
8. `{{...}}` placeholder を grep で列挙し、残る差し替え点を確定させる（`frontend/src/app.html` の `{{PRODUCT_NAME}}` を含む）
9. walking skeleton を一周する: 最初の 1 部品で mock → /mock-freeze → 実装 → parity → sweep。pp の skip が全て外れて緑になってから画面量産に入る

## Rules

- mock 承認前に UI 実装へ入らない（CLAUDE.md の mock-first 原則）
- 一周が終わるまで画面を増やさない — 検証 harness の後付けは高くつく
- skip された gate を「合格」と報告しない
- deploy する PJ では、promote 直後の smoke 3 項目（API 応答の内容 / 保存する状態のリロード / history の往復、`seed-docs/screen-loop.md` ⑩）を通すまで完了と報告しない

## Related

- `design-order` — Claude Design への発注文の組み立て
- `mock-freeze` — export 凍結 + sha256 pin
