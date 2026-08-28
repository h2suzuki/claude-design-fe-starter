// 検証条件の単一定義点。基準 viewport・locale・時計は PJ 開始時にここで確定する
import type { BrowserContextOptions, LaunchOptions } from "@playwright/test";

// 第一正本 = mobile、第二正本 = desktop。値は例 — PJ の基準に合わせて差し替える
export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

// 基準 2 点とは役割が違う: ここは崩れないことだけ見る範囲で、pixel 一致は取らない
// 差し替え点。下限・上限は発注規約（seed-docs/design-order-template.md 項目 1）と同じ数値にする
export const SWEEP_WIDTHS: readonly number[] = [360, 390, 480, 640, 768, 1024, 1280, 1440, 1680, 1920];
// mock/app に breakpoint を導入したら境界 ±1px をここへ足す（急変点の検証）
export const BREAKPOINT_EDGE_WIDTHS: readonly number[] = [];

// 差し替え点。検証の時計であり、AST の抽出日もこの帯で刻む
export const TIMEZONE = "Asia/Tokyo";

const SHARED = {
  colorScheme: "light",
  reducedMotion: "reduce",
  locale: "ja-JP",
  timezoneId: TIMEZONE,
} satisfies BrowserContextOptions;

// 第一正本は touch device emulation ごと固定する（DPR・touch を機械 gate の基準条件に含める）
export const MOBILE_CONTEXT_OPTIONS: BrowserContextOptions = {
  ...SHARED,
  viewport: MOBILE_VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

// canvas/SVG の pixel 検証を使う場合、DPR=1 が bitmap == CSS px の前提になる
export const DESKTOP_CONTEXT_OPTIONS: BrowserContextOptions = {
  ...SHARED,
  viewport: DESKTOP_VIEWPORT,
  deviceScaleFactor: 1,
};

export function sweepContextOptions(width: number): BrowserContextOptions {
  return { ...SHARED, viewport: { width, height: 900 }, deviceScaleFactor: 1 };
}

// 色 profile 固定 + LCD/subpixel 無効 + GPU off で anti-aliasing を決定的にする
export const PP_LAUNCH_ARGS: string[] = [
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  "--font-render-hinting=none",
  "--disable-gpu",
  "--disable-font-subpixel-positioning",
];

export const PP_LAUNCH_OPTIONS: LaunchOptions = { args: PP_LAUNCH_ARGS, headless: true };

// app 側 spec は URL を明示的に渡したときだけ走る（未設定なら skip — 黙って実 BE へ向かわせない）
export const APP_BASE_URL = process.env.PP_APP_URL ?? "";
export const APP_CONFIGURED = APP_BASE_URL !== "";

// docs/presentation/ui-mock/export/ 内の parity 突合先ファイル。walking skeleton の凍結第 1 号で確定する
export const MOCK_ENTRY_FILE = process.env.PP_MOCK_FILE ?? "";

// その画面に対応する app の route。画面ごとに gate を回すときは PP_MOCK_FILE と対で渡す
export const APP_ENTRY_PATH = process.env.PP_APP_PATH ?? "/";
export const MOCK_CONFIGURED = MOCK_ENTRY_FILE !== "";

// 両側の時計をこの瞬間に固定する。mock 内の日付表現と一致させて差し替える
export const PP_PINNED_NOW_ISO = "2026-01-01T12:00:00+09:00";

// self-baseline スクショ回帰の対象 path（app の route を PJ で列挙する）
export const SELF_BASELINE_PATHS: readonly string[] = ["/"];
