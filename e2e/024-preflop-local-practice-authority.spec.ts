import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('Local VS renders and completes an honest five-round browser simulation', async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/hub/preflop-charts?mode=tournament', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'LOCAL VS PRACTICE' })).toBeVisible();
  await expect(page.getByText(/No Live Opponent, Matchmaking, Account Rank, Leaderboard, Or Diamond Settlement/)).toBeVisible();
  await expect(page.getByText(/ELO|Players Online|Finding Opponent/i)).toHaveCount(0);

  await page.getByRole('button', { name: /START SIMULATED PRACTICE/ }).click();
  await expect(page.getByText('Preparing Local Simulation...')).toBeVisible();
  await expect(page.getByText(/No Player Search Is Running/)).toBeVisible();

  const correctAnswers = [
    /22\+, A2s\+, K2s\+/i,
    /70% 4-bet \/ 30% Call/i,
    /Bet 20BB/i,
    /55\+, A5s-A2s/i,
    /Bet 30BB/i,
  ];

  for (let round = 0; round < correctAnswers.length; round += 1) {
    await page.getByRole('button', { name: correctAnswers[round] }).click();
    await expect(page.getByText(/Correct.*You Win This Practice Round/)).toBeVisible();
    await page.getByRole('button', {
      name: round < correctAnswers.length - 1 ? /Next Round/ : /View Results/,
    }).click();
  }

  await expect(page.getByText('LOCAL PRACTICE WIN')).toBeVisible();
  await expect(page.getByText('SESSION ONLY')).toBeVisible();
  await expect(page.getByText(/ELO|Rank Tier|Diamond Reward/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'START NEXT LOCAL RUN' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
