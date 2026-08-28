import { test, expect } from '@playwright/test';

for (const mode of ['mtt', 'cash', 'icm', 'gto']) {
  test(`${mode} starts through the server session API`, async ({ page }) => {
    let startedMode: string | null = null;
    await page.route('**/api/trivia/session-start', async route => {
      const body = route.request().postDataJSON();
      startedMode = body?.mode || null;
      const questions = Array.from({ length: 20 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        question: `Server question ${index + 1}?`,
        options: ['Fold', 'Call', 'Raise', 'All-in'],
        category: mode === 'icm' ? 'icm_chip_ev' : `${mode}_situations`,
        difficulty: 'medium'
      }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true,
        sessionId: '10000000-0000-4000-8000-000000000001',
        mode,
        questions,
        entryCost: 10,
        entryState: 'charged',
        newBalance: 990
      }) });
    });

    const response = await page.goto(`/hub/trivia/${mode}`);
    expect(response?.status()).toBeLessThan(500);
    const start = page.getByRole('button', { name: /start challenge/i });
    await expect(start).toBeVisible();
    await start.click();
    await expect.poll(() => startedMode).toBe(mode);
    await expect(page.getByText('Server question 1?')).toBeVisible();
  });
}

test('prize-wheel route validates before moving value', async ({ page }) => {
  const response = await page.request.post('/api/trivia/prize-wheel-spin', {
    data: { scoreId: 'not-a-uuid' }
  });
  expect(response.status()).toBe(400);
});
