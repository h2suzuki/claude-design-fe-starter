// 部品先行構造の見本第 1 号。状態は props で受け、hover に依存せず、外形寸法を状態間で変えない
import "./empty-state-band.css";

export type EmptyStateVariant = "info" | "empty" | "error";

export interface EmptyStateBandProps {
  variant: EmptyStateVariant;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ICONS: Record<EmptyStateVariant, string> = { info: "ℹ", empty: "○", error: "△" };

export function createEmptyStateBand(props: EmptyStateBandProps): HTMLElement {
  const root = document.createElement("section");
  root.className = "empty-state-band";
  // parity 用の安定 selector — 新部品は必ず data-visual-id を持つ（pp/src/selector-map.ts と対応）
  root.dataset.visualId = "empty-state-band";
  root.dataset.variant = props.variant;

  const inner = document.createElement("div");
  inner.className = "esb-inner";

  const icon = document.createElement("span");
  icon.className = "esb-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = ICONS[props.variant];

  const message = document.createElement("p");
  message.className = "esb-message";
  message.textContent = props.message;

  inner.append(icon, message);
  if (props.actionLabel) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "esb-action";
    action.textContent = props.actionLabel;
    if (props.onAction) action.addEventListener("click", props.onAction);
    inner.append(action);
  }
  root.append(inner);
  return root;
}
