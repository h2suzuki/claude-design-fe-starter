#!/usr/bin/env node
// 1 巡（全画面を gate → promote まで通す 1 回）の実測を、既にある成果物だけから rounds/<n>.json と <n>.md に固定する
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULTS = {
  roundsDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/rounds'),
  report: path.resolve(REPO_ROOT, 'pp/artifacts/playwright-report.json'),
  statesDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/states'),
  screenshotsDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/screenshots'),
  baseline: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/mock-baseline.sha256'),
  integrity: path.resolve(REPO_ROOT, 'pp/artifacts/mock-integrity.json'),
  agentLog: path.resolve(REPO_ROOT, 'pp/artifacts/agent-log.jsonl'),
  difficulty: path.resolve(REPO_ROOT, 'pp/artifacts/difficulty.json'),
  reviewDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-review'),
  exportDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/export'),
  referencePages: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/reference-pages.json'),
  declarations: path.resolve(REPO_ROOT, 'pp/gate-not-applicable.json'),
};

class ArgumentError extends Error {}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readOptionalJson(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function screenOf(file) {
  return file ? path.basename(file).split('.', 1)[0] : '';
}

export function screenOfReport(report, env = process.env) {
  return screenOf(report?.config?.metadata?.mockEntryFile ?? env?.PP_MOCK_FILE ?? '');
}

function collectSpecs(suite) {
  return [...(suite?.specs ?? []), ...(suite?.suites ?? []).flatMap(collectSpecs)];
}

function specName(file) {
  return path.basename(file ?? '').replace(/\.spec\.[cm]?[tj]s$/, '');
}

function roundNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < 1) throw new ArgumentError('round-record: 巡は 1 以上の整数で指定する');
  return number;
}

function latestRound(roundsDir) {
  if (!fs.existsSync(roundsDir)) return 1;
  const rounds = fs.readdirSync(roundsDir)
    .map((name) => /^([1-9]\d*)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  return rounds.length ? Math.max(...rounds) : 1;
}

function optionsOf(options = {}) {
  return { ...DEFAULTS, ...options, round: options.round ?? options.n ?? latestRound(options.roundsDir ?? DEFAULTS.roundsDir) };
}

function reportOf(file) {
  if (!fs.existsSync(file)) throw new Error(`round-record: report が無い（${file}）`);
  return readJson(file);
}

function declarationsOf(file) {
  const value = readOptionalJson(file);
  if (value === null) return [];
  if (!Array.isArray(value.entries)) throw new Error(`round-record: ${file} の entries は配列で書く`);
  return value.entries;
}

function stateFreeze(statesDir) {
  if (!fs.existsSync(statesDir)) return {};
  return Object.fromEntries(fs.readdirSync(statesDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const state = readJson(path.join(statesDir, name));
      if (!isObject(state?.viewports)) throw new Error(`round-record: ${path.join(statesDir, name)} の viewports が無い`);
      const viewports = Object.fromEntries(Object.entries(state.viewports).map(([viewport, graph]) => {
        if (!isObject(graph) || !isObject(graph.states) || !Array.isArray(graph.edges)) {
          throw new Error(`round-record: ${path.join(statesDir, name)} の ${viewport} が状態グラフでない`);
        }
        const kinds = graph.edges.reduce((counts, edge) => {
          const kind = edge?.action?.kind;
          if (typeof kind === 'string') counts[kind] = (counts[kind] ?? 0) + 1;
          return counts;
        }, {});
        return [viewport, {
          states: Object.keys(graph.states).length,
          edges: graph.edges.length,
          unchanged: graph.unchanged,
          sampled: graph.sampled,
          boundsHit: graph.boundsHit,
          kinds,
        }];
      }));
      return [path.basename(name, '.json'), viewports];
    }));
}

