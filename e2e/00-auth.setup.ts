import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const authFile = path.resolve(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');

  // Fill in the static test account credentials prescribed in the browser-testing workflow
  await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
  await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
  await page.click('button[type="submit"]');

  // Verify successful authentication by waiting for the redirection to the hub landing page
  await expect(page).toHaveURL(/.*\/hub/, { timeout: 20000 });

  // Allow enough time for local storage/cookies to populate and propagate
  await page.waitForTimeout(1000); 

  // Save authentication state to persist across all remaining Playwright worker nodes
  await page.context().storageState({ path: authFile });
});
