import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Phase 4 introduces browser mode. Phase 1 is Node-only.
    testTimeout: 10_000,
  },
});
