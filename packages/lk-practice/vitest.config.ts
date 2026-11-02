import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Sized for CI's shared runner, as lk-core's suite is.
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['**/__tests__/**', '**/*.test.*'],
      // The repository's gate. The modules that decide what a learner practises
      // next get their own 100% thresholds as they are added.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
