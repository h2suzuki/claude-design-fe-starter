#!/usr/bin/env node
// LLM step の成果物が表どおりの model / effort で作られたかを session transcript で裏取りする
// 表より上（token の無駄）も表より下（見逃し）と同じく赤
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectFor, readDifficulty } from './llm-step.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');
const REVIEW_DIR = path.resolve(REPO_ROOT, 'docs/presentation/ui-review');
export const AGENT_LOG = path.resolve(SCRIPT_DIR, '../artifacts/agent-log.jsonl');

// 表の model は family（opus / sonnet）で書かれ、transcript の model は正式 id。上下の判定に順序が要る
const MODEL_TIERS = ['haiku', 'fable', 'sonnet', 'opus'];
const EFFORT_TIERS = ['low', 'medium', 'high', 'xhigh'];

// model は正式 id に family が含まれるかで、effort は列挙そのもので引く（xhigh は high を含むので部分一致にしない）
const modelRank = (value) => MODEL_TIERS.findIndex((tier) => String(value).includes(tier));
const effortRank = (value) => EFFORT_TIERS.indexOf(String(value));

// 記録の外に出せる形（repo 相対）で file を指す。temp dir 相手には絶対 path のまま返す
function displayPath(file) {
  const rel = path.relative(REPO_ROOT, file);
  return rel.startsWith('..') ? file : rel;
}

// verify-*.json は完了主張の独立検証（画面に紐づかないので表の上限 L で見る）、それ以外は画面の screenshot レビュー
export function collectArtefacts(reviewDir, screens) {
  if (!fs.existsSync(reviewDir)) return [];
  return fs
    .readdirSync(reviewDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      let record;
      try {
        record = JSON.parse(fs.readFileSync(path.join(reviewDir, name), 'utf8'));
      } catch {
        return [];
      }
      if (typeof record?.agentId !== 'string') return [];
      if (name.startsWith('verify-')) {
        return [{ file: name, step: 'verify-claims', slug: null, tier: 'L', agentId: record.agentId, at: typeof record.verifiedAt === 'string' ? record.verifiedAt : null }];
      }
      const slug = typeof record.screen === 'string' && record.screen !== '' ? record.screen : path.basename(name, '.json');
      return [{ file: name, step: 'screen-review', slug, tier: screens?.[slug]?.tier ?? null, agentId: record.agentId, at: typeof record.reviewedAt === 'string' ? record.reviewedAt : null }];
    });
}

// sidechain 行は agentId を持つ。持たない transcript では (model, effort) の集合でしか見られない
function attributionMode(lines) {
  return lines.some((line) => line?.isSidechain === true && typeof line.agentId === 'string') ? 'agentId' : 'sidechain-set';
}

function linesOf(lines, agentId, mode) {
  return lines.filter((line) => line?.isSidechain === true && (mode === 'agentId' ? line.agentId === agentId : true));
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
}

function firstUserText(lines) {
  const line = lines.find((entry) => entry?.type === 'user' || entry?.message?.role === 'user');
  return messageText(line?.message?.content);
}

export function resolveAgent(artefact, lines) {
  const direct = typeof artefact.agentId === 'string' && artefact.agentId !== '' ? linesOf(lines, artefact.agentId, 'agentId') : [];
  if (direct.length > 0) return { agentId: artefact.agentId, lines: direct, reason: null };
  const at = Date.parse(artefact.at ?? '');
  if (!Number.isFinite(at)) return { agentId: null, lines: [], reason: 'reviewedAt が無い（時刻で帰属を引けない）' };
  const groups = new Map();
  for (const line of lines) {
    if (line?.isSidechain !== true || typeof line.agentId !== 'string' || line.agentId === '') continue;
    const group = groups.get(line.agentId) ?? [];
    group.push(line);
    groups.set(line.agentId, group);
  }
  const candidates = [...groups.entries()].filter(([, side]) => {
    if (!side.some((line) => line?.attributionSkill === artefact.step)) return false;
    const stamps = side.map((line) => Date.parse(line?.timestamp ?? '')).filter((stamp) => Number.isFinite(stamp));
    return stamps.length > 0 && at >= Math.min(...stamps) - 5 * 60_000 && at <= Math.max(...stamps) + 5 * 60_000;
  });
  if (candidates.length === 1) return { agentId: candidates[0][0], lines: candidates[0][1], reason: null };
  if (candidates.length === 0) {
    return { agentId: null, lines: [], reason: `該当する subagent が transcript に無い（skill ${artefact.step} の sidechain が reviewedAt ${artefact.at} の前後に無い — 呼び忘れか、記録の時刻が違う）` };
  }
  const slugMatches = artefact.step === 'screen-review' && artefact.slug ? candidates.filter(([, side]) => firstUserText(side).includes(artefact.slug)) : [];
  if (slugMatches.length === 1) return { agentId: slugMatches[0][0], lines: slugMatches[0][1], reason: null };
  const ambiguous = slugMatches.length > 1 ? slugMatches : candidates;
  return { agentId: null, lines: [], reason: `候補が複数（${ambiguous.map(([agentId]) => agentId).join('、')}）` };
}

