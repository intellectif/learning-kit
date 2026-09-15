import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    // CI runs this suite on a shared runner beside the other packages' builds
    // and lint, several times slower than a development machine. A timeout
    // here is a guard against a hang, so it is sized for the slowest machine
    // the suite runs on, not the default five seconds.
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.ts'],
    // Unit/component tests only live in src/. `e2e/` holds Playwright specs
    // (own runner, imports @playwright/test) — Vitest must not collect them.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      exclude: ['**/__tests__/**', '**/*.test.*', '**/test-support/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
