#!/usr/bin/env node
// ⑧ の screenshot レビュー（reviewer agent の見立て → 人の受理）を機械可読な記録に固定し、
// 記録なし・古い・未裁定のまま promote されるのを止める
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULTS = {
  exportDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/export'),
  screenshotsDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/screenshots'),
  reviewDir: path.resolve(REPO_ROOT, 'docs/presentation/ui-review'),
  referencePagesFile: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/reference-pages.json'),
  ledgerFile: path.resolve(REPO_ROOT, 'docs/presentation/ui-mock/DESIGN-POLICY.md'),
};

const PAGE_RE = /\.html?$/i;
const SHOT_RE = /^(.+)\.(mobile|desktop)(?:\.(.+))?\.png$/;
const REQUIRED_FIELDS = ['version', 'screen', 'reviewedAt', 'model', 'effort'];

// 画面 slug は file 名の最初の dot まで（slug に dot は入らない）— mock-screens.ts と同じ規則
function screenSlug(file) {
  return path.basename(file).split('.', 1)[0] ?? '';
}

function walk(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(path.join(dir, entry.name), path.join(prefix, entry.name))
      : PAGE_RE.test(entry.name)
        ? [path.join(prefix, entry.name)]
        : [],
  );
}

// 見本帳（route にしない仕様書 page）はレビュー対象外。宣言が無い / 空なら見本帳は無いものとして扱う
function referenceSlugs(file) {
  if (!fs.existsSync(file)) return [];
  const pages = JSON.parse(fs.readFileSync(file, 'utf8')).pages ?? [];
  if (!Array.isArray(pages) || pages.some((page) => typeof page !== 'string')) {
    throw new Error(`review-check: ${file} の pages は export 内の file 名を並べた配列で書く`);
  }
  return pages.map(screenSlug);
}

function siteScreens(exportDir, referencePagesFile) {
  const excluded = referenceSlugs(referencePagesFile);
  return [...new Set(walk(exportDir).map(screenSlug))].filter((slug) => !excluded.includes(slug)).sort();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function shotsOf(screenshotsDir, slug) {
  if (!fs.existsSync(screenshotsDir)) return [];
  return fs
    .readdirSync(screenshotsDir)
    .filter((name) => SHOT_RE.exec(name)?.[1]?.split('.', 1)[0] === slug)
    .sort();
}

// 記録の外に出せる形（repo 相対）で file を指す。temp dir 相手には絶対 path のまま返す
function displayPath(file) {
  const rel = path.relative(REPO_ROOT, file);
  return rel.startsWith('..') ? file : rel;
}

function readRecord(file) {
  if (!fs.existsSync(file)) return { missing: true };
  try {
    return { record: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { broken: error.message };
  }
}

function fieldProblems(record) {
  const missing = REQUIRED_FIELDS.filter((key) => typeof record[key] !== 'string' || record[key].trim() === '');
  return missing.length ? [`記録が不完全（${missing.join(' / ')}）`] : [];
}

// 撮り直し・撮り足し・撮り落としはどれも前回の判断を無効にする（見ていない画像が残るため）
function screenshotProblems(screenshotsDir, record, onDisk) {
  const listed = new Map(
    (Array.isArray(record.screenshots) ? record.screenshots : [])
      .filter((entry) => entry && typeof entry.file === 'string')
      .map((entry) => [entry.file, entry.sha256]),
  );
  const problems = [];
  for (const file of onDisk) {
    if (!listed.has(file)) problems.push(`${file} が記録に無い（再レビュー）`);
    else if (listed.get(file) !== sha256(path.join(screenshotsDir, file))) problems.push(`${file} が変わった（再レビュー）`);
  }
  for (const file of listed.keys()) {
    if (!onDisk.includes(file)) problems.push(`${file} が消えた（再レビュー）`);
  }
  return problems;
}

function findingProblems(record, ledger) {
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const problems = [];
  const open = findings.filter((finding) => finding?.disposition === 'open').length;
  if (open) problems.push(`未裁定の指摘 ${open} 件`);
  for (const finding of findings) {
    const disposition = typeof finding?.disposition === 'string' ? finding.disposition : '';
    if (!disposition.startsWith('keep-impl:')) continue;
    const fragment = disposition.slice('keep-impl:'.length);
    if (fragment.trim() === '' || !ledger.includes(fragment)) problems.push(`台帳に無い keep-impl（${fragment}）`);
  }
  return problems;
}

export function checkReviews({ exportDir, screenshotsDir, reviewDir, referencePagesFile, ledgerFile } = DEFAULTS) {
  const slugs = siteScreens(exportDir, referencePagesFile);
  if (slugs.length === 0) {
    return { screens: [], red: 0, summary: '対象なし（docs/presentation/ui-mock/export/ が空）' };
  }
  const ledger = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8') : '';
  const screens = slugs.map((slug) => {
    const onDisk = shotsOf(screenshotsDir, slug);
    const recordFile = path.join(reviewDir, `${slug}.json`);
    const { missing, broken, record } = readRecord(recordFile);
    const problems = [];
    if (onDisk.length === 0) problems.push('記録できる screenshot が無い（bun run --cwd pp mock:screenshots を先に）');
    if (missing) problems.push(`記録なし（${displayPath(recordFile)}）`);
    else if (broken) problems.push(`記録が壊れている（${broken}）`);
    else {
      problems.push(...fieldProblems(record), ...screenshotProblems(screenshotsDir, record, onDisk), ...findingProblems(record, ledger));
    }
    const lines = problems.length
      ? problems.map((problem) => `${slug}: ${problem}`)
      : [`${slug}: レビュー済み（${onDisk.length} 枚、${record.model}/${record.effort}、${record.reviewedAt}）`];
    return { slug, ok: problems.length === 0, problems, lines };
  });
  const red = screens.reduce((sum, screen) => sum + screen.problems.length, 0);
  return { screens, red, summary: `${screens.length} 画面 / 赤 ${red} 件` };
}

// reviewer が判断だけ書き足せば緑になる雛形。sha256 を手で書かせると記録が壊れる
export function reviewTemplate({ screenshotsDir, slug }) {
  return {
    version: '1',
    screen: slug,
    reviewedAt: '',
    model: '',
    effort: '',
    agentId: '',
    screenshots: shotsOf(screenshotsDir, slug).map((file) => ({ file, sha256: sha256(path.join(screenshotsDir, file)) })),
    findings: [],
  };
}

function parseArgs(args) {
  const options = { ...DEFAULTS, json: false, template: '' };
  const keys = {
    '--export-dir': 'exportDir',
    '--screenshots-dir': 'screenshotsDir',
    '--review-dir': 'reviewDir',
    '--reference-pages': 'referencePagesFile',
    '--ledger': 'ledgerFile',
    '--template': 'template',
  };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') options.json = true;
    else if (keys[args[i]]) options[keys[args[i]]] = path.resolve(process.cwd(), args[i + 1] ?? '');
    else throw new Error(`review-check: 未知の引数 ${args[i]}`);
    if (keys[args[i]]) i += 1;
  }
  if (options.template) options.template = path.basename(options.template);
  return options;
}

function main(args) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (options.template) {
    console.log(JSON.stringify(reviewTemplate({ screenshotsDir: options.screenshotsDir, slug: options.template }), null, 2));
    return;
  }
  const result = checkReviews(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const screen of result.screens) for (const line of screen.lines) console.log(line);
    console.log(`review-check: ${result.summary}`);
  }
  if (result.red > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
