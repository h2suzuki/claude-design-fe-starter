// data-visual-id ↔ {mockSel, appSel} の対応表。既定は screen AST からの導出で、mock 側 selector は
// AST の source.nodeRef、app 側は data-visual-id 属性。AST から導けない対だけ MANUAL_PAIRS に書く
import { MOCK_ENTRY_FILE } from "./config";
import { deriveSelectorMap } from "./ast-selector-map";
import { UI_AST_SCREENS_DIR } from "./mock-server";

export interface SelectorPair {
  mockSel: string;
  appSel: string;
}

export const nthMatch = (sel: string, n: number): string => `:nth-match(${sel}, ${n})`;

// 手書き override。記入例:
//   "empty-state-band": { mockSel: 'div:has(> span:text-is("データがありません"))', appSel: '[data-visual-id="empty-state-band"]' },
export const MANUAL_PAIRS: Record<string, SelectorPair> = {};

const derived = deriveSelectorMap(UI_AST_SCREENS_DIR, MOCK_ENTRY_FILE);

export const SELECTOR_MAP: Record<string, SelectorPair> = { ...derived.pairs, ...MANUAL_PAIRS };
export const SELECTOR_MAP_ISSUES: readonly string[] = derived.issues;
// 操作後にしか現れない id。基準幅の突合からは外し、状態突合だけが使う
export const STATE_ONLY_IDS: readonly string[] = derived.stateOnly.filter((visualId) => !(visualId in MANUAL_PAIRS));

// geometry 比較の座標原点にする visual id（未指定なら SELECTOR_MAP の先頭 entry を使う）
export const ANCHOR_VISUAL_ID = "";
