export type StepExecutor = "claude-subagent" | "codex";
export type StepTier = "S" | "M" | "L";
export type StepExpectation = { executor: StepExecutor; model: string; effort: string };
export type ScreenDifficulty = { tier: StepTier; states: number; routes: number; history: boolean; overlay: boolean };
export const DIFFICULTY_FILE: string;
export const STEP_TABLE: Record<string, Record<StepTier, StepExpectation>>;
export function expectFor(step: string, tier: string): StepExpectation;
export function readDifficulty(file?: string): Record<string, ScreenDifficulty> | null;