function freezeOf(options) {
  const integrity = readOptionalJson(options.integrity);
  return {
    exportFiles: fs.existsSync(options.baseline)
      ? fs.readFileSync(options.baseline, 'utf8').split(/\r?\n/).filter((line) => line.trim() !== '').length
      : 0,
    screenshots: fs.existsSync(options.screenshotsDir)
      ? fs.readdirSync(options.screenshotsDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.png')).length
      : 0,
    integrity: integrity === null ? null : {
      defects: Array.isArray(integrity.defects) ? integrity.defects.length : 0,
      advice: Array.isArray(integrity.advice) ? integrity.advice.length : 0,
    },
    states: stateFreeze(options.statesDir),
  };
}

function stdoutLines(report) {
  return collectSpecs(report).flatMap((spec) => (spec.tests ?? []).flatMap((test) => (test.results ?? []).flatMap((result) =>
    (result.stdout ?? []).flatMap((item) => typeof item?.text === 'string' ? item.text.split(/\r?\n/) : []),
  )));
}

export function parseStateLines(lines) {
  const stateParity = { checked: 0, unreachable: 0, diff: 0, tolerance: null, heapMaxMB: null, limitHit: false };
  let found = false;
  for (const input of lines) {
    const line = String(input).trim();
    if (/^state\s+上限\s+\d+\s+に達した/.test(line)) {
      stateParity.limitHit = true;
      found = true;
    }
    const tolerance = /\/\s*許容\s*±\s*(\d+(?:\.\d+)?)/.exec(line);
    if (tolerance) {
      stateParity.tolerance = Math.max(stateParity.tolerance ?? 0, Number(tolerance[1]));
      found = true;
    }
    const heap = /\/\s*heap\s+(\d+(?:\.\d+)?)\s+MB\b/.exec(line);
    if (heap) {
      stateParity.heapMaxMB = Math.max(stateParity.heapMaxMB ?? 0, Number(heap[1]));
      found = true;
    }
    const state = /^state\s+.+?:\s+ids\s+\d+\s*\/\s*(.+)$/.exec(line);
    if (!state) continue;
    if (/^到達不能(?:\s|$)/.test(state[1])) {
      stateParity.checked += 1;
      stateParity.unreachable += 1;
      found = true;
    } else if (/^diff\s+あり(?:\s|$)/.test(state[1])) {
      stateParity.checked += 1;
      stateParity.diff += 1;
      found = true;
    } else if (/^diff\s+0(?:\s|$)/.test(state[1])) {
      stateParity.checked += 1;
      found = true;
    } else if (/^diff\s+MISS(?:\s|$)/.test(state[1])) {
      const miss = /^diff\s+MISS\s+(\d+)\s+style\s+(\d+)\s+geometry\s+(\d+)/.exec(state[1]);
      stateParity.checked += 1;
      if (miss && Number(miss[1]) + Number(miss[2]) + Number(miss[3]) > 0) stateParity.diff += 1;
      found = true;
    }
  }
  return found ? stateParity : null;
}

function gateOf(report, slug, entries) {
  const grouped = new Map();
  let skipped = 0;
  let declared = 0;
  for (const spec of collectSpecs(report)) {
    const name = specName(spec.file);
    const group = grouped.get(name) ?? { statuses: [], durationMs: 0 };
    const applies = entries.some((entry) => entry?.screen === slug && entry?.spec === name);
    for (const test of spec.tests ?? []) {
      group.statuses.push(test.status);
      if (test.status === 'skipped') applies ? declared += 1 : skipped += 1;
      group.durationMs += (test.results ?? []).reduce((sum, result) => sum + (Number(result?.duration) || 0), 0);
    }
    grouped.set(name, group);
  }
  const specs = Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, group]) => {
    const all = group.statuses;
    const applies = entries.some((entry) => entry?.screen === slug && entry?.spec === name);
    const status = all.every((value) => value === 'expected')
      ? 'passed'
      : all.some((value) => value === 'unexpected' || value === 'flaky')
        ? 'failed'
        : all.every((value) => value === 'skipped') && applies ? 'declared' : 'skipped';
    return [name, { status, durationMs: group.durationMs }];
  }));
  const stats = report.stats ?? {};
  const unexpected = stats.unexpected ?? 0;
  return {
    at: stats.startTime,
    durationSeconds: Math.round((Number(stats.duration) || 0) / 1000),
    expected: stats.expected ?? 0,
    unexpected,
    flaky: stats.flaky ?? 0,
    skipped,
    declared,
    rc: unexpected === 0 && skipped === 0 ? 0 : 1,
    specs,
    stateParity: parseStateLines(stdoutLines(report)),
  };
}

