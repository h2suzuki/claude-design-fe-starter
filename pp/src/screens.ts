// 画面ごとの登録点（差し替え点）。key は PP_MOCK_FILE の slug で、引く側の機構は src/screen-registry.ts が持つ
import type { ScreenSpec } from "./screen-registry";

export const SCREENS: Record<string, ScreenSpec> = {};
