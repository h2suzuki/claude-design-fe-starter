export type BranchKind = "ternary" | "conditional-text" | "class-switch" | "case" | "fixed-logic" | "history";
export type BranchRow = { file: string; line: number; kind: BranchKind; text: string };
export function extractBranches(source: string, fileName: string): BranchRow[];
