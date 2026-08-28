#!/usr/bin/env node
// 凍結 mock の静的 lint: 外部資産参照（CDN 依存 = 検証の非決定性）と size cap を検査する
// MOCK101 = vendor 化されていない外部資産参照 / MOCK102 = size cap 超過 / MOCK103 = 途中で切れた document
// MOCK104 = 資産が重い（人に「どれが重いか」を聞かずに済ませるための検知）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.resolve(SCRIPT_DIR, '../../docs/presentation/ui-mock/export');
const CAP_BYTES = 1_048_576; // export 1 file の上限目安。PJ で調整可
// 画像・フォント等 1 資産の上限目安。超えると回線次第で初回表示が体感に出る。PJ で調整可
const ASSET_CAP_BYTES = 1_048_576;
// vendor 済み URL は net-block と同じ台帳を見る（許可の二重管理を作らない）
const VENDOR_ROUTES_FILE = path.resolve(SCRIPT_DIR, '../vendor/routes.json');

const HTML_RE = /\.html?$/i;
const SCRIPT_RE = /\.m?js$/i;
const SCANNED_RE = /\.(?:html?|css|m?js)$/i;
// 取得先ではなく識別子として書かれる URL
const NON_FETCH_URL = /^https?:\/\/(?:www\.)?w3\.org\//i;
// 接続を温めるだけで資産を取りに行かない link
const NON_FETCHING_LINK = /\brel\s*=\s*["'][^"']*\b(?:preconnect|dns-prefetch)\b/i;

// 資産を読み込む参照だけを対象にする（本文中の単なる URL 文字列やリンク href は対象外）
const ASSET_REF_PATTERNS = [
  /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi,
  /<link[^>]*href\s*=\s*["']https?:\/\/[^"']+["'][^>]*>/gi,
  /<img[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi,
  /url\(\s*["']?https?:\/\/[^"')]+/gi,
  /@import\s+["']https?:\/\/[^"']+["']/gi,
];

// script 注入や動的 import は HTML の形を取らないので、URL リテラルを丸ごと候補にする
const SCRIPT_REF_PATTERNS = [/["'`]https?:\/\/[^"'`\s]+["'`]/g];

// src を持たない script の中身は JS。URL リテラルを本文のリンクと区別するため、この区間だけ切り出す
const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

// 走査は「どの text にどの pattern を当てるか」の列。offset は元 file 内の位置で、行番号に使う
function scanTargets(file, text) {
  if (SCRIPT_RE.test(file)) return [{ text, offset: 0, patterns: SCRIPT_REF_PATTERNS }];
  const targets = [{ text, offset: 0, patterns: ASSET_REF_PATTERNS }];
  if (!HTML_RE.test(file)) return targets;
  for (const match of text.matchAll(INLINE_SCRIPT)) {
    targets.push({ text: match[1], offset: match.index + match[0].indexOf(match[1]), patterns: SCRIPT_REF_PATTERNS });
  }
  return targets;
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

// urlPattern は glob。最初の * までが取得先の prefix になる
function vendorPrefixes() {
  if (!fs.existsSync(VENDOR_ROUTES_FILE)) return [];
  return JSON.parse(fs.readFileSync(VENDOR_ROUTES_FILE, 'utf8')).routes.map(({ urlPattern }) => urlPattern.split('*')[0]);
}

// callback として渡されると第 2 引数に index が来る。配列でなければ台帳から引く
// 資産は中身でなく重さだけを見る。「どれが重いか」は測れば分かるので、発注側に聞く項目にしない
function lintAsset(file) {
  const bytes = fs.statSync(file).size;
  if (bytes <= ASSET_CAP_BYTES) return [];
  return [{
    file,
    line: 1,
    id: 'MOCK104',
    message: `asset is ${bytes} bytes; cap is ${ASSET_CAP_BYTES} — 先読みを既定にしたうえで、解像度を下げてよいかを発注側に確認する`,
  }];
}

function lintFile(file, allowed) {
  if (!SCANNED_RE.test(file)) return lintAsset(file);
  const prefixes = Array.isArray(allowed) ? allowed : vendorPrefixes();
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    return [{ file, line: 1, id: 'MOCK100', message: `cannot read file: ${error.message}` }];
  }
  const text = bytes.toString('utf8');
  const violations = [];
  for (const target of scanTargets(file, text)) {
    for (const pattern of target.patterns) {
      for (const match of target.text.matchAll(pattern)) {
        if (NON_FETCHING_LINK.test(match[0])) continue;
        const url = /https?:\/\/[^"'`)\s]+/.exec(match[0])?.[0] ?? match[0];
        if (/\/\/(?:localhost|127\.0\.0\.1)[:/]/.test(url)) continue;
        if (NON_FETCH_URL.test(url)) continue;
        if (prefixes.some((prefix) => url.startsWith(prefix))) continue;
        violations.push({
          file,
          line: lineAt(text, target.offset + match.index),
          id: 'MOCK101',
          message: `external asset reference ${url} — pp/vendor/ へ同梱し pp/vendor/routes.json に登録する`,
        });
      }
    }
  }
  if (bytes.byteLength > CAP_BYTES) {
    violations.push({ file, line: 1, id: 'MOCK102', message: `file is ${bytes.byteLength} bytes; cap is ${CAP_BYTES}` });
  }
  // 取得 API 側の size cap で切れた export を正本として pin させない（台帳は「取得物と一致する」しか保証しない）
  if (HTML_RE.test(file) && !/<\/html\s*>\s*$/i.test(text)) {
    violations.push({
      file,
      line: lineAt(text, text.length),
      id: 'MOCK103',
      message: `document does not end with </html> (${bytes.byteLength} bytes) — 取得が途中で切れていないか確認する`,
    });
  }
  return violations;
}

