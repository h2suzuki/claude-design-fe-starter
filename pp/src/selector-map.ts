// data-visual-id ↔ {mockSel, appSel} の対応表。app 側は [data-visual-id] 属性、mock 側は凍結 export の
// 静的読解から導く（:text-is()/:nth-match() 等の Playwright 拡張可。実在確認は npm run verify-selectors）
export interface SelectorPair {
  mockSel: string;
  appSel: string;
}

export const nthMatch = (sel: string, n: number): string => `:nth-match(${sel}, ${n})`;

// walking skeleton の部品第 1 号でここを埋めると sample-parity spec の skip が外れる。記入例:
//   "empty-state-band": { mockSel: 'div:has(> span:text-is("データがありません"))', appSel: '[data-visual-id="empty-state-band"]' },
export const SELECTOR_MAP: Record<string, SelectorPair> = {};

// geometry 比較の座標原点にする visual id（未指定なら SELECTOR_MAP の先頭 entry を使う）
export const ANCHOR_VISUAL_ID = "";
