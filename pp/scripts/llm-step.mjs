#!/usr/bin/env node
// seed-docs/llm-steps.md の対応表の唯一の機械可読な写し。発注側（Agent tool の model 指定）も
// 事後監査（agent-audit）もここだけを見るので、doc を直したらこの表を同じ commit で直す
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// 難易度は difficulty tool の出力から読む（目視の印象で S にしない）。test だけが別 path を指す
export const DIFFICULTY_FILE = process.env.PP_DIFFICULTY_FILE ?? path.resolve(SCRIPT_DIR, '../artifacts/difficulty.json');

const claude = (model, effort) => ({ executor: 'claude-subagent', model, effort });
// codex の effort は codex-delegation skill の既定に従う（正しさクリティカルな L だけ high）
const codex = (model, effort) => ({ executor: 'codex', model, effort });

export const STEP_TABLE = {
  'branch-route': { S: claude('opus', 'medium'), M: claude('opus', 'high'), L: claude('opus', 'high') },
  'ast-extract': { S: claude('opus', 'medium'), M: claude('opus', 'high'), L: claude('opus', 'xhigh') },
  'pre-implementation-questions': { S: claude('sonnet', 'medium'), M: claude('sonnet', 'medium'), L: claude('opus', 'medium') },
  implement: { S: codex('gpt-5.6-luna', 'default'), M: codex('gpt-5.6-terra', 'default'), L: codex('gpt-5.6-sol', 'high') },
  'gate-diagnose': { S: claude('opus', 'medium'), M: claude('opus', 'high'), L: claude('opus', 'high') },
  'screen-review': { S: claude('opus', 'medium'), M: claude('opus', 'high'), L: claude('opus', 'high') },
  'keep-impl-draft': { S: claude('sonnet', 'medium'), M: claude('sonnet', 'medium'), L: claude('sonnet', 'medium') },
  'production-smoke': { S: claude('sonnet', 'medium'), M: claude('opus', 'medium'), L: claude('opus', 'high') },
  'verify-claims': { S: claude('opus', 'high'), M: claude('opus', 'high'), L: claude('opus', 'high') },
};

export function expectFor(step, tier) {
  const row = STEP_TABLE[step];
  if (!row) throw new Error(`llm-step: 表に無い step ${step}（${Object.keys(STEP_TABLE).join(' / ')}）`);
  const cell = row[tier];
  if (!cell) throw new Error(`llm-step: 難易度は S / M / L のいずれか（${tier}）`);
  return cell;
}

export function readDifficulty(file = DIFFICULTY_FILE) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).screens ?? {};
}

function main(args) {
  const json = args.includes('--json');
  const rest = args.filter((arg) => arg !== '--json');
  if (rest[0] !== '--expect' || rest.length !== 3) {
    console.error('llm-step: 使い方は --expect <step> <slug> [--json]');
    process.exitCode = 2;
    return;
  }
  const [, step, slug] = rest;
  const screens = readDifficulty();
  if (screens === null) {
    console.log('difficulty.json が無い（bun run --cwd pp difficulty を先に）');
    process.exitCode = 1;
    return;
  }
  const tier = screens[slug]?.tier;
  if (!tier) {
    console.log(`difficulty.json に ${slug} が無い（bun run --cwd pp difficulty を先に）`);
    process.exitCode = 1;
    return;
  }
  let expected;
  try {
    expected = expectFor(step, tier);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (json) {
    console.log(JSON.stringify({ step, slug, tier, ...expected }, null, 2));
    return;
  }
  console.log(
    `${step} ${slug}: tier ${tier} → executor ${expected.executor} / model ${expected.model} / effort ${expected.effort}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
