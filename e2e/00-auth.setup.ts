import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const authFile = path.resolve(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  /**
   * Say what is missing, rather than throwing on undefined.
   *
   * Without this, an absent TEST_USER_PASSWORD reached page.fill() and produced
   * "page.fill: value: expected string, got undefined" - three times, once per
   * retry - which fails the setup project and with it all 244 tests. Nothing in
   * that message mentions a secret, an environment variable, or CI
   * configuration, and it is the first thing anyone reads when the suite is
   * red.
   *
   * This is NOT skipped when the value is absent. A suite that quietly passes
   * without ever signing in is worse than one that fails: every assertion after
   * this point would be made against a logged-out page and would still go
   * green.
   */
  if (!process.env.TEST_USER_PASSWORD) {
    throw new Error(
      'TEST_USER_PASSWORD is not set, so the E2E suite cannot sign in and every ' +
        'spec after this one would run logged out.\n' +
        '  CI:    add it as a repository secret and pass it in the "Run Playwright tests" ' +
        'step of .github/workflows/e2e-tests.yml\n' +
        '  local: it is already in .env.local'
    );
  }

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