function reviewOf(reviewDir, slug) {
  const review = readOptionalJson(path.join(reviewDir, `${slug}.json`));
  if (review === null) return null;
  const findings = Array.isArray(review.findings) ? review.findings : [];
  return {
    reviewedAt: review.reviewedAt,
    model: review.model,
    effort: review.effort,
    screenshots: Array.isArray(review.screenshots) ? review.screenshots.length : 0,
    findings: findings.length,
    open: findings.filter((finding) => finding?.disposition === 'open').length,
  };
}

function llmOf(file, slug) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
    .filter((entry) => entry?.slug === slug)
    .map((entry) => ({
      at: entry.at ?? null,
      step: entry.step ?? null,
      model: entry.model ?? null,
      effort: entry.effort ?? null,
      expectedModel: entry.expectedModel ?? null,
      expectedEffort: entry.expectedEffort ?? null,
      verdict: entry.verdict ?? null,
      tokens: entry.tokens ?? null,
      durationSeconds: entry.durationSeconds ?? null,
    }));
}

function listItem(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function rowsOf(value) {
  return Array.isArray(value) && value.length ? value : null;
}

function cell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function parityCell(parity) {
  return parity
    ? `checked ${parity.checked}・到達不能 ${parity.unreachable}・diff ${parity.diff}・許容 ${parity.tolerance ?? '—'}・heap 最大 ${parity.heapMaxMB ?? '—'}`
    : 'なし';
}

function reviewCell(review) {
  return review ? `${review.model ?? '—'}/${review.effort ?? '—'}・指摘 ${review.findings}・open ${review.open}` : 'なし';
}

function durationCell(gate, previous) {
  const oldGate = previous?.screens?.[gate.slug]?.gate;
  return `${gate.durationSeconds} 秒${oldGate ? `（前巡 ${oldGate.durationSeconds} 秒）` : ''}`;
}

export function renderMarkdown(record, previous = null) {
  const lines = [
    `<!-- round:record が ${record.round}.json から生成する。直すなら json を直す -->`,
    '',
    `# 第 ${record.round} 巡`,
    '',
    `記録時刻: ${record.recordedAt}`,
    '',
    '## 凍結',
    '',
    '| 項目 | 値 |',
    '| --- | --- |',
    `| export file 数 | ${record.freeze?.exportFiles ?? 0} |`,
    `| screenshot 数 | ${record.freeze?.screenshots ?? 0} |`,
    `| integrity（直す・気づき） | ${record.freeze?.integrity ? `${record.freeze.integrity.defects}・${record.freeze.integrity.advice}` : 'なし'} |`,
    '',
    '| 画面 | viewport | 状態数 | 辺数 | 反応なし | 代表化 | 上限 |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];
  const frozen = Object.entries(record.freeze?.states ?? {});
  if (frozen.length === 0) lines.push('| — | — | — | — | — | — | — |');
  for (const [slug, viewports] of frozen) for (const [viewport, graph] of Object.entries(viewports)) {
    lines.push(`| ${cell(slug)} | ${cell(viewport)} | ${graph.states} | ${graph.edges} | ${cell(graph.unchanged)} | ${cell(graph.sampled)} | ${cell(Array.isArray(graph.boundsHit) && graph.boundsHit.length ? graph.boundsHit.join(' ') : null)} |`);
  }
  lines.push('', '## 画面', '', '| 画面 | 難易度 | gate rc | 所要 | pass | fail | skip | 宣言 | 状態 parity | review |', '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |');
  const screens = Object.entries(record.screens ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (screens.length === 0) lines.push('| — | — | — | — | — | — | — | — | — | — |');
  for (const [slug, screen] of screens) {
    const gate = screen.gate;
    lines.push(`| ${cell(slug)} | ${cell(screen.tier)} | ${cell(gate?.rc)} | ${gate ? durationCell({ ...gate, slug }, previous) : '—'} | ${cell(gate?.expected)} | ${cell(gate?.unexpected)} | ${cell(gate?.skipped)} | ${cell(gate?.declared)} | ${cell(parityCell(gate?.stateParity))} | ${cell(reviewCell(screen.review))} |`);
  }
  lines.push('', '## LLM step', '');
  for (const [slug, screen] of screens) {
    lines.push(`### ${slug}`, '', '| step | model/effort | 表の値 | 判定 | token | 所要 |', '| --- | --- | --- | --- | ---: | --- |');
    const llm = rowsOf(screen.llm);
    if (!llm) lines.push('| 記録なし | — | — | — | — | — |');
    else for (const step of llm) lines.push(`| ${cell(step.step)} | ${cell(`${step.model ?? '—'}/${step.effort ?? '—'}`)} | ${cell(`${step.expectedModel ?? '—'}/${step.expectedEffort ?? '—'}`)} | ${cell(step.verdict)} | ${cell(step.tokens)} | ${cell(step.durationSeconds === null ? null : `${step.durationSeconds} 秒`)} |`);
    lines.push('');
  }
  lines.push('## smoke / escaped', '');
  for (const [slug, screen] of screens) {
    lines.push(`### ${slug} smoke`, '');
    const smoke = rowsOf(screen.smoke);
    if (!smoke) lines.push('記入なし'); else for (const item of smoke) lines.push(`- ${listItem(item)}`);
    lines.push('', `### ${slug} escaped`, '');
    const escaped = rowsOf(screen.escaped);
    if (!escaped) lines.push('記入なし'); else for (const item of escaped) lines.push(`- ${listItem(item)}`);
    lines.push('');
  }
  lines.push('## notes', '');
  const notes = rowsOf(record.notes);
  if (!notes) lines.push('記入なし'); else for (const note of notes) lines.push(`- ${listItem(note)}`);
  return `${lines.join('\n')}\n`;
}

export function recordRound(rawOptions = {}) {
  const options = optionsOf(rawOptions);
  const round = roundNumber(options.round);
  const report = reportOf(options.report);
  const slug = screenOfReport(report, options.env ?? process.env);
  if (!slug) throw new Error('round-record: report に画面が無い（gate を PP_MOCK_FILE 付きで回す）');
  const recordFile = path.join(options.roundsDir, `${round}.json`);
  const current = readOptionalJson(recordFile) ?? { version: '1', round, recordedAt: options.now ?? new Date().toISOString(), freeze: null, screens: {}, notes: [] };
  if (!isObject(current)) throw new Error(`round-record: ${recordFile} の記録が object でない`);
  if (!isObject(current.screens)) current.screens = {};
  const oldScreen = isObject(current.screens[slug]) ? current.screens[slug] : {};
  const difficulty = readOptionalJson(options.difficulty);
  current.version = '1';
  current.round = round;
  current.recordedAt = options.now ?? new Date().toISOString();
  current.freeze = freezeOf(options);
  current.screens[slug] = {
    ...oldScreen,
    tier: difficulty?.screens?.[slug]?.tier ?? null,
    gate: gateOf(report, slug, declarationsOf(options.declarations)),
    review: reviewOf(options.reviewDir, slug),
    llm: llmOf(options.agentLog, slug),
    smoke: Object.hasOwn(oldScreen, 'smoke') ? oldScreen.smoke : [],
    escaped: Object.hasOwn(oldScreen, 'escaped') ? oldScreen.escaped : [],
  };
  const previousFile = path.join(options.roundsDir, `${round - 1}.json`);
  const previous = round > 1 ? readOptionalJson(previousFile) : null;
  fs.mkdirSync(options.roundsDir, { recursive: true });
  fs.writeFileSync(recordFile, `${JSON.stringify(current, null, 2)}\n`);
  fs.writeFileSync(path.join(options.roundsDir, `${round}.md`), renderMarkdown(current, previous));
  return current;
}

function referencePages(file) {
  const reference = readOptionalJson(file);
  if (reference === null) return [];
  if (!Array.isArray(reference.pages) || reference.pages.some((page) => typeof page !== 'string')) {
    throw new Error(`round-record: ${file} の pages は配列で書く`);
  }
  return reference.pages.map((page) => path.normalize(page));
}

function htmlFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? htmlFiles(path.join(dir, entry.name), relative) : entry.isFile() && entry.name.endsWith('.html') ? [relative] : [];
  });
}

