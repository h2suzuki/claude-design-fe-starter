import type { StepExpectation, StepTier } from "./llm-step.mjs";
export type Artefact = { file: string; step: string; slug: string | null; tier: StepTier | null; agentId?: string };
export type AuditRow = {
  file: string;
  step: string;
  slug: string | null;
  tier: StepTier | null;
  agentId: string | null;
  model: string | null;
  effort: string | null;
  expectedModel: string | null;
  expectedEffort: string | null;
  level: "green" | "red";
  line: string;
};
export type AuditResult = { rows: AuditRow[]; red: number; attribution: "agentId" | "sidechain-set" | "none"; summary: string };
export const AGENT_LOG: string;
export function collectArtefacts(reviewDir: string, screens: Record<string, { tier: StepTier }> | null): Artefact[];
export function agentMetrics(side: unknown[]): { tokens: number | null; durationSeconds: number | null };
export function auditArtefacts(
  artefacts: Artefact[],
  transcriptLines: Record<string, unknown>[] | null,
  expect?: (step: string, tier: string) => StepExpectation,
): AuditResult;
export function findTranscript(repoRoot: string, env?: NodeJS.ProcessEnv): string;
export function loadTranscript(file: string): Record<string, unknown>[] | null;
export function appendAgentLog(logFile: string, entries: Record<string, unknown>[]): number;
