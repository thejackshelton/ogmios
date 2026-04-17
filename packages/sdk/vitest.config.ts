import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration + stress + crash-recovery suites are gated inside each test
    // file (describe.skip when env not set); no need to exclude them here.
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Default 10s; Plan 07's stress / crash / integration tests override per-
    // test with their own `testTimeout` value.
    testTimeout: 10_000,
  },
});
