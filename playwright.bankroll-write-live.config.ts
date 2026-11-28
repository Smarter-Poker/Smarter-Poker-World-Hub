import { defineConfig, devices } from '@playwright/test';

/**
 * bankroll-write-live: write-path verification of the published Bankroll
 * Manager (e2e/bankroll-write-live.spec.ts). Run only by the
 * `bankroll-write-live` suite of .github/workflows/e2e-tests.yml, always
 * against https://smarter.poker, signed in as the platform service account
 * (the shared e2e/00-auth.setup.ts; it refuses to guess an account).
 *
 * One worker, one 375px project, no retries: the steps write and then remove
 * their own rows in order, and a retry would replay writes over a half-run.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/bankroll-write-live/artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/bankroll-write-live/report.json' }]],
  use: {
    baseURL: 'https://smarter.poker',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
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
      name: 'bankroll-write-live-mobile-375',
      testMatch: /bankroll-write-live\.spec\.ts$/,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
