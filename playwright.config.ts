import { defineConfig, devices } from '@playwright/test';
import { FAKE_SPEECH_WAV } from './packages/lk-react/e2e/fake-speech.js';

/**
 * Root config (the E2E CI workflow gates on a root `playwright.config.ts`).
 * Specs live in the lk-react package; the example Vite app is the system
 * under test. A dedicated port (4173) avoids clashing with a developer's
 * own `pnpm dev` on 5173.
 */
const PORT = 4173;

/**
 * What the read-aloud flow needs from the browser, and nothing else needs to
 * care about.
 *
 * The first two are the usual pair: auto-grant the microphone (no prompt a
 * keyboard-driven spec could not dismiss) and synthesise a device instead of
 * opening real hardware, which no CI runner has. The third is the one that is
 * easy to leave out and hard to diagnose — chromium's synthetic device is a
 * beep, and a beep is refused by the example app's plausibility policy long
 * before any feedback renders. `fake-speech.ts` says why at length, and
 * `globalSetup` writes the file this points at.
 *
 * They sit on the project rather than on one spec so that a second spec that
 * opens a microphone inherits them; no other spec captures audio, and a fake
 * device nobody opens changes nothing for them.
 */
const FAKE_MEDIA_ARGS = [
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_SPEECH_WAV}%noloop`,
];

export default defineConfig({
  testDir: './packages/lk-react/e2e',
  globalSetup: './packages/lk-react/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: FAKE_MEDIA_ARGS } },
    },
  ],
  webServer: {
    // Serves the pre-built dist (turbo builds the app before `turbo run e2e`
    // in CI); `vite preview` also serves the generated MSW worker.
    command: `pnpm --filter @intellectif/lk-example-vite exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
