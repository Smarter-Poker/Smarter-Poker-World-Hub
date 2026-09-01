import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

const authFile = path.resolve(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  setup.setTimeout(90000);
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

  const continueToHub = page.getByRole('button', { name: /continue to hub/i });

  if (await continueToHub.isVisible()) {
    // The auth client can restore the session before the login page redirects.
    // Follow the explicit continuation instead of submitting credentials again.
    await continueToHub.click();
  } else {
    // Fill in the static test account credentials prescribed in the browser-testing workflow.
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD);
    await page.click('button[type="submit"]');

    // A successful sign-in may intentionally settle on the signed-in login
    // state rather than navigating immediately. Observe either success signal,
    // then follow the continuation when it is the one the UI presents.
    const success = await Promise.race([
      page.waitForURL(/.*\/hub/, { timeout: 45000 }).then(() => 'hub'),
      continueToHub.waitFor({ state: 'visible', timeout: 45000 }).then(() => 'continue'),
    ]);
    if (success === 'continue') await continueToHub.click();
  }

  // Verify successful authentication by waiting for the redirection to the hub landing page
  // Profile, VIP, and trusted-device bootstrap can legitimately cross the old
  // 20-second ceiling when the backing services are cold. The credentials had
  // already been accepted, but Playwright closed the page before the session
  // state could be saved, invalidating every dependent test.
  await expect(page).toHaveURL(/.*\/hub/, { timeout: 45000 });

  // Allow enough time for local storage/cookies to populate and propagate
  await page.waitForTimeout(1000); 

  // The product intentionally offers notifications once, 20 seconds after a
  // signed-in user lands. A shared authenticated E2E state must record that
  // this cross-route prompt has already been handled; otherwise it appears in
  // the middle of unrelated long-running specs and intercepts their clicks.
  // Notification-specific contracts use their own isolated state and are not
  // weakened by this suite-level fixture.
  const notificationPromptHandled = await page.evaluate(() => {
    try {
      const session = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
      const userId = session?.user?.id;
      if (!userId) return false;
      localStorage.setItem(`sp_firstrun_notif_v2_${userId}`, String(Date.now()));
      return true;
    } catch {
      return false;
    }
  });
  expect(notificationPromptHandled, 'authenticated E2E state could not suppress the cross-route notification prompt').toBe(true);

  // Save authentication state to persist across all remaining Playwright worker nodes
  await page.context().storageState({ path: authFile });
});
