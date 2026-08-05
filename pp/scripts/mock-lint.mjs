#!/usr/bin/env node
// 凍結 mock の静的 lint: 外部資産参照（CDN 依存 = 検証の非決定性）と size cap を検査する
// MOCK101 = vendor 化されていない外部資産参照 / MOCK102 = size cap 超過
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.resolve(SCRIPT_DIR, '../../design-reference/export');
const CAP_BYTES = 1_048_576; // standalone export 1 枚の上限目安。PJ で調整可
// vendor 同梱済みで net-block の VENDOR_ROUTES が握る URL prefix はここで許可する
const ALLOWED_EXTERNAL = [];

// 資産を読み込む参照だけを対象にする（本文中の単なる URL 文字列やリンク href は対象外）
const ASSET_REF_PATTERNS = [
  /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi,
  /<link[^>]+href\s*=\s*["']https?:\/\/[^"']+["']/gi,
  /<img[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi,
  /url\(\s*["']?https?:\/\/[^"')]+/gi,
  /@import\s+["']https?:\/\/[^"']+["']/gi,
];

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function lintFile(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    return [{ file, line: 1, id: 'MOCK100', message: `cannot read file: ${error.message}` }];
  }
  const text = bytes.toString('utf8');
  const violations = [];
  for (const pattern of ASSET_REF_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const url = /https?:\/\/[^"')\s]+/.exec(match[0])?.[0] ?? match[0];
      if (/\/\/(?:localhost|127\.0\.0\.1)[:/]/.test(url)) continue;
      if (ALLOWED_EXTERNAL.some((prefix) => url.startsWith(prefix))) continue;
      violations.push({
        file,
        line: lineAt(text, match.index),
        id: 'MOCK101',
        message: `external asset reference ${url} — vendor 化して pp/src/net-block.ts に登録する`,
      });
    }
  }
  if (bytes.byteLength > CAP_BYTES) {
    violations.push({ file, line: 1, id: 'MOCK102', message: `file is ${bytes.byteLength} bytes; cap is ${CAP_BYTES}` });
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
      else if (/\.(?:html|css)$/.test(entry.name)) out.push(p);
    }
  };
  walk(EXPORT_DIR);
  return out;
}

function assert(condition, message) {
  if (!condition) throw new Error(`mock-lint self-test: ${message}`);
}

// self-test claim: 合成違反ファイルで MOCK101/MOCK102 が各 1 回発火し、クリーンなファイルは違反 0
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
    fs.writeFileSync(capFile, Buffer.alloc(CAP_BYTES + 1, 0x20));
    const capViolations = lintFile(capFile);
    assert(capViolations.length === 1 && capViolations[0].id === 'MOCK102', 'cap fixture did not fire MOCK102 exactly once');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log('mock-lint self-test: clean passes; MOCK101/MOCK102 each fire once');
}

function main(args) {
  if (args[0] === '--self-test') {
    runSelfTest();
    return;
  }
  const files = args.length ? args.map((file) => path.resolve(process.cwd(), file)) : defaultTargets();
  if (files.length === 0) {
    console.log('mock-lint: no targets (design-reference/export/ is empty)');
    return;
  }
  const violations = files.flatMap(lintFile);
  for (const item of violations) console.log(`${item.file}:${item.line} ${item.id} ${item.message}`);
  if (violations.length) process.exitCode = 1;
}

main(process.argv.slice(2));