function exportScreens(exportDir, referencePagesFile) {
  const excluded = new Set(referencePages(referencePagesFile));
  return [...new Set(htmlFiles(exportDir).filter((file) => !excluded.has(path.normalize(file))).map(screenOf))].sort();
}

export function checkRound(rawOptions = {}) {
  const options = optionsOf(rawOptions);
  const round = roundNumber(options.round);
  const recordFile = path.join(options.roundsDir, `${round}.json`);
  if (!fs.existsSync(recordFile)) {
    return { ok: false, problems: [`第 ${round} 巡の記録が無い（bun run --cwd pp round:record ${round}）`] };
  }
  const record = readJson(recordFile);
  const screens = isObject(record.screens) ? record.screens : {};
  const slugs = exportScreens(options.exportDir, options.referencePages);
  const problems = slugs.flatMap((slug) => screens[slug]?.gate ? [] : [`${slug}: gate が記録されていない`]);
  if (fs.existsSync(options.report)) {
    const report = readJson(options.report);
    const slug = screenOfReport(report, options.env ?? process.env);
    if (slugs.includes(slug) && screens[slug]?.gate && screens[slug].gate.at !== report?.stats?.startTime) {
      problems.push(`${slug}: 最新の gate（${report.stats.startTime}）が記録されていない`);
    }
  }
  return { ok: problems.length === 0, problems };
}

