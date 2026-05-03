import { test, expect } from '@playwright/test';

// Phase 38 — Club Arena E2E broader.
// Two posture invariants: public game-flow pages return < 500, and
// mutating engine endpoints fail closed with 4xx when called without
// auth. Catches Phase-86-class regressions (anon could force-reveal
// opponents' cards) and Phase-37 RLS regressions.

test.describe('Club Arena — Public Game Flow Pages', () => {
  for (const { path, name } of [
    { path: '/hub/clubs', name: 'Clubs Lobby' },
    { path: '/hub/poker', name: 'Poker Hub' },
    { path: '/hub/diamond-arena', name: 'Diamond Arena' },
    { path: '/hub/live-poker', name: 'Live Poker' },
  ]) {
    test(`${name} (${path}) returns < 500`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${name} HTTP status`).toBeLessThan(500);
    });
  }
});

test.describe('Club Arena — Engine Mutations Fail Closed', () => {
  for (const ep of [
    { path: '/api/poker/engine/action', name: 'Submit action' },
    { path: '/api/poker/engine/seat', name: 'Take seat' },
    { path: '/api/poker/engine/show-cards', name: 'Show cards' },
    { path: '/api/poker/engine/connect', name: 'Connect player' },
    { path: '/api/poker/create-live-table', name: 'Create live table' },
    { path: '/api/club-arena/buyin', name: 'Buy in' },
    { path: '/api/club-arena/anti-cheat', name: 'Anti-cheat report' },
    { path: '/api/club-arena/approve-cashout', name: 'Approve cashout' },
    { path: '/api/club-arena/clawback-chips', name: 'Clawback chips' },
  ]) {
    test(`${ep.name} (POST ${ep.path}) rejects no-auth`, async ({ request }) => {
      const response = await request.post(ep.path, { data: {}, failOnStatusCode: false });
      expect([400, 401, 403, 405, 422].includes(response.status()), `got ${response.status()}`).toBe(true);
    });

    test(`${ep.name} rejects bogus token`, async ({ request }) => {
      const response = await request.post(ep.path, {
        headers: { Authorization: 'Bearer not-a-real-jwt' },
        data: {}, failOnStatusCode: false
      });
      expect([400, 401, 403, 405, 422].includes(response.status()), `got ${response.status()}`).toBe(true);
    });
  }
});

test.describe('Club Arena — Post-Phase-37 Atomic Endpoints', () => {
  test('/api/trivia/tournament-enter rejects no-auth', async ({ request }) => {
    const response = await request.post('/api/trivia/tournament-enter', {
      data: { tournament_id: '00000000-0000-0000-0000-000000000000' },
      failOnStatusCode: false
    });
    expect(response.status()).toBe(401);
  });

  test('/api/club-arena/shop-items rejects no-auth', async ({ request }) => {
    const response = await request.post('/api/club-arena/shop-items', {
      data: { action: 'create', clubId: '00000000-0000-0000-0000-000000000000', name: 'x', price: 1 },
      failOnStatusCode: false
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Club Arena — Engine Read Surface', () => {
  test('engine/state without auth returns 4xx (not 200 with leaked state)', async ({ request }) => {
    const response = await request.get('/api/poker/engine/state', { failOnStatusCode: false });
    expect([401, 403, 400, 405].includes(response.status()), `got ${response.status()}`).toBe(true);
  });

  test('engine/tables list responds in < 5s', async ({ request }) => {
    const start = Date.now();
    const response = await request.get('/api/poker/engine/tables', { failOnStatusCode: false });
    expect(Date.now() - start, 'cold-start hang regression').toBeLessThan(5000);
    expect(response.status(), 'engine/tables status').toBeLessThan(500);
  });
});
