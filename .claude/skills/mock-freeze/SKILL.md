---
name: mock-freeze
description: Freeze an approved Claude Design export into docs/presentation/ui-mock with a sha256 provenance pin.
when_to_use: TRIGGER when the user declares a mock complete, when an export needs re-freezing, or when a provenance/baseline mismatch is reported. SKIP while the mock is still under revision in Claude Design.
---

# Mock Freeze

承認済み mock export を `docs/presentation/ui-mock/export/` へ凍結し、sha256 台帳で出所を pin する。手順の正は `docs/presentation/ui-mock/README.md`。

## Process

1. ユーザーの完成宣言を確認する（宣言前に凍結しない）
2. export を取得する。byte を逐語保存する（整形・切詰め・末尾改行の増減なし）。経路は 2 つあり、以降の gate はどちらでも変わらない
   - **project 経由**: `tools/design_sync fetch`（要 `DESIGN_PROJECT_ID`）または DesignSync tool
   - **受け取り**: ユーザーから export 一式（zip 等）を受け取る。`design_sync verify` による再照合は使えないので、突合先の出所は sha256 台帳だけが担う

   取得 API には size cap がある（DesignSync の `get_file` は 256 KiB）。資産を inline した export は容易に超えるので、**切れたものを掴んでいないか台帳へ pin する前に確かめる**。`design_sync` 経由なら記録された `truncated` 列と byte 数を見る。どちらの経路でも手順 9 の `npm run lint:mock`（MOCK103）が閉じタグの欠落を機械検出する。切れた export を凍結すると、台帳は「取得物と一致する」ことしか保証しないので gate は緑のまま突合先だけが壊れる
3. 取得物を `docs/presentation/ui-mock/export/` へ配置する。編集 gate が Edit/Write を block するため、配置は cp 等の Bash で行う
4. 閉包を実測して集合を確定する: `npm --prefix pp run mock:closure`。読まれなかった file は `export/` から外し、取りこぼしが挙がれば足す（外部 embed は閉包に入らないので取りこぼしと分けて報告される）。取りこぼし 0 件になるまで先へ進まない
5. 2 回目以降は、前版との差分を `git diff --no-index --word-diff=plain <前版> <新版>` で棚卸しし、依頼した変更・依頼していない変更に仕分ける。後者は採るか差し戻すかを決めてから進む
6. mock 自身の破れを出す: `npm --prefix pp run mock:integrity`（引数なしで `export/` の全画面。横スクロール・はみ出し・操作要素の重なり・画面間の値の割れ・dialog の収まり）。1 件でも挙がれば mock を直してから凍結する。検査の範囲は `docs/presentation/ui-mock/README.md` 手順 6
7. 参照スクショを撮る: `npm --prefix pp run mock:screenshots`（引数なしで `export/` の全画面。資産の 404 と abort があれば落ちる）
8. 台帳を更新する（.gitkeep 除外・空白名安全）:

   ```bash
   (cd docs/presentation/ui-mock && find export -type f ! -name .gitkeep -print0 | sort -z | xargs -0 sha256sum > mock-baseline.sha256)
   (cd docs/presentation/ui-mock && sha256sum --check --quiet mock-baseline.sha256)
   ```

9. `pp/` で `npm run lint:mock` と `npm run test:provenance` を実行し、緑を確認してから export と台帳を同一 commit にする

## Rules

- 凍結後の export は直接編集しない — 変更は Claude Design 側 → 再 export → 再凍結
- Claude Design へ push した後は `tools/design_sync verify` で再取得し、repo と SHA-256 一致を確認する（`docs/design-sync.md`）。受け取り経路で凍結した場合はこの照合が無いので、再凍結のたびに台帳を更新して出所を保つ
- 台帳と export の不一致は commit gate（check-mock-baseline hook）が止める。台帳だけ・実体だけの commit を作らない

## Related

- `design-order` — mock 修正を Claude Design へ依頼する側の手順
- `fe-kickoff` — 凍結第 1 号を含む walking skeleton 全体
