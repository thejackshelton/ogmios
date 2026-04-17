import { shokiVitest } from '@shoki/vitest';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Stamp host-env values into the browser test bundle so tests can gate on
// SHOKI_INTEGRATION / platform without referencing Node-only `process.*`.
const SHOKI_INTEGRATION = process.env.SHOKI_INTEGRATION ?? '';
const SHOKI_PLATFORM = process.platform;

export default defineConfig({
  plugins: [react(), shokiVitest()],
  define: {
    'import.meta.env.SHOKI_INTEGRATION': JSON.stringify(SHOKI_INTEGRATION),
    'import.meta.env.SHOKI_PLATFORM': JSON.stringify(SHOKI_PLATFORM),
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/vitest.setup.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    testTimeout: 30_000,
  },
});
