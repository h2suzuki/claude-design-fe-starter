import type { BrowserContext, Page } from "@playwright/test";

export interface ConsoleFinding {
  kind: "exception" | "error" | "warning";
  text: string;
  where: string;
}

export function classify(entry: { type: string; text: string }): ConsoleFinding["kind"] | undefined {
  if (entry.type === "error") return "error";
  if (entry.type === "warning") return "warning";
  return undefined;
}

export function isAllowed(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function watchConsole(page: Page, where: string, patterns: readonly RegExp[]): ConsoleFinding[] {
  const findings: ConsoleFinding[] = [];
  page.on("console", (entry) => {
    const text = entry.text();
    const kind = classify({ type: entry.type(), text });
    if (kind && !isAllowed(text, patterns)) findings.push({ kind, text, where });
  });
  page.on("pageerror", (error) => {
    const text = error.message;
    if (!isAllowed(text, patterns)) findings.push({ kind: "exception", text, where });
  });
  return findings;
}

// page を開いてから張ると初期描画と hydration の出力を取りこぼすので、context 側で先に張る
export function watchContext(context: BrowserContext, where: string, patterns: readonly RegExp[]): ConsoleFinding[] {
  const findings: ConsoleFinding[] = [];
  context.on("console", (entry) => {
    const text = entry.text();
    const kind = classify({ type: entry.type(), text });
    if (kind && !isAllowed(text, patterns)) findings.push({ kind, text, where });
  });
  context.on("weberror", (webError) => {
    const text = webError.error().message;
    if (!isAllowed(text, patterns)) findings.push({ kind: "exception", text, where });
  });
  return findings;
}

export function describeFindings(findings: readonly ConsoleFinding[]): string {
  const counts = { exception: 0, error: 0, warning: 0 };
  for (const finding of findings) counts[finding.kind] += 1;
  return `exception ${counts.exception} / error ${counts.error} / warning ${counts.warning}`;
}

export function blocking(findings: readonly ConsoleFinding[]): ConsoleFinding[] {
  return findings.filter((finding) => finding.kind === "exception" || finding.kind === "error");
}