// 見直し（llm-steps:review）が cell ごとの token 中央値を出せるよう、実測を記録に残す
export function agentMetrics(side) {
  const usages = side.map((line) => line?.message?.usage).filter((usage) => usage && typeof usage === 'object');
  const tokens = usages.length
    ? usages.reduce((sum, usage) => sum + (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0), 0)
    : null;
  const stamps = side.map((line) => Date.parse(line?.timestamp ?? '')).filter((at) => Number.isFinite(at));
  const durationSeconds = stamps.length >= 2 ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 1000) : null;
  return { tokens, durationSeconds };
}

// 最も弱い model / effort で判定する（1 度でも表を下回っていれば表どおりではない）
const weakest = (values, rank) => [...values].sort((left, right) => rank(left) - rank(right))[0] ?? '';

export function auditArtefacts(artefacts, transcriptLines, expect = expectFor) {
  const mode = transcriptLines === null ? 'none' : attributionMode(transcriptLines);
  const rows = artefacts.map((artefact) => {
    const base = (agentId) => ({ file: artefact.file, step: artefact.step, slug: artefact.slug ?? null, tier: artefact.tier ?? null, agentId });
    const red = (line, agentId = null) => ({ ...base(agentId), level: 'red', model: null, effort: null, expectedModel: null, expectedEffort: null, line: `${artefact.file}: ${line}` });
    if (!artefact.tier) return red('difficulty.json が無い（bun run --cwd pp difficulty を先に）');
    const want = expect(artefact.step, artefact.tier);
    if (transcriptLines === null) return red('transcript が見つからない（$CLAUDE_TRANSCRIPT を渡す）');
    const resolved = resolveAgent(artefact, transcriptLines);
    const side = mode === 'sidechain-set' ? linesOf(transcriptLines, null, mode) : resolved.lines;
    if (mode !== 'sidechain-set' && resolved.reason) return red(resolved.reason);
    if (side.length === 0) return red(resolved.reason ?? 'sidechain が transcript に無い');
    const agentId = mode === 'sidechain-set' ? null : resolved.agentId;
    const foundBase = base(agentId);
    const label = mode === 'sidechain-set'
      ? (typeof artefact.agentId === 'string' && artefact.agentId !== '' ? artefact.agentId : 'agentId 不明')
      : resolved.agentId === artefact.agentId ? resolved.agentId : `agentId（transcript から: ${resolved.agentId}）`;
    const models = [...new Set(side.map((line) => line?.message?.model).filter((model) => typeof model === 'string'))];
    const efforts = [...new Set(side.map((line) => line?.effort).filter((effort) => typeof effort === 'string'))];
    if (models.length === 0 || efforts.length === 0) return red(`${label} の model / effort が transcript に無い`, agentId);
    const model = weakest(models, modelRank);
    const effort = weakest(efforts, effortRank);
    const note = mode === 'sidechain-set' ? '（agentId 単位の帰属が取れないため sidechain 全体で判定）' : '';
    const head = `${artefact.file}: ${label} ${model}/${effort}`;
    const found = { ...foundBase, model, effort, expectedModel: want.model, expectedEffort: want.effort };
    const gap = `要求は ${want.model}/${want.effort}`;
    const modelGap = modelRank(model) - modelRank(want.model);
    const effortGap = effortRank(effort) - effortRank(want.effort);
    if (modelGap < 0 || effortGap < 0) return { ...found, level: 'red', line: `${head} — 表より下（${gap}）${note}` };
    if (modelGap > 0 || effortGap > 0) return { ...found, level: 'red', line: `${head} — 表より上（もったいない、${gap}）${note}` };
    return { ...found, level: 'green', line: `${head} — 表どおり${note}` };
  });
  const red = rows.filter((row) => row.level === 'red').length;
  return { rows, red, attribution: mode, summary: `${rows.length} 件 / 赤 ${red} 件` };
}