function defaultTargets() {
  if (!fs.existsSync(EXPORT_DIR)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name !== '.gitkeep') out.push(p);
    }
  };
  walk(EXPORT_DIR);
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(`mock-lint self-test: ${message}`);
}

// self-test claim: 合成違反ファイルで MOCK101/MOCK102/MOCK103 が各 1 回発火し、クリーンなファイルは違反 0
// あわせて kind 別の適用範囲: MOCK101 は注入 JS も拾い namespace は拾わない / MOCK103 は HTML だけ
function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-lint-'));
  try {
    const cleanFile = path.join(tempDir, 'clean.html');
    fs.writeFileSync(cleanFile, '<html><head><link href="./local.css" rel="stylesheet"></head><body><a href="https://example.com">doc link</a></body></html>');
    assert(lintFile(cleanFile).length === 0, 'clean fixture must produce no violations');

    const cdnFile = path.join(tempDir, 'cdn.html');
    fs.writeFileSync(cdnFile, '<html><head><script src="https://cdn.example.com/lib.js"></script></head></html>');
    const cdnViolations = lintFile(cdnFile);
    assert(cdnViolations.length === 1 && cdnViolations[0].id === 'MOCK101', 'cdn fixture did not fire MOCK101 exactly once');

    const capFile = path.join(tempDir, 'cap.html');
    fs.writeFileSync(capFile, Buffer.concat([Buffer.alloc(CAP_BYTES, 0x20), Buffer.from('</html>')]));
    const capViolations = lintFile(capFile);
    assert(capViolations.length === 1 && capViolations[0].id === 'MOCK102', 'cap fixture did not fire MOCK102 exactly once');

    // 取得 API の cap で末尾が落ちた export を模す（閉じタグまで届かない）
    const truncatedFile = path.join(tempDir, 'truncated.html');
    fs.writeFileSync(truncatedFile, '<html><head><link href="./local.css" rel="stylesheet"></head><body><div>cut he');
    const truncatedViolations = lintFile(truncatedFile);
    assert(truncatedViolations.length === 1 && truncatedViolations[0].id === 'MOCK103', 'truncated fixture did not fire MOCK103 exactly once');

    // MOCK103 は HTML document の終端検査なので、他 kind へ適用すると必ず誤発火する
    fs.writeFileSync(path.join(tempDir, 'icon.png'), Buffer.alloc(1024));

    const cssFile = path.join(tempDir, 'sheet.css');
    fs.writeFileSync(cssFile, '.a { color: #000 }\n');
    assert(lintFile(cssFile).length === 0, 'css fixture must produce no violations');

    // script 注入で外部を読む runtime は HTML の形を取らないので、文字列リテラルごと拾う
    const runtimeFile = path.join(tempDir, 'support.js');
    fs.writeFileSync(runtimeFile, 'const s = document.createElement("script");\ns.src = "https://cdn.example.com/react.production.min.js";\n');
    const runtimeViolations = lintFile(runtimeFile);
    assert(runtimeViolations.length === 1 && runtimeViolations[0].id === 'MOCK101', 'runtime fixture did not fire MOCK101 exactly once');

    // vendor 台帳に載った URL は取得先が pp/vendor/ なので、外部依存ではない
    assert(lintFile(cdnFile, ['https://cdn.example.com/']).length === 0, 'a vendored URL must not fire MOCK101');

    // HTML に直接書かれた script も外部を読みに行く。別 file なら落ちるのにここだけ通るのは穴
    const inlineFile = path.join(tempDir, 'inline.html');
    fs.writeFileSync(inlineFile, '<html><body><a href="https://example.com">doc link</a><script>\nconst s = document.createElement("script");\ns.src = "https://cdn.example.com/react.js";\n</script></body></html>');
    const inlineViolations = lintFile(inlineFile);
    assert(inlineViolations.length === 1 && inlineViolations[0].id === 'MOCK101', 'inline script fixture did not fire MOCK101 exactly once');
    assert(inlineViolations[0].line === 3, `inline script violation must point at the injected line, got ${inlineViolations[0].line}`);

    // 資産は中身を読まない。重さだけで判断する
    const heavyFile = path.join(tempDir, 'photo.png');
    fs.writeFileSync(heavyFile, Buffer.alloc(ASSET_CAP_BYTES + 1));
    const heavyViolations = lintFile(heavyFile);
    assert(heavyViolations.length === 1 && heavyViolations[0].id === 'MOCK104', 'heavy asset fixture did not fire MOCK104 exactly once');
    assert(lintFile(path.join(tempDir, 'icon.png')).length === 0, 'a light asset must produce no violations');

    // main は flatMap で呼ぶ。callback の第 2 引数 (index) を allowed と取り違えない
    assert([cleanFile, cdnFile].flatMap(lintFile).length === 1, 'flatMap 経由でも判定が変わってはいけない');

    // preconnect / dns-prefetch は接続を温めるだけで資産を取りに行かない
    const hintFile = path.join(tempDir, 'hint.html');
    fs.writeFileSync(hintFile, '<html><head><link rel="preconnect" href="https://fonts.example.com"><link href="https://fonts.example.com" rel="dns-prefetch"></head></html>');
    assert(lintFile(hintFile).length === 0, 'resource-hint fixture must produce no violations');

    // XML namespace は識別子であって取得先ではない
    const nsFile = path.join(tempDir, 'svg.js');
    fs.writeFileSync(nsFile, 'el = document.createElementNS("http://www.w3.org/2000/svg", "path");\n');
    assert(lintFile(nsFile).length === 0, 'namespace fixture must produce no violations');

    assert(fs.readdirSync(tempDir).filter((name) => SCANNED_RE.test(name)).length === 9, 'SCANNED_RE must cover the html/css/js fixtures');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('mock-lint self-test: clean passes; MOCK101..MOCK104 each fire once; kind scoping holds');
}

function main(args) {
  if (args[0] === '--self-test') {
    runSelfTest();
    return;
  }
  const files = args.length ? args.map((file) => path.resolve(process.cwd(), file)) : defaultTargets();
  if (files.length === 0) {
    console.log('mock-lint: no targets (docs/presentation/ui-mock/export/ is empty)');
    return;
  }
  const violations = files.flatMap(lintFile);
  for (const item of violations) console.log(`${item.file}:${item.line} ${item.id} ${item.message}`);
  // 個別が上限内でも枚数で重くなる。判断材料として合計を必ず出す
  const assetBytes = files.filter((file) => !SCANNED_RE.test(file)).reduce((sum, file) => sum + fs.statSync(file).size, 0);
  if (assetBytes > 0) console.log(`mock-lint: assets total ${(assetBytes / 1_048_576).toFixed(2)} MB`);
  if (violations.length) process.exitCode = 1;
  else console.log(`mock-lint: ${files.length} file(s) OK`);
}

main(process.argv.slice(2));
