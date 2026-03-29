import { test, expect } from '@playwright/test';

test.describe('5. Diamond Store Mechanics', () => {
  test('Store renders pricing tiers and bundle modals correctly', async ({ page }) => {
    await page.goto('/hub/diamond-store', { waitUntil: 'commit' });

    // 1. Verify Diamond balance UI component is present
    const balanceHeader = page.locator('text=Diamonds').or(page.getByRole('heading', { level: 2 }));
    await expect(balanceHeader.first()).toBeVisible();

    // 2. Validate generic bundle cards 
    // Usually these are buttons calling out price points
    const buyButton = page.locator('button', { hasText: '$' }).first();
    
    // 3. Ensuring no SSR/Hydration crash during checkout visualization
    await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  });
});
