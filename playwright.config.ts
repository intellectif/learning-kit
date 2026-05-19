import { defineConfig, devices } from '@playwright/test';

/**
 * Root config (the E2E CI workflow gates on a root `playwright.config.ts`).
 * Specs live in the lk-react package; the example Vite app is the system
 * under test. A dedicated port (4173) avoids clashing with a developer's
 * own `pnpm dev` on 5173.
 */
const PORT = 4173;

export default defineConfig({
  testDir: './packages/lk-react/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Serves the pre-built dist (turbo builds the app before `turbo run e2e`
    // in CI); `vite preview` also serves the generated MSW worker.
    command: `pnpm --filter @intellectif/lk-example-vite exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
