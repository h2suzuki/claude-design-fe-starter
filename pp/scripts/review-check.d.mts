export type ReviewDirs = {
  exportDir: string;
  screenshotsDir: string;
  reviewDir: string;
  referencePagesFile: string;
  ledgerFile: string;
};
export type ReviewScreen = { slug: string; ok: boolean; problems: string[]; lines: string[] };
export type ReviewResult = { screens: ReviewScreen[]; red: number; summary: string };
export function checkReviews(dirs?: ReviewDirs): ReviewResult;
export function reviewTemplate(options: { screenshotsDir: string; slug: string }): {
  version: string;
  screen: string;
  reviewedAt: string;
  model: string;
  effort: string;
  agentId: string;
  screenshots: { file: string; sha256: string }[];
  findings: { text: string; disposition: string }[];
};
