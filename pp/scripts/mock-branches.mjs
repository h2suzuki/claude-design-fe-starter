#!/usr/bin/env node
// 凍結 mock の表示分岐（「満」/「空1」/「受付終了」等の出し分け）を列挙し、backend 経路との突き合わせの入力にする
// 助言であって gate ではないので parser を入れず regex で走査する（正規表現リテラルは素通し）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.resolve(SCRIPT_DIR, '../../docs/presentation/ui-mock/export');

const HTML_RE = /\.html?$/i;
const SCRIPT_RE = /\.m?js$/i;
const SCANNED_RE = /\.(?:html?|m?js)$/i;
const KINDS = ['ternary', 'conditional-text', 'template-text', 'class-switch', 'case', 'comparison', 'fixed-logic', 'history'];

const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
const TEXT_SINK = /\.(?:textContent|innerText|innerHTML|title|ariaLabel)\s*=\s*/g;
const CLASS_LIST = /\.classList\s*\.\s*(?:add|remove|toggle|replace)\s*\(/g;
const CLASS_NAME = /\.(?:className)\s*=\s*/g;
const DATASET = /\.dataset\s*\.\s*[A-Za-z_$][\w$]*\s*=\s*/g;
const SET_ATTRIBUTE = /\.setAttribute\s*\(\s*/g;
const CASE_LABEL = /\bcase\s+/g;
// URL に状態を持つ mock は「戻る」で画面が変わるので、履歴を触る file を凍結時に一覧できるようにする
const HISTORY_CALL = /\b(?:pushState|replaceState)\s*\(/g;
const HISTORY_HASH = /\blocation\s*\.\s*hash\s*=(?!=)/g;
const HISTORY_EVENTS = new Set(['hashchange', 'popstate', 'pageshow']);
// 左辺（識別子・呼び出し・添字末尾）と数値定数の比較。sample logic（第 5 木曜・2 木は 3 枠）はここに出る
const LEFT_OPERAND = '(?:[A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*(?:\\s*\\([^()]*\\))?|\\)|\\])';
const FIXED_LOGIC = new RegExp(`${LEFT_OPERAND}\\s*(?:===|!==|==|!=|>=|<=|>|<|%)\\s*-?\\d+\\b`, 'g');

// 変数どうしの比較（`d > today`）は定数比較 regex に掛からない。keyword を operand と誤認しないよう除く
const OPERAND =
  '(?:new\\s+)?(?!(?:if|while|for|switch|return|typeof|delete|void|else|case|do|in|of)\\b)' +
  '[A-Za-z_$][\\w$]*(?:\\s*\\([^()]*\\))?(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*(?:\\s*\\([^()]*\\))?)*';
const COMPARISON = new RegExp(`(?:${OPERAND})\\s*(?:===|!==|==|!=|<=|>=|<|>)\\s*(?:${OPERAND})`, 'g');
// 代入・条件・論理演算の中だけを表示分岐と見なす。ループ境界は今までどおり落とす
const COMPARISON_CONTEXT = /\bif\s*\(|\bwhile\s*\(|&&|\|\||\?|(?:^|[^=!<>])=(?!=)|\b(?:const|let|var)\b/;
const NON_ASCII = /[^\x00-\x7F]/;
const REGION_START = new Set(['=', ':', '(', ',', '?', ';', '{', '}', '[', '&', '|', '\n']);
const REGION_END = new Set([';', ',', ')', '}', ']', ':', '\n']);

// 取得先・selector・event 名・storage key として書かれたリテラルは画面文言ではない
const NON_DISPLAY_VALUE = /^(?:https?:|mailto:|tel:|data:|blob:|\/\/|\.{0,2}\/)|:\/\//;
const NON_DISPLAY_CONTEXT = [
  /(?:querySelector(?:All)?|closest|matches|getElementById|getElementsBy\w+|matchMedia|importScripts)\s*\(\s*$/,
  /(?:add|remove)EventListener\s*\(\s*$/,
  /(?:dispatchEvent|CustomEvent|Event)\s*\(\s*$/,
  /(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\s*\(\s*$/,
  /\[\s*$/,
];

// literal と comment の中身を空白で潰した写しを作る（位置と行は元 source と 1:1 のまま保つ）
function maskSource(source, fileName) {
  const chars = new Array(source.length).fill(' ');
  const regions = HTML_RE.test(fileName) ? [] : [[0, source.length]];
  if (HTML_RE.test(fileName)) {
    for (const match of source.matchAll(INLINE_SCRIPT)) {
      const start = match.index + match[0].indexOf(match[1]);
      regions.push([start, start + match[1].length]);
    }
  }
  for (const [start, end] of regions) for (let i = start; i < end; i += 1) chars[i] = source[i];
  for (let i = 0; i < source.length; i += 1) if (source[i] === '\n') chars[i] = '\n';

  const literals = new Map();
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    if (c === '/' && (chars[i + 1] === '/' || chars[i + 1] === '*')) {
      const block = chars[i + 1] === '*';
      const end = block ? source.indexOf('*/', i + 2) : source.indexOf('\n', i);
      const stop = end === -1 ? chars.length : end + (block ? 2 : 0);
      for (let j = i; j < stop; j += 1) if (chars[j] !== '\n') chars[j] = ' ';
      i = stop - 1;
      continue;
    }
    if (c !== '"' && c !== "'" && c !== '`') continue;
    let j = i + 1;
    while (j < chars.length) {
      if (source[j] === '\\') { j += 2; continue; }
      if (source[j] === c) break;
      if (c !== '`' && source[j] === '\n') break;
      j += 1;
    }
    const end = Math.min(j, chars.length - 1);
    literals.set(i, { start: i, end, quote: c, value: source.slice(i + 1, end) });
    for (let k = i + 1; k < end; k += 1) if (chars[k] !== '\n') chars[k] = ' ';
    i = end;
  }
  return { masked: chars.join(''), literals };
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function literalAt(masked, literals, from) {
  let i = from;
  while (i < masked.length && /\s/.test(masked[i])) i += 1;
  return literals.get(i) ?? null;
}

function isDisplayLiteral(masked, literal) {
  if (literal.value.trim() === '') return false;
  if (NON_DISPLAY_VALUE.test(literal.value)) return false;
  const before = masked.slice(Math.max(0, literal.start - 80), literal.start);
  if (NON_DISPLAY_CONTEXT.some((re) => re.test(before))) return false;
  // object の key は property 名であって文言ではない（三項の第 1 アームも後続が ':' なので直前で切り分ける）
  const after = masked.slice(literal.end + 1).match(/^\s*(.)/)?.[1];
  return !(after === ':' && /[{,]\s*$/.test(before));
}

// 条件分岐の中かどうかは brace stack の header で見る: if/else/switch が開いた block、case ラベル、
// もしくは同じ行で先行する if(...)/&&/||/? を条件と見なす（brace の整形には依存しない）
function isConditional(masked, index) {
  const stack = [];
  for (let i = 0; i < index; i += 1) {
    if (masked[i] === '{') stack.push(masked.slice(Math.max(0, i - 200), i));
    else if (masked[i] === '}') stack.pop();
  }
  if (stack.some((header) => /(?:\bif\s*\([\s\S]*\)|\belse|\bswitch\s*\([\s\S]*\))\s*$/.test(header))) return true;
  const bodyStart = masked.lastIndexOf('{', index) + 1;
  if (/\bcase\b[^:\n]*:/.test(masked.slice(bodyStart, index))) return true;
  const lineStart = masked.lastIndexOf('\n', index) + 1;
  const prefix = masked.slice(lineStart, index);
  if (/&&|\|\||\?|\bif\s*\(|\belse\b|\bcase\b/.test(prefix)) return true;
  const previous = masked.slice(0, lineStart).split('\n').at(-2) ?? '';
  return /\b(?:if|else\s+if)\s*\([\s\S]*\)\s*$/.test(previous.trimEnd()) || /\belse\s*$/.test(previous.trimEnd());
}

// `) % 3` だけでは何の剰余か読めない。囲みの式まで戻して backend 経路と突き合わせられる形にする
function fixedLogicText(source, masked, start, end) {
  const lineStart = masked.lastIndexOf('\n', start) + 1;
  const open = [];
  for (let i = lineStart; i < start; i += 1) {
    if (masked[i] === '(') open.push(i);
    else if (masked[i] === ')') open.pop();
  }
  const paren = open.at(-1);
  // 制御構文・呼び出しの '(' は式の外側だが、grouping の '(' は式の一部なので括弧ごと残す
  let from = lineStart;
  if (paren !== undefined) {
    from = /(?:\bif|\bwhile|\bfor|\bswitch|[\w$])\s*$/.test(masked.slice(lineStart, paren)) ? paren + 1 : paren;
  }
  let boundary = from;
  for (let i = from; i < start; i += 1) {
    const c = masked[i];
    if (';{},?:'.includes(c)) boundary = i + 1;
    else if (c === '=' && !'=!<>'.includes(masked[i - 1]) && masked[i + 1] !== '=') boundary = i + 1;
    else if ((c === '&' || c === '|') && masked[i + 1] === c) boundary = i + 2;
  }
  const tail = masked.slice(end).match(/^\s*(?:===|!==|==|!=|>=|<=|>|<)\s*(?:-?\d+|[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/);
  return source.slice(boundary, end + (tail ? tail[0].length : 0)).trim().slice(0, 80);
}

// 補間・連結で組み立てた文言は、変数部分を … に潰した 1 行にして棚卸しに載せる
function valueRegion(masked, literal) {
  let start = literal.start;
  while (start > 0 && !REGION_START.has(masked[start - 1])) start -= 1;
  let end = literal.end + 1;
  while (end < masked.length && !REGION_END.has(masked[end])) end += 1;
  return { start, end };
}

function literalText(literal) {
  return literal.quote === '`' ? literal.value.replace(/\$\{[^}]*\}/g, '${…}') : literal.value;
}

function regionText(masked, literals, start, end) {
  const parts = [];
  let pending = '';
  const flush = () => {
    if (pending.trim() !== '') parts.push('…');
    pending = '';
  };
  for (let i = start; i < end; i += 1) {
    const literal = literals.get(i);
    if (literal) {
      flush();
      parts.push(literalText(literal));
      i = literal.end;
      continue;
    }
    if (masked[i] === '+') flush();
    else pending += masked[i];
  }
  flush();
  return parts.filter((part, i) => !(part === '…' && parts[i - 1] === '…')).join('');
}

function callArguments(masked, literals, openParen) {
  const close = masked.indexOf(')', openParen);
  const out = [];
  for (const literal of literals.values()) {
    if (literal.start > openParen && (close === -1 || literal.start < close)) out.push(literal);
  }
  return out;
}

export function extractBranches(source, fileName) {
  const { masked, literals } = maskSource(source, fileName);
  const rows = [];
  const push = (offset, kind, text) => rows.push({ file: fileName, line: lineAt(source, offset), kind, text });

  // 三項: 入れ子は同じ式に並ぶので、行末までの葉リテラルをまとめて 1 行に出す
  for (let i = 0; i < masked.length; i += 1) {
    if (masked[i] !== '?' || masked[i + 1] === '?' || masked[i + 1] === '.' || masked[i - 1] === '?') continue;
    const lineEnd = masked.indexOf('\n', i) === -1 ? masked.length : masked.indexOf('\n', i);
    const semicolon = masked.indexOf(';', i);
    const end = semicolon !== -1 && semicolon < lineEnd ? semicolon : lineEnd;
    if (!masked.slice(i + 1, end).includes(':')) continue;
    const arms = [...literals.values()].filter((l) => l.start > i && l.start < end && isDisplayLiteral(masked, l));
    if (arms.length) push(i, 'ternary', arms.map((l) => l.value).join(' | '));
    i = end;
  }

  // 補間つき template literal と、非 ASCII リテラルを含む連結
  const seenRegions = new Set();
  for (const literal of literals.values()) {
    if (!NON_ASCII.test(literal.value)) continue;
    const { start, end } = valueRegion(masked, literal);
    const isTemplate = literal.quote === '`' && literal.value.includes('${');
    if (!isTemplate && !masked.slice(start, end).includes('+')) continue;
    if (seenRegions.has(start)) continue;
    seenRegions.add(start);
    push(start, 'template-text', regionText(masked, literals, start, end).trim().slice(0, 80));
  }

  for (const match of masked.matchAll(TEXT_SINK)) {
    const literal = literalAt(masked, literals, match.index + match[0].length);
    if (literal && isDisplayLiteral(masked, literal) && isConditional(masked, match.index)) {
      push(match.index, 'conditional-text', literal.value);
    }
  }

  for (const match of masked.matchAll(CLASS_LIST)) {
    const args = callArguments(masked, literals, match.index + match[0].length - 1).map((l) => l.value).filter(Boolean);
    if (args.length) push(match.index, 'class-switch', args.join(' | '));
  }
  for (const pattern of [CLASS_NAME, DATASET]) {
    for (const match of masked.matchAll(pattern)) {
      const literal = literalAt(masked, literals, match.index + match[0].length);
      if (literal && literal.value.trim() !== '') push(match.index, 'class-switch', literal.value);
    }
  }
  // setAttribute は第 1 引数で行き先が決まる: aria-label は文言、data-* は状態フラグ
  for (const match of masked.matchAll(SET_ATTRIBUTE)) {
    const args = callArguments(masked, literals, match.index + match[0].length - 1);
    if (args.length < 2) continue;
    const [name, value] = args;
    if (value.value.trim() === '') continue;
    if (name.value === 'aria-label' && isDisplayLiteral(masked, value) && isConditional(masked, match.index)) {
      push(match.index, 'conditional-text', value.value);
    } else if (name.value.startsWith('data-')) {
      push(match.index, 'class-switch', `${name.value}=${value.value}`);
    }
  }

  for (const match of masked.matchAll(CASE_LABEL)) {
    const literal = literalAt(masked, literals, match.index + match[0].length);
    if (literal && isDisplayLiteral(masked, literal)) push(match.index, 'case', literal.value);
  }

  for (const pattern of [HISTORY_CALL, HISTORY_HASH]) {
    for (const match of masked.matchAll(pattern)) push(match.index, 'history', match[0].replace(/\s+/g, ''));
  }
  for (const literal of literals.values()) {
    if (HISTORY_EVENTS.has(literal.value)) push(literal.start, 'history', `"${literal.value}"`);
  }

  for (const match of masked.matchAll(FIXED_LOGIC)) {
    const lineStart = masked.lastIndexOf('\n', match.index) + 1;
    if (/\bfor\s*\(/.test(masked.slice(lineStart, match.index))) continue; // ループ境界は表示分岐ではない
    push(match.index, 'fixed-logic', fixedLogicText(source, masked, match.index, match.index + match[0].length));
  }

  for (const match of masked.matchAll(COMPARISON)) {
    const lineStart = masked.lastIndexOf('\n', match.index) + 1;
    const lineEnd = masked.indexOf('\n', match.index) === -1 ? masked.length : masked.indexOf('\n', match.index);
    const line = masked.slice(lineStart, lineEnd);
    if (/\bfor\s*\(/.test(line) || !COMPARISON_CONTEXT.test(line)) continue;
    push(match.index, 'comparison', source.slice(match.index, match.index + match[0].length).trim().slice(0, 80));
  }

  return rows.sort((a, b) => a.line - b.line || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

function defaultTargets() {
  if (!fs.existsSync(EXPORT_DIR)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (SCANNED_RE.test(entry.name)) out.push(p);
    }
  };
  walk(EXPORT_DIR);
  return out;
}

function exportRelative(file) {
  const rel = path.relative(EXPORT_DIR, file);
  return rel.startsWith('..') ? file : rel;
}

function cell(text) {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function main(args) {
  const json = args.includes('--json');
  const targets = args.filter((arg) => arg !== '--json');
  const files = targets.length ? targets.map((file) => path.resolve(process.cwd(), file)) : defaultTargets();
  if (files.length === 0) {
    console.log('mock-branches: 対象なし（docs/presentation/ui-mock/export/ が空）');
    return;
  }
  const rows = files
    .flatMap((file) => extractBranches(fs.readFileSync(file, 'utf8'), exportRelative(file)))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log('| file | line | kind | text |');
  console.log('| --- | --- | --- | --- |');
  for (const row of rows) console.log(`| ${cell(row.file)} | ${row.line} | ${row.kind} | ${cell(row.text)} |`);
  console.log('');
  for (const kind of KINDS) console.log(`${kind}: ${rows.filter((row) => row.kind === kind).length} 件`);
  console.log(`mock-branches: ${files.length} file(s) / 候補 ${rows.length} 件（backend 経路・bug・到達不能のいずれかに仕分ける）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
