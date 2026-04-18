import { qwikVite } from '@qwik.dev/core/optimizer';
import { defineConfig } from 'vite';
import { testSSR } from 'vitest-browser-qwik/ssr-plugin';

// `testSSR()` comes first: the plugin from vitest-browser-qwik needs to run
// before qwikVite()'s JSX transform so SSR-mode tests pick up the server
// renderer. Keep this order or `renderSSR()` will degrade to CSR silently.
export default defineConfig({
  plugins: [testSSR(), qwikVite()],
});
