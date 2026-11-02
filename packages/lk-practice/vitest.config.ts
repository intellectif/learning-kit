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
      // The repository's gate, and 100% for the modules that decide what a
      // learner practises next (design section 10); the planner joins in M6.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/evidence/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/stage/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/mastery/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
