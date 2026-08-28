import { test, expect, Page } from '@playwright/test';

async function expectHealthyLayout(page: Page) {
  await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Personal Assistant primary and secondary surfaces', () => {
  test('strategy hub exposes both systems without layout regression', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Meet Jarvis/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leak Finder', exact: true })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Sandbox setup sheet opens, traps context, and closes with Escape', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Virtual Sandbox Poker Scenario Solver/i })).toBeAttached();
    await expect(page.locator('#sandbox-table')).toBeVisible();
    await page.getByRole('button', { name: 'Open setup' }).click();
    await expect(page.getByRole('dialog', { name: /Setup/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /Setup/i })).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox card picker and history subflows remain wired', async ({ page }, testInfo) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Load a saved hand' }).click();
    await expect(page.getByRole('dialog', { name: /History/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Bookmarks' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Pick my cards' }).click();
    await expect(page.getByRole('dialog', { name: /Pick card 1 of 2/i })).toBeVisible();
    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: /Rank A,/i }).click();
      await expect(page.getByText('Choose a suit for A')).toBeVisible();
    }
    await page.getByRole('button', { name: 'A of spades' }).click();
    await expect(page.getByRole('dialog', { name: /Pick card 2 of 2/i })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog', { name: /Pick card/i })).toHaveCount(0);
    await expectHealthyLayout(page);
  });

  test('Sandbox mobile controls remain one-handed and overflow-free', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'mobile project only');
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#run-analysis')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open setup' })).toBeVisible();
    await expect(page.locator('#sandbox-table')).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Leak Finder switches between leaks and every analytics sub-surface', async ({ page }) => {
    await page.route('**/api/assistant/leaks/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, persisted: true, handsAnalyzed: 0, leaksDetected: 0, leaks: [], message: 'No new leaks found.' }),
    }));
    const response = await page.goto('/hub/personal-assistant/leaks', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Leak Finder' })).toBeVisible();
    await page.getByRole('button', { name: 'Insights' }).click();
    await expect(page.locator('#leak-insights')).toBeVisible();
    await expect(page.getByText('Worst coach-mode spots')).toBeVisible();
    await expect(page.getByText('Weekly Leaderboard')).toBeVisible();
    await expect(page.getByText('Macro Leak Detector')).toBeVisible();
    await expect(page.getByText('Position Leak Map')).toBeVisible();
    await expectHealthyLayout(page);
  });
});
