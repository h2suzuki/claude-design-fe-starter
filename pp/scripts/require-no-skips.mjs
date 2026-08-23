#!/usr/bin/env node
// playwright の JSON report を読み、skip された spec が 1 件でもあれば落とす。
// skip は「未検証」であって「合格」ではない（seed-docs/walking-skeleton.md の完了条件）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT = path.resolve(SCRIPT_DIR, '../artifacts/playwright-report.json');

function collectSpecs(suite) {
  return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(collectSpecs)];
}

function skipReason(test) {
  const note = (test.annotations ?? []).find((item) => item.type === 'skip' || item.type === 'fixme');
  return note?.description ?? 'no reason recorded';
}

function skippedSpecs(report) {
  return collectSpecs(report).flatMap((spec) =>
    (spec.tests ?? [])
      .filter((test) => test.status === 'skipped')
      .map((test) => ({ file: spec.file, title: spec.title, reason: skipReason(test) })),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(`require-no-skips self-test: ${message}`);
}

// self-test claim: 実行済みの report は通り、入れ子の skip は理由つきで 1 件検出される
function runSelfTest() {
  const executed = { suites: [{ specs: [{ file: 'a.spec.ts', title: 'runs', tests: [{ status: 'expected' }] }] }] };
  assert(skippedSpecs(executed).length === 0, 'a fully executed report was reported as skipped');

  const nested = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                file: 'b.spec.ts',
                title: 'waits for a mock',
                tests: [{ status: 'skipped', annotations: [{ type: 'skip', description: 'PP_MOCK_FILE 未設定' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
  const found = skippedSpecs(nested);
  assert(found.length === 1, 'nested skipped spec was not found exactly once');
  assert(found[0].reason === 'PP_MOCK_FILE 未設定', 'skip reason was not carried through');
  console.log('require-no-skips self-test: executed specs pass; a nested skip is caught with its reason');
}

function main(args) {
  if (args[0] === '--self-test') {
    runSelfTest();
    return;
  }
  const reportFile = args.length ? path.resolve(process.cwd(), args[0]) : DEFAULT_REPORT;
  if (!fs.existsSync(reportFile)) {
    console.error(`require-no-skips: ${reportFile} is missing — run the suite first`);
    process.exitCode = 2;
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const specs = collectSpecs(report);
  if (specs.length === 0) {
    console.error(`require-no-skips: ${reportFile} lists no specs — the suite did not run`);
    process.exitCode = 2;
    return;
  }
  const skipped = skippedSpecs(report);
  if (skipped.length === 0) {
    console.log(`require-no-skips: ${specs.length} spec(s) ran, none skipped`);
    return;
  }
  console.error(`require-no-skips: ${skipped.length} of ${specs.length} spec(s) were skipped, so they are unverified — not passing:\n`);
  for (const item of skipped) console.error(`  ${item.file} › ${item.title} — ${item.reason}`);
  console.error('\nGive each one what it needs (a frozen mock, a screen AST, PP_APP_URL, registered states) and run again. A skipped gate carries no evidence, so this run is not a completed pass.');
  process.exitCode = 1;
}

main(process.argv.slice(2));
