<!-- page は薄い composition に保つ — 部品の配置だけを行い、意匠は $lib/ui 側に置く -->
<script lang="ts">
  import EmptyStateBand from "$lib/ui/components/EmptyStateBand.svelte";
</script>

<EmptyStateBand
  variant="empty"
  message="まだ画面がありません。walking skeleton の部品第 1 号でこの page を置き換える"
/>
