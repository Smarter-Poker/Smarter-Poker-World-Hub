import { test, expect } from '@playwright/test';

// ╔═══════════════════════════════════════════════════════════╗
// ║  API HEALTH TESTS — Verify API endpoints respond          ║
// ║  Tests critical API routes return proper status codes     ║
// ║  Only tests endpoints with verified index handlers        ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('API Health Checks', () => {
  test('GET /api/health returns 200', async ({ request }) => {
    // pages/api/health/index.js exists — verified
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('GET /api/health returns expected fields', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    // Health endpoint returns: status, version, uptime, checks{db,memory}, timestamp.
    // 'status' is 'ok' in normal operation; regex accepts the historical 'healthy'/
    // 'degraded' values too in case future versions emit them.
    expect(body.status).toMatch(/ok|healthy|degraded/);
    expect(body).toHaveProperty('checks');
  });
});

test.describe('API Security — Middleware-Protected Routes', () => {
  // middleware.ts rejects these with status 401 (unauthenticated — no x-admin-secret
  // header present) or 403 (present but invalid). Either is correct per HTTP semantics
  // and matches the current behavior at lines 125/141 of middleware.ts.
  // Before 2026-04-24 these tests asserted exactly 403 — that was test drift from an
  // earlier middleware version, not a spec requirement.

  test('/api/admin/health blocks without x-admin-secret', async ({ request }) => {
    // pages/api/admin/health.js exists — protected by middleware
    const response = await request.get('/api/admin/health');
    expect([401, 403]).toContain(response.status());
    const body = await response.json();
    // Error text varies between "Admin routes require authentication." (401) and
    // "Admin routes are disabled in production." (403 path). Accept either.
    expect(body.error).toMatch(/Admin routes/);
  });

  test('/api/debug/find-user blocks without x-admin-secret', async ({ request }) => {
    // pages/api/debug/find-user.js exists — protected by middleware
    const response = await request.get('/api/debug/find-user');
    expect([401, 403]).toContain(response.status());
  });

  test('/api/emergency/create-sports-table blocks without x-admin-secret', async ({ request }) => {
    // pages/api/emergency/create-sports-table.js exists — protected by middleware
    const response = await request.get('/api/emergency/create-sports-table');
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('API Security — Destructive Poker Routes Blocked', () => {
  // These 7 routes are explicitly listed in middleware.ts DESTRUCTIVE_POKER_ROUTES
  // AND their handlers return 410 Gone even if middleware passes.
  // Middleware returns 401 or 403 depending on whether the header was absent or wrong.

  const destructiveRoutes = [
    '/api/poker/nuclear-import',
    '/api/poker/full-import',
    '/api/poker/import-fresh-data',
    '/api/poker/seed-database',
    '/api/poker/seed',
    '/api/poker/create-tables',
    '/api/poker/setup-venue-scraping',
  ];

  for (const route of destructiveRoutes) {
    test(`${route} blocked without admin secret`, async ({ request }) => {
      const response = await request.post(route);
      // Middleware blocks before handler — 401/403 both prove the route is gated.
      // 410 would also be acceptable if middleware lets it through to the handler,
      // but in current config it never does.
      expect([401, 403, 410]).toContain(response.status());
      const body = await response.json();
      expect(body.error).toMatch(/Admin routes|disabled|gone/i);
    });
  }
});

test.describe('API — Friends Endpoint (has index handler)', () => {
  test('GET /api/friends responds without 500', async ({ request }) => {
    // pages/api/friends/index.js exists — verified
    const response = await request.get('/api/friends');
    expect(response.status()).toBeLessThan(500);
  });
});
