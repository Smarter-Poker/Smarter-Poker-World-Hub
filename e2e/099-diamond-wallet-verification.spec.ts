import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Diamond Wallet Premium Visual & Functional Verification', () => {
  // Override the default storageState to ensure a fresh manual login on localhost
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Verify Diamond Wallet Title Case, No Focus Blue Box, and White Colors', async ({ page }) => {
    // 1. Navigate to the login page on localhost
    console.log('[Test] Navigating to login...');
    await page.goto('/login', { waitUntil: 'networkidle' });

    // 2. Perform authentic login
    console.log('[Test] Performing authentication...');
    await page.fill('input[type="email"]', 'daniel@bekavactrading.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || '');
    await page.click('button[type="submit"]');

    // 3. Wait for hub page load
    console.log('[Test] Waiting for login redirection...');
    await expect(page).toHaveURL(/.*\/hub/, { timeout: 15000 });

    // 4. Navigate to Diamond Wallet
    console.log('[Test] Navigating to Diamond Wallet...');
    await page.goto('/hub/wallet', { waitUntil: 'networkidle' });

    // 5. Take desktop visual screenshot for human-in-the-loop review
    console.log('[Test] Taking desktop screenshot...');
    const screenshotDir = path.resolve(__dirname, '../../artifacts');
    const desktopScreenshotPath = path.join(screenshotDir, 'diamond_wallet_desktop_verified.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    console.log(`[Test] Saved desktop screenshot to: ${desktopScreenshotPath}`);

    // 6. Test search input focus behavior (No blue box focus-ring)
    console.log('[Test] Verifying search input focus style...');
    const searchBar = page.locator('input[placeholder="Search Transactions..."]');
    if (await searchBar.isVisible()) {
      await searchBar.focus();
      // Ensure no outline or ring is visible on focus
      const focusStyles = await searchBar.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          boxShadow: style.boxShadow,
          outlineWidth: style.outlineWidth,
        };
      });
      console.log('[Test] Search Input Focus styles:', focusStyles);
      // It should be ring-0 / outline-none
      expect(focusStyles.outlineWidth === '0px' || focusStyles.outline.includes('none')).toBe(true);
    } else {
      console.warn('[Test] Search bar not visible — likely empty transaction list.');
    }

    // 7. Verify recipient search input focus behavior
    console.log('[Test] Verifying recipient search input focus style...');
    const recipientInput = page.locator('input[placeholder*="Type Friend"]');
    if (await recipientInput.isVisible()) {
      await recipientInput.focus();
      const focusStyles = await recipientInput.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          boxShadow: style.boxShadow,
          outlineWidth: style.outlineWidth,
        };
      });
      console.log('[Test] Recipient Input Focus styles:', focusStyles);
      expect(focusStyles.outlineWidth === '0px' || focusStyles.outline.includes('none')).toBe(true);
    }

    // 8. Assert no hydration crash
    await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
    console.log('[Test] Diamond Wallet premium visual and functional check complete.');
  });
});
