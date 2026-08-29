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

  test('strategy hub renders the live question-shaped Hand Of The Day payload', async ({ page }) => {
    await page.route('**/api/training/hand-of-the-day', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        dailyId: 'daily-test',
        question: {
          id: 'solver-question-test',
          hero_hand: 'T9s',
          heroCards: ['Ts', '9s'],
          hero_position: 'BTN',
          board_cards: ['Qc', '5h', '3s'],
          scenario_text: 'You Hold T9s On The Flop. What Is The GTO Play?',
          scenario: { heroHand: 'T9s', heroPosition: 'BTN', pot: 6 },
        },
      }),
    }));
    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Hand Of The Day' })).toBeVisible();
    await expect(page.getByText('You Hold T9s On The Flop. What Is The GTO Play?')).toBeVisible();
    await expect(page.getByText('BTN · Pot 6 BB')).toBeVisible();
    await expect(page.getByRole('button', { name: /Load In Sandbox/i })).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('strategy hub exposes recovery and restores the Daily Hand after a feed interruption', async ({ page }) => {
    let feedHealthy = false;
    await page.route('**/api/training/hand-of-the-day', route => {
      if (!feedHealthy) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary interruption' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          question: {
            id: 'recovered-daily-hand',
            heroCards: ['Ah', 'Kd'],
            hero_position: 'CO',
            board_cards: ['Qs', '7c', '2d'],
            scenario_text: 'Recovered Solver Decision',
            scenario: { pot: 8 },
          },
        }),
      });
    });

    await page.goto('/hub/personal-assistant', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Daily Hand Temporarily Unavailable', { exact: true })).toBeVisible();
    feedHealthy = true;
    await page.getByRole('button', { name: 'Retry Daily Hand' }).click();
    const dailySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Hand Of The Day' }) });
    await expect(dailySection.getByRole('heading', { name: 'Recovered Solver Decision' })).toBeVisible();
    await expect(dailySection.getByText('CO · Pot 8 BB')).toBeVisible();
    await expectHealthyLayout(page);
  });

  test('Sandbox setup sheet opens, traps context, and closes with Escape', async ({ page }) => {
    const response = await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: 'Virtual Sandbox', exact: true })).toBeAttached();
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

  test('Sandbox templates and study analytics subpages open from their real controls', async ({ page }) => {
    await page.goto('/hub/personal-assistant/sandbox', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: 'Open setup' }).click();
    await page.getByRole('button', { name: 'Templates', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /My templates/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Load a saved hand' }).click();
    await page.getByRole('button', { name: /Study analytics/i }).click();
    await expect(page.getByRole('dialog', { name: /Study analytics/i })).toBeVisible();
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
