import { shokiVitest } from 'dicta/vitest';
import { qwikVite } from '@qwik.dev/core/optimizer';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { testSSR } from 'vitest-browser-qwik/ssr-plugin';

// Stamp host-env values into the browser test bundle so tests can gate on
// SHOKI_INTEGRATION / platform without referencing Node-only `process.*`.
const SHOKI_INTEGRATION = process.env.SHOKI_INTEGRATION ?? '';
const SHOKI_PLATFORM = process.platform;

// Plugin order:
//  1. testSSR() — enables Qwik SSR-mode tests via `renderSSR()`.
//  2. qwikVite() — Qwik's JSX transform + optimizer.
//  3. shokiVitest() — BrowserCommands + auto singleThread + matcher wiring.
//
// Vitest 4 uses the `playwright()` provider factory from
// `@vitest/browser-playwright`; vitest-browser-qwik@0.3+ peer-depends on
// Vitest ^4, so the example runs Vitest 4 while the rest of the monorepo
// stays on Vitest 3. shoki's peer range is `^3 || ^4`.
export default defineConfig({
  plugins: [testSSR(), qwikVite(), shokiVitest()],
  define: {
    'import.meta.env.SHOKI_INTEGRATION': JSON.stringify(SHOKI_INTEGRATION),
    'import.meta.env.SHOKI_PLATFORM': JSON.stringify(SHOKI_PLATFORM),
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/vitest.setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    testTimeout: 30_000,
  },
});
