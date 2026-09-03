// skill の effort は frontmatter でしか変えられない。tier 別の skill が本文を共有し、表（llm-step.mjs）と 1 対 1 であることを固定する
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { STEP_TABLE } from "../scripts/llm-step.mjs";

const SKILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.claude/skills");

function skill(name: string): { front: Record<string, string>; body: string } {
  const text = readFileSync(path.join(SKILLS, name, "SKILL.md"), "utf8");
  const [, head, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) ?? [];
  const front = Object.fromEntries(head!.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]));
  return { front, body: body! };
}

for (const [step, base] of [["screen-review", "screen-review"], ["gate-diagnose", "gate-diagnose"]] as const) {
  test(`${base}-s と ${base} は本文が同一で、frontmatter の effort だけが表の S と M / L に一致する`, () => {
    const small = skill(`${base}-s`);
    const large = skill(base);
    expect(small.body).toBe(large.body);
    expect(small.front.effort).toBe(STEP_TABLE[step].S.effort);
    expect(large.front.effort).toBe(STEP_TABLE[step].M.effort);
    expect(large.front.effort).toBe(STEP_TABLE[step].L.effort);
    expect(small.front.model).toBe(STEP_TABLE[step].S.model);
    expect(large.front.model).toBe(STEP_TABLE[step].L.model);
  });
}

test("verify-claims は全段 high で frontmatter と表が一致する", () => {
  const { front } = skill("verify-claims");
  for (const tier of ["S", "M", "L"] as const) expect(front.effort).toBe(STEP_TABLE["verify-claims"][tier].effort);
});