function parseArgs(args) {
  const options = { ...DEFAULTS, round: undefined, check: false, json: false, now: undefined };
  const paths = {
    '--rounds-dir': 'roundsDir', '--report': 'report', '--states-dir': 'statesDir', '--screenshots-dir': 'screenshotsDir',
    '--baseline': 'baseline', '--integrity': 'integrity', '--agent-log': 'agentLog', '--difficulty': 'difficulty',
    '--review-dir': 'reviewDir', '--export-dir': 'exportDir', '--reference-pages': 'referencePages', '--declarations': 'declarations',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--now') {
      if (args[index + 1] === undefined) throw new ArgumentError('round-record: --now の値が無い');
      options.now = args[index + 1];
      index += 1;
    } else if (paths[arg]) {
      if (args[index + 1] === undefined) throw new ArgumentError(`round-record: ${arg} の値が無い`);
      options[paths[arg]] = path.resolve(process.cwd(), args[index + 1]);
      index += 1;
    } else if (/^\d+$/.test(arg) && options.round === undefined) options.round = roundNumber(arg);
    else if (/^\d+$/.test(arg)) throw new ArgumentError('round-record: 巡は一つだけ指定する');
    else throw new ArgumentError(`round-record: 未知の引数 ${arg}`);
  }
  options.round ??= latestRound(options.roundsDir);
  return options;
}

function main(args) {
  let options;
  try {
    options = parseArgs(args);
    if (options.check) {
      const result = checkRound(options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else if (result.ok) console.log(`round-record: 第 ${options.round} 巡は最新（${Object.keys(readJson(path.join(options.roundsDir, `${options.round}.json`)).screens ?? {}).length} 画面）`);
      else for (const problem of result.problems) console.error(problem);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    const record = recordRound(options);
    const slug = screenOfReport(reportOf(options.report), process.env);
    const gate = record.screens[slug].gate;
    const summary = gate.stateParity
      ? `状態 parity ${gate.stateParity.checked} 件・到達不能 ${gate.stateParity.unreachable}`
      : '状態 parity なし';
    if (options.json) console.log(JSON.stringify(record, null, 2));
    else console.log(`round-record: 第 ${options.round} 巡 ${slug} を記録した（gate rc ${gate.rc} / ${gate.durationSeconds} 秒 / ${summary}）`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof ArgumentError ? 2 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
