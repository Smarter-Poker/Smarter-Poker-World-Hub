import { test, expect } from '@playwright/test';

// ╔═══════════════════════════════════════════════════════════╗
// ║  PWA TESTS — Service Worker and Offline Capability        ║
// ║  Verifies PWA assets and manifest are properly served     ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('PWA — Manifest & Assets', () => {
  test('manifest.json is served with correct app name', async ({ request }) => {
    // public/manifest.json exists — verified
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe('/hub');
    expect(manifest.display).toBe('standalone');
  });

  test('manifest.json has required PWA fields', async ({ request }) => {
    const response = await request.get('/manifest.json');
    const manifest = await response.json();
    // Required for installable PWA
    expect(manifest.icons).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  test('service worker capability exists in browser', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify the browser supports service workers (prerequisite for PWA)
    const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(swSupported).toBeTruthy();
  });
});

test.describe('PWA — Security Headers (Vercel only)', () => {
  // NOTE: These headers are configured in vercel.json and only present
  // on Vercel deployments. They will NOT be present on localhost.
  // Tests are skipped when running against localhost.

  const isLocalhost = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
    .includes('localhost');

  test('security headers present on deployed site', async ({ request }) => {
    test.skip(isLocalhost, 'Security headers are Vercel-only, not present on localhost');

    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('API routes have no-cache headers on deployed site', async ({ request }) => {
    test.skip(isLocalhost, 'Cache headers are Vercel-only, not present on localhost');

    const response = await request.get('/api/health');
    const cacheControl = response.headers()['cache-control'];
    expect(cacheControl).toContain('no-store');
  });
});
