import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30000,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'https://smarter.poker',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
