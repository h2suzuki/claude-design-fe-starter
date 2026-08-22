// adapter-auto は deploy 先を build 時に解決する。Vercel では Node runtime が既定になる
import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() },
};
