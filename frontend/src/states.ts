// 部品単体の states fixture — 全状態を 1 画面に並べて検分する。新部品はこの形を複製して完成条件にする
import "./ui/tokens/tokens.css";
import { createEmptyStateBand } from "./ui/components/empty-state-band";
import type { EmptyStateBandProps } from "./ui/components/empty-state-band";

const LONG_MESSAGE =
  "長文の状態: 文言領域は最長文言の寸法で設計されているか、複数行に折り返しても部品の外形と周辺 layout が動かないかをこの状態で検分する。";

const STATES: Array<{ label: string; props: EmptyStateBandProps }> = [
  { label: "info", props: { variant: "info", message: "まだ何も選択されていません" } },
  { label: "empty", props: { variant: "empty", message: "データがありません" } },
  { label: "error + action", props: { variant: "error", message: "読み込みに失敗しました", actionLabel: "再試行" } },
  { label: "長文", props: { variant: "info", message: LONG_MESSAGE } },
];

const mount = document.getElementById("states");
if (!mount) throw new Error("mount point #states not found");

for (const { label, props } of STATES) {
  const heading = document.createElement("h2");
  heading.textContent = label;
  const band = createEmptyStateBand(props);
  mount.append(heading, band);
}
