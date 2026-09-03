// 画面ごとの実装難易度。発注の重さ（どの LLM step をどの model / effort で回すか）をここ 1 点で決める。
// 段は seed-docs/llm-steps.md「難易度 S / M / L」の表そのもので、1 つでも上の段に当たれば上の段にする
export type DifficultyTier = "S" | "M" | "L";

export interface DifficultyInput {
  states: number;
  routes: number;
  history: boolean;
  overlay: boolean;
}

const ORDER: DifficultyTier[] = ["S", "M", "L"];

const band = (tiers: [boolean, boolean]): DifficultyTier => (tiers[1] ? "L" : tiers[0] ? "M" : "S");

export function difficultyTier({ states, routes, history, overlay }: DifficultyInput): DifficultyTier {
  // 表の第 3 列は overlay / history / form の該当数。2 つ以上で L、1 つで M（form は機械で出ないので測らない）
  const features = (overlay ? 1 : 0) + (history ? 1 : 0);
  const bands = [band([states >= 2, states >= 11]), band([routes >= 1, routes >= 3]), band([features >= 1, features >= 2])];
  return bands.reduce((worst, tier) => (ORDER.indexOf(tier) > ORDER.indexOf(worst) ? tier : worst), "S");
}
