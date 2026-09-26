import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    // CI runs this suite on a shared runner beside the other packages' builds
    // and lint, several times slower than a development machine: a property
    // test that takes one second on one took six on CI and failed the default
    // five-second timeout. A timeout here is a guard against a hang, so it is
    // sized for the slowest machine the suite runs on.
    testTimeout: 30_000,
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
        // The scoring engine is the correctness core — enforce 100%.
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
