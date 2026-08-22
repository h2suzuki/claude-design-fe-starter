<!-- 部品先行構造の見本第 1 号。状態は props で受け、hover に依存せず、外形寸法を状態間で変えない -->
<script lang="ts">
  export type EmptyStateVariant = "info" | "empty" | "error";

  interface Props {
    variant: EmptyStateVariant;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  }

  const ICONS: Record<EmptyStateVariant, string> = { info: "ℹ", empty: "○", error: "△" };

  let { variant, message, actionLabel, onAction }: Props = $props();
</script>

<!-- parity 用の安定 selector — 新部品は必ず data-visual-id を持つ（pp/src/selector-map.ts と対応） -->
<section class="empty-state-band" data-visual-id="empty-state-band" data-variant={variant}>
  <div class="esb-inner">
    <span class="esb-icon" aria-hidden="true">{ICONS[variant]}</span>
    <p class="esb-message">{message}</p>
    {#if actionLabel}
      <button type="button" class="esb-action" onclick={onAction}>{actionLabel}</button>
    {/if}
  </div>
</section>

<style>
  /* 部品は @container で自分の置かれた幅に応答する — viewport（@media）は page shell だけが見る */
  .empty-state-band {
    container-type: inline-size;
  }

  .esb-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    /* 状態間で外形寸法を変えない — 最長文言 + action ボタンでも収まる高さを確保する */
    min-height: 120px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    text-align: center;
  }

  @container (min-width: 480px) {
    .esb-inner {
      flex-direction: row;
      justify-content: flex-start;
      text-align: start;
    }
  }

  .esb-icon {
    font-size: 24px;
    color: var(--color-text-subtle);
  }

  .empty-state-band[data-variant="error"] .esb-icon {
    color: var(--color-warn);
  }

  .esb-message {
    margin: 0;
    color: var(--color-text-subtle);
  }

  .esb-action {
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-1);
    background: transparent;
    color: var(--color-accent);
    font: inherit;
    cursor: pointer;
  }
</style>
