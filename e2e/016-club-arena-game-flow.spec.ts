import { test, expect } from '@playwright/test';
import { expectPageLoads, checkAPIHealth } from './utils';

// ╔═══════════════════════════════════════════════════════════╗
// ║  CLUB ARENA — Game Flow + Engine API Surface              ║
// ║  Phase 38 — broader E2E for the Club Arena live-poker     ║
// ║  flow against deployed prod. Skips deep V8 Bible engine   ║
// ║  invariants (those live in club-arena/tests/engine/) and  ║
// ║  focuses on what the World Hub surfaces to users.         ║
// ║                                                            ║
// ║  Two posture invariants:                                  ║
// ║   1. Public game-flow pages return < 500                  ║
// ║   2. Server-side mutating engine endpoints fail closed    ║
// ║      with 401/403 when called without auth                ║
// ║      (catches RLS/auth regressions like Phase 86 — anon   ║
// ║       could force-reveal opponents' cards)                ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Club Arena — Public Game Flow Pages', () => {
  const publicGamePages = [
    { path: '/hub/clubs', name: 'Clubs Lobby' },
    { path: '/hub/poker', name: 'Poker Hub' },
    { path: '/hub/diamond-arena', name: 'Diamond Arena' },
    { path: '/hub/live-poker', name: 'Live Poker' },
  ];

  for (const { path, name } of publicGamePages) {
    test(`${name} (${path}) returns < 500`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${name} HTTP status`).toBeLessThan(500);
    });
  }
});

test.describe('Club Arena — Engine Mutation Endpoints Fail Closed', () => {
  // These endpoints all mutate game state (seat, action, show-cards, etc.).
  // They MUST require a valid Bearer token. The auth wall should reject
  // anonymous + bogus tokens with 401/403, never succeed silently.
  const protectedMutationEndpoints = [
    { path: '/api/poker/engine/action', method: 'POST', name: 'Submit action' },
    { path: '/api/poker/engine/seat', method: 'POST', name: 'Take seat' },
    { path: '/api/poker/engine/show-cards', method: 'POST', name: 'Show cards' },
    { path: '/api/poker/engine/connect', method: 'POST', name: 'Connect player' },
    { path: '/api/poker/engine/club-connect', method: 'POST', name: 'Club connect' },
    { path: '/api/poker/create-live-table', method: 'POST', name: 'Create live table' },
    { path: '/api/club-arena/buyin', method: 'POST', name: 'Buy in' },
    { path: '/api/club-arena/cancel-my-cashout', method: 'POST', name: 'Cancel cashout' },
    { path: '/api/club-arena/anti-cheat', method: 'POST', name: 'Anti-cheat report' },
    { path: '/api/club-arena/approve-cashout', method: 'POST', name: 'Approve cashout' },
    { path: '/api/club-arena/clawback-chips', method: 'POST', name: 'Clawback chips' },
  ];

  for (const ep of protectedMutationEndpoints) {
    test(`${ep.name} (${ep.method} ${ep.path}) rejects no-auth`, async ({ request }) => {
      const response = await request.fetch(ep.path, {
        method: ep.method,
        data: {},
        failOnStatusCode: false
      });
      // Acceptable failure modes: 400 bad request (missing args), 401 unauth,
      // 403 forbidden, 405 method not allowed, 422 validation. NOT acceptable:
      // 200 (silent success without auth) or 500 (crash).
      expect(
        [400, 401, 403, 405, 422].includes(response.status()),
        `${ep.name} returned ${response.status()} — expected 400/401/403/405/422 (auth wall)`
      ).toBe(true);
    });

    test(`${ep.name} (${ep.method} ${ep.path}) rejects bogus token`, async ({ request }) => {
      const response = await request.fetch(ep.path, {
        method: ep.method,
        headers: { Authorization: 'Bearer not-a-real-jwt-token' },
        data: {},
        failOnStatusCode: false
      });
      expect(
        [400, 401, 403, 405, 422].includes(response.status()),
        `${ep.name} with bogus token returned ${response.status()} — expected 400/401/403/405/422`
      ).toBe(true);
    });
  }
});

test.describe('Club Arena — Tournament Registration Auth Wall', () => {
  test('POST /api/trivia/tournament-enter rejects no-auth', async ({ request }) => {
    // This is the post-Phase-37 atomic-entry endpoint. It MUST require auth
    // and MUST verify against the user's diamond balance. The page-level
    // entry path can no longer write to trivia_tournament_entries directly.
    const response = await request.post('/api/trivia/tournament-enter', {
      data: { tournament_id: '00000000-0000-0000-0000-000000000000' },
      failOnStatusCode: false
    });
    expect(response.status(), 'should be 401 not-authenticated').toBe(401);
  });

  test('POST /api/club-arena/shop-items rejects no-auth', async ({ request }) => {
    // Post-Phase-37 admin CRUD for club_shop_items. Anon writes to the
    // table are now RLS-blocked; the only path is via this endpoint
    // which verifies club_members.role IN (owner, admin).
    const response = await request.post('/api/club-arena/shop-items', {
      data: { action: 'create', clubId: '00000000-0000-0000-0000-000000000000', name: 'x', price: 1 },
      failOnStatusCode: false
    });
    expect(response.status(), 'should be 401 not-authenticated').toBe(401);
  });
});

test.describe('Club Arena — Realtime + State Read Endpoints', () => {
  test('engine/state without auth returns 401 (NOT 200 with state)', async ({ request }) => {
    const response = await request.get('/api/poker/engine/state', { failOnStatusCode: false });
    // State must be auth-gated — Phase 86 fix (show-cards exposure)
    // class regression check.
    expect(
      [401, 403, 400, 405].includes(response.status()),
      `engine/state returned ${response.status()} — expected 4xx auth wall`
    ).toBe(true);
  });

  test('engine/tables list endpoint exists and is fast', async ({ request }) => {
    const start = Date.now();
    const response = await request.get('/api/poker/engine/tables', { failOnStatusCode: false });
    const elapsed = Date.now() - start;
    // GET list of tables — should complete in < 5s (catches the
    // SupabaseResilience cold-start hang regression)
    expect(elapsed, `took ${elapsed}ms`).toBeLessThan(5000);
    // Status can be 200 (returned a list), 401 (auth required), or 5xx
    // is the regression we care about catching.
    expect(response.status(), 'engine/tables status').toBeLessThan(500);
  });
});

test.describe('Club Arena — Settlement + Money Endpoints', () => {
  test('approve-cashout rejects no-auth', async ({ request }) => {
    const response = await request.post('/api/club-arena/approve-cashout', {
      data: { cashout_id: '00000000-0000-0000-0000-000000000000', approve: true },
      failOnStatusCode: false
    });
    // Money flow — must be 401/403, never 200 silent success
    expect([400, 401, 403, 405].includes(response.status())).toBe(true);
  });

  test('club-arena/buyin rejects no-auth', async ({ request }) => {
    const response = await request.post('/api/club-arena/buyin', {
      data: { table_id: '00000000-0000-0000-0000-000000000000', amount: 1000 },
      failOnStatusCode: false
    });
    expect([400, 401, 403, 405].includes(response.status())).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// V8 BIBLE COMPLIANCE — DEFERRED
// Engine-side invariants (deck shuffling, fairness, settlement
// math, state-machine transitions) live in
// club-arena/tests/engine/v8-bible/ in the engine repo. They
// can't be exercised from the World Hub HTTP surface alone.
// Owner: parallel session — currently at 89% verified per
// SMARTER-POKER-BUILD-TRACKER.md. Re-evaluate this E2E suite
// after the remaining 15 V8 items resolve.
// ─────────────────────────────────────────────────────────────
