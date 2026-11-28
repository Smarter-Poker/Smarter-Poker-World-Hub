import { defineConfig, devices } from '@playwright/test';

/**
 * bankroll-live: read-only signed-in verification of the published Bankroll
 * Manager (e2e/bankroll-live.spec.ts). Run only by the `bankroll-live` suite
 * of .github/workflows/e2e-tests.yml, always against https://smarter.poker.
 *
 * No retries: a flake here is evidence about production, and a retry would
 * hide it. The sign-in is the shared e2e/00-auth.setup.ts (TEST_USER_EMAIL,
 * the platform service account; it refuses to guess an account).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 3,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/bankroll-live/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/bankroll-live/report.json' }]],
  use: {
    baseURL: 'https://smarter.poker',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    timezoneId: 'America/Chicago',
    locale: 'en-US',
  },
  projects: [
    { name: 'setup', testMatch: /00-auth\.setup\.ts$/ },
    {
      name: 'bankroll-live-mobile-375',
      testMatch: /bankroll-live\.spec\.ts$/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'bankroll-live-desktop',
      testMatch: /bankroll-live\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
