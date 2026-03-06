import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    prerender: {
      // Don't crash the build when a linked static asset (e.g. favicon) is missing.
      handleHttpError: ({ path, referrer, message }) => {
        if (path.includes('favicon')) return;
        throw new Error(message);
      },
    },
    adapter: adapter({
      // Static output folder
      pages:  'build',
      assets: 'build',
      // No SPA fallback – every route is fully prerendered
      fallback:     undefined,
      precompress:  false,
      strict:       true,
    }),
  },
};

export default config;
