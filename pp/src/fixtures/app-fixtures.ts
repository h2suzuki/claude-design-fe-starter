// app が読む API の fixture（差し替え点）。空でも 404 fallback が実 BE への素通りを塞ぐ
import type { JsonResponder, PatternFixture } from "./route-intercept";

export const APP_API_FIXTURES: Record<string, JsonResponder> = {};
export const APP_API_PATTERNS: PatternFixture[] = [];
