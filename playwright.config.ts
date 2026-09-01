import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The authenticated desktop/mobile matrix is too large for one serialized
  // CI worker (it exceeded a 90-minute job limit). Four workers keep the suite
  // bounded while leaving enough CPU and memory for the local Next.js server.
  workers: process.env.CI ? Number(process.env.PLAYWRIGHT_WORKERS || 4) : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30000,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'https://smarter.poker',
    trace: process.env.CI ? 'off' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      testMatch: /0.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      testMatch: /0.*\.spec\.ts/,
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      // Phase 5 keeps the PNM cross-engine gate intentionally narrow: only the
      // dedicated route-family contract runs in Safari/WebKit, so the broader
      // authenticated Chromium suite does not multiply in CI.
      name: 'pnm-webkit',
      testMatch: /015-poker-near-me-phase-17\.spec\.ts$/,
      // The application's global push worker can deadlock Playwright's headless
      // WebKit process. Phase 17 owns page/history/accessibility behavior, not
      // push delivery, so keep that unrelated worker outside this narrow gate.
      use: { ...devices['Desktop Safari'], serviceWorkers: 'block' },
    },
    {
      name: 'pnm-mobile-webkit',
      testMatch: /015-poker-near-me-phase-17\.spec\.ts$/,
      use: { ...devices['iPhone 13'], serviceWorkers: 'block' },
    },
    {
      name: 'pa-webkit',
      testMatch: /021-personal-assistant\.spec\.ts$/,
      fullyParallel: false,
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'pa-mobile-webkit',
      testMatch: /021-personal-assistant\.spec\.ts$/,
      fullyParallel: false,
      use: {
        ...devices['iPhone 13'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'footer-chromium',
      testMatch: /global-footer-visual\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'footer-webkit',
      testMatch: /global-footer-visual\.spec\.ts$/,
      use: { ...devices['iPhone 13'] },
    },
  ],
});