// session ごとの transcript。subagent の行は隣の <session>/subagents/ に分かれて置かれるので併せて読む
export function findTranscript(repoRoot, env = process.env) {
  if (env.CLAUDE_TRANSCRIPT) return env.CLAUDE_TRANSCRIPT;
  const dir = path.join(os.homedir(), '.claude/projects', repoRoot.replaceAll('/', '-'));
  if (!fs.existsSync(dir)) return '';
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return files[0] ?? '';
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      if (line.trim() === '') return [];
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

export function loadTranscript(file) {
  if (!file || !fs.existsSync(file)) return null;
  const lines = readJsonl(file);
  const subagents = path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
  if (fs.existsSync(subagents)) {
    for (const name of fs.readdirSync(subagents).filter((entry) => entry.endsWith('.jsonl'))) {
      lines.push(...readJsonl(path.join(subagents, name)));
    }
  }
  return lines;
}

// 同じ成果物を何度監査しても行は増やさない（cell ごとの中央値が回数で歪む）
export function appendAgentLog(logFile, entries) {
  const seen = new Set(
    fs.existsSync(logFile)
      ? readJsonl(logFile).map((entry) => `${entry.file} ${entry.agentId}`)
      : [],
  );
  const fresh = entries.filter((entry) => !seen.has(`${entry.file} ${entry.agentId}`));
  if (fresh.length === 0) return 0;
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${fresh.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  return fresh.length;
}

function parseArgs(args) {
  const options = { reviewDir: REVIEW_DIR, transcript: '', logFile: AGENT_LOG, difficultyFile: '' };
  const keys = { '--review-dir': 'reviewDir', '--transcript': 'transcript', '--log': 'logFile', '--difficulty': 'difficultyFile' };
  for (let i = 0; i < args.length; i += 1) {
    if (!keys[args[i]]) throw new Error(`agent-audit: 未知の引数 ${args[i]}`);
    options[keys[args[i]]] = path.resolve(process.cwd(), args[i + 1] ?? '');
    i += 1;
  }
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
  const screens = options.difficultyFile ? readDifficulty(options.difficultyFile) : readDifficulty();
  const artefacts = collectArtefacts(options.reviewDir, screens);
  if (artefacts.length === 0) {
    console.log('agent-audit: 対象なし（docs/presentation/ui-review/ に agentId 付きの記録が無い）');
    return;
  }
  const file = options.transcript || findTranscript(REPO_ROOT);
  const lines = loadTranscript(file);
  console.log(lines === null ? 'transcript: 見つからない' : `transcript: ${displayPath(file)}（${lines.length} 行）`);
  const result = auditArtefacts(artefacts, lines, expectFor);
  if (result.attribution === 'sidechain-set') {
    console.log('帰属: agentId が transcript に無いため、sidechain 全体の model / effort で判定した');
  }
  for (const row of result.rows) console.log(row.line);
  const at = new Date().toISOString();
  const mode = result.attribution;
  appendAgentLog(
    options.logFile,
    result.rows.map((row) => ({
      at,
      file: row.file,
      step: row.step,
      slug: row.slug,
      tier: row.tier,
      agentId: row.agentId,
      model: row.model,
      effort: row.effort,
      verdict: row.level,
      expectedModel: row.expectedModel,
      expectedEffort: row.expectedEffort,
      ...(lines === null || (row.agentId === null && mode !== 'sidechain-set') ? { tokens: null, durationSeconds: null } : agentMetrics(linesOf(lines, row.agentId, mode))),
    })),
  );
  console.log(`agent-audit: ${result.summary}`);
  if (result.red > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
