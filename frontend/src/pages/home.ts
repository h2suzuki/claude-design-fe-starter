// page は薄い composition に保つ — 部品の生成と配置だけを行い、意匠は ui/ 側に置く
import { createEmptyStateBand } from "../ui/components/empty-state-band";

export function renderHomePage(mount: HTMLElement): void {
  mount.append(
    createEmptyStateBand({
      variant: "empty",
      message: "まだ画面がありません。walking skeleton の部品第 1 号でこの page を置き換える",
    }),
  );
}
