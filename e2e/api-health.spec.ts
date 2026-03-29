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
    // Health endpoint returns: status, database, memory, uptime, timestamp
    expect(body.status).toMatch(/healthy|degraded/);
  });
});

test.describe('API Security — Middleware-Protected Routes', () => {
  // These routes are protected by middleware.ts via pathname.startsWith() checks
  // Middleware returns 403 JSON: { error: "Admin routes are disabled in production." }

  test('/api/admin/health blocks without x-admin-secret', async ({ request }) => {
    // pages/api/admin/health.js exists — protected by middleware
    const response = await request.get('/api/admin/health');
    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('Admin routes are disabled');
  });

  test('/api/debug/find-user blocks without x-admin-secret', async ({ request }) => {
    // pages/api/debug/find-user.js exists — protected by middleware
    const response = await request.get('/api/debug/find-user');
    expect(response.status()).toBe(403);
  });

  test('/api/emergency/create-sports-table blocks without x-admin-secret', async ({ request }) => {
    // pages/api/emergency/create-sports-table.js exists — protected by middleware
    const response = await request.get('/api/emergency/create-sports-table');
    expect(response.status()).toBe(403);
  });
});

test.describe('API Security — Destructive Poker Routes Blocked', () => {
  // These 7 routes are explicitly listed in middleware.ts DESTRUCTIVE_POKER_ROUTES
  // AND their handlers return 410 Gone even if middleware passes

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
    test(`${route} returns 403 without admin secret`, async ({ request }) => {
      const response = await request.post(route);
      // Middleware blocks before handler — returns 403
      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.error).toContain('Admin routes are disabled');
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
