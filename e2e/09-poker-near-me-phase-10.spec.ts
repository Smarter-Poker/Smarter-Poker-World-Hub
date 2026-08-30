import { test, expect, type Page } from '@playwright/test';

async function expectNoOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test.describe('Poker Near Me phase 10 directory operations', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90_000);

  test('fast directory is projected, integrity-assessed, and server-rendered', async ({ page, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = await request.get('/api/poker/venues?view=directory&limit=24&state=NV');
    expect(api.status()).toBe(200);
    const payload = await api.json();
    expect(payload.success).toBeTruthy();
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.data[0].location_quality).toEqual(expect.objectContaining({ mappable: true }));
    expect(payload.data[0]).not.toHaveProperty('email');
    expect(payload.data[0]).not.toHaveProperty('search_vector');

    const route = '/hub/poker-near-me/venues';
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Featured poker rooms' })).toBeVisible();
    await expect(page.locator('.pnm-ssr-venue')).toHaveCount(8);
    const html = await response?.text();
    expect(html).toContain('National room registry');
    expect(html).toMatch(/\/hub\/venues\/\d+/);
    await expectNoOverflow(page, route);
  });

  test('state and city landing pages render their projected venue families', async ({ page }) => {
    for (const route of ['/hub/poker-near-me/in', '/hub/poker-near-me/in/nv', '/hub/poker-near-me/in/nv/las-vegas']) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('main')).toBeVisible();
      await expectNoOverflow(page, route);
    }
  });

  test('authenticated operations queue is indexed and refuses writes without MFA', async ({ page, request }) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const password = process.env.TEST_USER_PASSWORD;
    expect(supabaseUrl && anonKey && password).toBeTruthy();
    const auth = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: anonKey!, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      data: { email: 'daniel@bekavactrading.com', password },
    });
    expect(auth.status()).toBe(200);
    const session = await auth.json();
    await page.addInitScript((value) => localStorage.setItem('smarter-poker-auth', JSON.stringify(value)), session);
    const route = '/admin/venue-integrity';
    const queueResponse = page.waitForResponse((response) => response.url().includes('/api/admin/venue-integrity?') && response.request().method() === 'GET');
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const response = await queueResponse;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload.summary).toEqual(expect.objectContaining({
      input: expect.any(Number), conflict: expect.any(Number), missing: expect.any(Number),
      incomplete: expect.any(Number), stale: expect.any(Number), actionable: expect.any(Number),
    }));
    expect(payload.pagination.pageSize).toBe(100);
    await expect(page.getByRole('heading', { name: 'Venue integrity operations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Incomplete', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stale sources', exact: true })).toBeVisible();

    const mutation = await page.evaluate(async () => {
      const token = JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token;
      const result = await fetch('/api/admin/venue-integrity', {
        method: 'POST', credentials: 'include',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });
      return { status: result.status, payload: await result.json() };
    });
    expect(mutation.status).toBe(403);
    expect(mutation.payload).toEqual(expect.objectContaining({ requiresMfa: true }));
    await expectNoOverflow(page, route);
  });
});
