// states.html は部品単体 fixture の入り口 — build に含めて常に検分可能に保つ
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        states: "states.html",
      },
    },
  },
});
