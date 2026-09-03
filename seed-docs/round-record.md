# 巡ごとの統計（round record）

screen-loop を全画面ぶん回した 1 回を **1 巡** と呼び、その巡の主要な実測値を `docs/presentation/ui-mock/rounds/<n>.json`（機械可読）と `<n>.md`（人が読む）に残す。session の記憶や chat の報告は消えるが、この file は commit に載って残る。書くのは `bun run --cwd pp round:record <n>` で、入力は既にある成果物だけ（新しい計測はしない）。

## いつ回すか

| 時点 | command | 目的 |
| --- | --- | --- |
| 凍結の直後（mock-freeze 手順 10） | `round:record <n>` | freeze 節（export file 数・screenshot 数・integrity・状態グラフの数）を書く。export・台帳と同じ commit に入れる |
| 画面ごとの ⑦ 機械 gate の直後 | `round:record <n>` | その画面の gate 節（rc・所要・pass / fail / skip / 宣言・状態 parity）と review / LLM step を upsert する。gate と同じ commit に入れる |
| ⑩ 本番 smoke の直後 | json の `screens.<slug>.smoke` を手で書く | 3 項目の観測値（green / red と一言） |
| 本番で不具合が見つかった時 | json の `screens.<slug>.escaped` を手で書く | 何が・なぜ gate が捕れなかったか・どう直したか |
| promote の前（adoption §10 手順 0） | `round:record --check` | 全画面の gate が最新の巡に記録されているか。hook が同じ検査を promote 系 command の前に回す |

`<n>` は 1 から始める整数。全画面を回し直す時（mock の再凍結、実装の作り直し、seed の大きな版上げ）に +1 する。同じ巡の中で gate を回し直したら同じ `<n>` に upsert する（gate 節は最新の run で上書き、smoke / escaped / notes は保持）。

## file の形（`<n>.json`）

```json
{
  "version": "1",
  "round": 2,
  "recordedAt": "2026-09-03T03:00:00.000Z",
  "freeze": {
    "exportFiles": 12,
    "screenshots": 14,
    "integrity": { "defects": 0, "advice": 1 },
    "states": { "trial": { "desktop": { "states": 9, "edges": 20, "unchanged": 3, "sampled": 1, "boundsHit": [], "kinds": { "click": 17, "back": 1, "fillAll": 2 } } } }
  },
  "screens": {
    "trial": {
      "tier": "L",
      "gate": {
        "at": "2026-09-03T02:40:00.000Z", "durationSeconds": 354, "rc": 0,
        "expected": 30, "unexpected": 0, "flaky": 0, "skipped": 0, "declared": 1,
        "specs": { "sample-parity": { "status": "passed", "durationMs": 41000 } },
        "stateParity": { "checked": 9, "unreachable": 0, "diff": 0, "tolerance": 3, "limitHit": false, "heapMaxMB": 76 }
      },
      "review": { "reviewedAt": "…", "model": "opus", "effort": "high", "screenshots": 11, "findings": 2, "open": 0, "notes": 1 },
      "llm": [ { "at": "…", "step": "screen-review", "model": "claude-opus-5", "effort": "high", "expectedModel": "opus", "expectedEffort": "high", "verdict": "green", "tokens": 48210, "durationSeconds": 310 } ],
      "smoke": [ { "item": "api", "result": "green", "note": "満席 2 枠が実データで出た", "at": "2026-09-03" } ],
      "escaped": [ { "at": "2026-09-03", "what": "reload の一瞬だけ既定テーマ", "whyGateMissed": "hydration 後しか比較していなかった", "fix": "ssr-first-paint spec" } ]
    }
  },
  "notes": []
}
```

| 節 | 誰が書くか | 出所 |
| --- | --- | --- |
| `freeze` | round:record（毎回上書き） | `mock-baseline.sha256` の行数 / `screenshots/*.png` の数 / `pp/artifacts/mock-integrity.json` / `states/<slug>.json` |
| `screens.<slug>.tier` | round:record | `pp/artifacts/difficulty.json` |
| `screens.<slug>.gate` | round:record（その画面の最新 run で上書き） | `pp/artifacts/playwright-report.json`（画面は `config.metadata.mockEntryFile`）。`skipped` は `pp/gate-not-applicable.json` に宣言の無い skip、`declared` は宣言のある skip。`rc` は `unexpected` と `skipped` が共に 0 のとき 0。`stateParity` は状態 test の console 行（`state <id>: …`）を数えたもの |
| `screens.<slug>.review` | round:record | `docs/presentation/ui-review/<slug>.json` |
| `screens.<slug>.llm` | round:record | `pp/artifacts/agent-log.jsonl`（`agent-audit` が追記する行のうち同じ slug） |
| `screens.<slug>.smoke` / `escaped` / top-level `notes` | 人（または ⑩ を回した agent） | round:record は保持するだけで書き換えない |

`<n>.md` は json から毎回全文生成する。直すなら json を直す。

## 巡どうしを比べる

`<n-1>.json` が同じ dir にあれば、md の画面の表に gate 所要の前巡値が並ぶ。見るのは次の 3 つ:

- **gate の所要と状態数**: 状態 parity を足した増分（実績: 7 画面で +19 分）が上限（docs/ui-quality-policy.md）を超えていないか
- **LLM step の model / effort と token**: 表（seed-docs/llm-steps.md）どおりか。`verdict` が red の行は表の見直し材料
- **escaped**: 前巡で本番に漏れた不具合が、今巡は gate（spec の追加か宣言）で捕れているか。捕れていなければ同じ行を書き写さず、gate を直す

## --check

`round:record --check [<n>]` は最新の巡（引数があればその巡）について、(1) json がある (2) `export/` の全画面（`reference-pages.json` の見本 page を除く）に `gate` がある (3) 今の `playwright-report.json` の run（`stats.startTime`）がその画面の `gate.at` と一致する、の 3 つを見て rc を返す。(3) は report が gate の run（`sample-parity` を含む）のときだけ見る — unit spec だけの run も report を上書きするので、それを「最新 gate」と数えない。`.claude/hooks/block-promote-without-review.sh` は `review:check` の次にこれを回し、赤なら promote 系 command を止める。
