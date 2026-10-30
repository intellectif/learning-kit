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
      // Every line here decides the evidence a grade is made of.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
