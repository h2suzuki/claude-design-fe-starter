// 画面ごとの登録点を引く機構。表そのものは screens.ts（PJ が埋める差し替え点）にある
import type { BrowserContext, Page } from "@playwright/test";
import type { JsonResponder, PatternFixture } from "./fixtures/route-intercept";
import { MOCK_ENTRY_FILE } from "./config";
import { screenSlug } from "./mock-screens";
import { SCREENS } from "./screens";

export interface NamedStep {
  name: string;
  run: (page: Page) => Promise<void>;
}

// 一覧を持つ画面だけが埋める。key 属性は app 側の行に付与して差し替える
export interface ListRegistration {
  rowSelector: string;
  rowKeyAttribute: string;
  detailKeySelector: string;
}

export interface ScreenSpec {
  // 対応する app の route。PP_MOCK_FILE の slug で引くので、画面ごとに env を増やさない
  entryPath: string;
  // 本番 markup に test 都合を混ぜず、root の専用属性（data-ready 等）を指す
  appReadySelector: string;
  // mock 側は markup の出所が app と違うので、同じセレクタを共有できない
  mockReadySelector: string;
  // 画面状態を変える操作（行選択・ソート・タブ切替・モーダル開閉等）。空でも初期状態は検証される
  interactions: NamedStep[];
  // run は dialog が可視になるまで進める
  modals: NamedStep[];
  // 選択行に対する状態変更操作。run は完了まで進める
  edges: NamedStep[];
  // 描画前に決まっていなければならない状態（theme 等）。apply は cookie / addInitScript で navigation 前に仕込む
  prePaintStates?: { name: string; apply: (context: BrowserContext) => Promise<void> }[];
  list?: ListRegistration;
  // 画面固有の API fixture。省略すると fixtures/app-fixtures.ts の共通 fixture が使われる
  fixtures?: Record<string, JsonResponder>;
  fixturePatterns?: PatternFixture[];
}

// 綴り違いを skip で黙らせない — 未登録なら止めて、足りない slug と登録済みの slug を並べる
export function resolveScreen(
  screens: Record<string, ScreenSpec>,
  mockEntryFile: string,
): ScreenSpec | undefined {
  const slug = screenSlug(mockEntryFile);
  if (slug === "") return undefined;
  const screen = screens[slug];
  if (!screen) {
    const known = Object.keys(screens).join(", ") || "（空）";
    throw new Error(`pp: SCREENS に "${slug}" の登録がない — src/screens.ts に足す。登録済み: ${known}`);
  }
  return screen;
}

export const CURRENT_SCREEN = resolveScreen(SCREENS, MOCK_ENTRY_FILE);
export const SCREEN_CONFIGURED = CURRENT_SCREEN !== undefined;
