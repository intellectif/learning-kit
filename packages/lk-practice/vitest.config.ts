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
      // learner practises next, for the log, its state and its status, and for
      // the planner (design section 10; revised in M6), and for the grader,
      // generator and decomposition contracts (revised in M7), and for the
      // `./lk-core` adapter (revised in M10).
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        'src/evidence/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/stage/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/mastery/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/log/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/schema/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/status/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/planner/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/contracts/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/adapters/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/practice.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
