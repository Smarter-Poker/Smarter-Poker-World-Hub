import { test, expect } from '@playwright/test';

// ╔═══════════════════════════════════════════════════════════╗
// ║  GAMES & ENTERTAINMENT — Page Load Tests                  ║
// ║  Verifies all game-related routes load without crashing   ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Games — Hub Routes Load', () => {
  const gameRoutes = [
    { path: '/hub/diamond-arena', name: 'Diamond Arena' },
    { path: '/hub/diamond-store', name: 'Diamond Store' },
    { path: '/hub/preflop-charts', name: 'Preflop Charts' },
    { path: '/hub/trivia', name: 'Trivia' },
    { path: '/hub/training', name: 'Training' },
    { path: '/horses', name: 'Horses' },
  ];

  for (const { path, name } of gameRoutes) {
    test(`${name} (${path}) loads without 500`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Games — Training Sub-Routes', () => {
  const trainingRoutes = [
    'achievements',
    'challenges',
    'leaderboard',
    'progress',
    'streaks',
    'tournaments',
  ];

  for (const route of trainingRoutes) {
    test(`/hub/training/${route} loads without 500`, async ({ page }) => {
      const response = await page.goto(`/hub/training/${route}`);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

test.describe('Games — Trivia Sub-Routes', () => {
  const triviaRoutes = [
    'endless',
    'survival',
    'time-attack',
    'mixed',
    'leaderboard',
    'achievements',
    'stats',
  ];

  for (const route of triviaRoutes) {
    test(`/hub/trivia/${route} loads without 500`, async ({ page }) => {
      const response = await page.goto(`/hub/trivia/${route}`);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});
