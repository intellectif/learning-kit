import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    // `scripts/mutate.mjs` builds a scratch copy of src/ here. It excludes test
    // directories, so this is the second line of defence for a run killed
    // mid-flight — a collected copy fails on its own relative imports.
    exclude: ['**/node_modules/**', '**/dist/**', '.mutants/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['**/__tests__/**', '**/*.test.*'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // The scoring engine is the correctness core — enforce 100% (Req 21.7).
        'src/scoring/**': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
