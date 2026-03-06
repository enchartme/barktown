import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    prerender: {
      handleHttpError: ({ path, referrer, message }) => {
        if (path.includes('favicon')) return;

        throw new Error(message);
      }
    },
    adapter: adapter()
  }
};

export default config;
