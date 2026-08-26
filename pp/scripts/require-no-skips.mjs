#!/usr/bin/env node
// playwright の JSON report を読み、未検証のまま skip された spec があれば落とす。
// 例外は gate-not-applicable.json が画面単位で宣言した「検査対象の部品が無い」case だけ
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

const DECLARATIONS_FILE = path.resolve(SCRIPT_DIR, '../gate-not-applicable.json');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function specName(file) {
  return path.basename(file).replace(/\.spec\.[cm]?[tj]s$/, '');
}

// 画面 slug は mock file 名の最初の dot まで（slug に dot は入らない）
function screenOf(mockFile) {
  return mockFile ? path.basename(mockFile).split('.', 1)[0] : '';
}

function declarationErrors(entries) {
  return entries.flatMap((entry, index) => {
    const missing = ['spec', 'screen', 'reason'].filter((key) => !entry?.[key]);
    if (missing.length) return [`entry ${index}: ${missing.join(' / ')} が空`];
    return ISO_DATE.test(entry.date ?? '') ? [] : [`entry ${index}: date が YYYY-MM-DD でない`];
  });
}

// 宣言は画面と spec の両方が一致したときだけ効く。対象部品を持つ画面が来れば届かず、gate は再び落ちる
function classifySkips(report, entries, screen) {
  const applies = (spec) => entries.some((entry) => entry.screen === screen && entry.spec === spec);
  const executed = new Set(
    collectSpecs(report)
      .filter((spec) => (spec.tests ?? []).some((test) => test.status !== 'skipped'))
      .map((spec) => specName(spec.file)),
  );
  return {
    unverified: skippedSpecs(report).filter((item) => !applies(specName(item.file))),
    declared: skippedSpecs(report).filter((item) => applies(specName(item.file))),
    stale: entries.filter((entry) => entry.screen === screen && executed.has(entry.spec)),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`require-no-skips self-test: ${message}`);
}

// self-test claim: 入れ子の skip は理由つきで検出され、宣言は画面と spec が一致した時だけ効き、対象が現れれば stale になる
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

  // 「この画面には検査対象の部品が無い」宣言は、画面と spec が両方一致したときだけ skip を通す
  const skipReport = (file, status = 'skipped') => ({
    suites: [{ specs: [{ file, title: 't', tests: [{ status, annotations: [{ type: 'skip', description: 'r' }] }] }] }],
  });
  const declared = [{ spec: 'list-identity-sweep', screen: 'home', date: '2026-08-27', reason: '該当部品なし' }];
  const of = (report, entries, screen) => classifySkips(report, entries, screen);

  assert(of(skipReport('tests/list-identity-sweep.spec.ts'), declared, 'home').unverified.length === 0,
    'a declared skip on the declared screen must be accepted');
  assert(of(skipReport('tests/list-identity-sweep.spec.ts'), declared, 'other').unverified.length === 1,
    'a declaration must not cover a different screen');
  assert(of(skipReport('tests/modal-geometry-sweep.spec.ts'), declared, 'home').unverified.length === 1,
    'a declaration must not cover a different spec');
  assert(of(skipReport('tests/list-identity-sweep.spec.ts'), declared, '').unverified.length === 1,
    'without a screen no declaration can apply');
  assert(of(skipReport('tests/list-identity-sweep.spec.ts', 'expected'), declared, 'home').stale.length === 1,
    'a declaration whose spec actually ran must be reported stale');
  assert(declarationErrors([{ spec: 'a', screen: 'b', date: '2026-08-27' }]).length === 1,
    'a declaration without a reason must be rejected');
  assert(declarationErrors([{ spec: 'a', screen: 'b', date: 'yesterday', reason: 'r' }]).length === 1,
    'a declaration without an ISO date must be rejected');
  assert(declarationErrors(declared).length === 0, 'a well-formed declaration must pass validation');

  console.log('require-no-skips self-test: skips are caught with their reason; declarations apply per screen+spec and go stale when the gate runs');
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
  let entries;
  try {
    entries = fs.existsSync(DECLARATIONS_FILE)
      ? (JSON.parse(fs.readFileSync(DECLARATIONS_FILE, 'utf8')).entries ?? [])
      : [];
  } catch (error) {
    console.error(`require-no-skips: cannot read ${DECLARATIONS_FILE} — ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const problems = declarationErrors(entries);
  if (problems.length) {
    console.error(`require-no-skips: ${DECLARATIONS_FILE} has malformed declarations:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 2;
    return;
  }

  const { unverified, declared, stale } = classifySkips(report, entries, screenOf(process.env.PP_MOCK_FILE ?? ''));
  if (stale.length) {
    console.error('require-no-skips: a gate ran even though it is declared not applicable — the declaration is stale:\n');
    for (const entry of stale) console.error(`  ${entry.spec} › ${entry.screen} (${entry.date}) — ${entry.reason}`);
    console.error('\nThe screen gained the part the gate looks for. Drop the declaration and run again.');
    process.exitCode = 1;
    return;
  }
  if (unverified.length === 0) {
    console.log(`require-no-skips: ${specs.length} spec(s) ran, ${declared.length} declared not applicable, none left unverified`);
    return;
  }
  console.error(`require-no-skips: ${unverified.length} of ${specs.length} spec(s) were skipped, so they are unverified — not passing:\n`);
  for (const item of unverified) console.error(`  ${item.file} › ${item.title} — ${item.reason}`);
  console.error('\nGive each one what it needs (a frozen mock, a screen AST, PP_APP_URL, registered states) and run again. A skipped gate carries no evidence, so this run is not a completed pass.');
  console.error('If a gate has no subject on this screen at all, declare it in gate-not-applicable.json with a screen, a date and a reason.');
  process.exitCode = 1;
}

main(process.argv.slice(2));
