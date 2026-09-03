export type LogEntry = {
  step: string;
  tier: string;
  tokens: number | null;
  verdict: string;
  fixRounds?: number;
  laterBugs?: number;
};
export type ReviewRow = { step: string; tier: string; count: number; tokens: number | null; red: number; proposal: string };
export const AGENT_LOG: string;
export function reviewCells(entries: LogEntry[]): { rows: ReviewRow[]; proposals: number };
export function readLog(file: string): LogEntry[] | null;
