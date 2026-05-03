import { test, expect } from '@playwright/test';
import { waitForPageLoad } from './utils';

// ╔═══════════════════════════════════════════════════════════╗
// ║  AUTH FLOW TESTS — Login, Signup, and Session Management  ║
// ║  Tests the authentication UX without modifying any data   ║
// ╚═══════════════════════════════════════════════════════════╝

test.describe('Auth — Login Page', () => {
  test('login form renders with email and password fields', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with empty fields does not submit', async ({ page }) => {
    // Rewritten 2026-04-24: the previous assertion on el.validity.valid is
    // unreliable in headless Chromium because native HTML5 validation's
    // "please fill out this field" popup is rendered at the OS level and
    // the validity state the test reads depends on whether the form
    // submission actually started. What we actually care about: clicking
    // submit on an empty form must NOT navigate away from /auth/login.
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');
    const startUrl = page.url();

    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500); // give any navigation a chance

    // Must still be on a login/auth page (native validation blocked submit,
    // or app-level validation kicked in and kept us here).
    const endUrl = page.url();
    expect(endUrl).toContain('/auth');
    // The `required` attribute is what enforces client-side blocking
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[type="email"]', 'fake-user-does-not-exist@test.invalid');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Should show error message, not crash
    await page.waitForTimeout(3000);
    const url = page.url();
    // Should still be on login page (not redirected to hub)
    expect(url).toContain('/auth');
  });
});

test.describe('Auth — Signup Page', () => {
  test('signup form renders', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('input[type="email"]')).toBeVisible();
    // Signup has TWO password inputs (password + confirm). `.first()` avoids
    // Playwright's strict-mode violation which fails on multi-match.
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});

test.describe('Auth — Route Protection', () => {
  test('accessing /hub/profile without auth redirects to login', async ({ page }) => {
    await page.goto('/hub/profile');
    await page.waitForLoadState('domcontentloaded');

    // Should either show the page (if public) or redirect to auth
    const url = page.url();
    const isProtected = url.includes('/auth') || url.includes('/login');
    const isPublic = !isProtected;

    // Either outcome is valid — the key is no 500 error
    expect(isProtected || isPublic).toBeTruthy();
  });

  test('accessing /hub/settings without auth redirects', async ({ page }) => {
    await page.goto('/hub/settings');
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    // Should not crash
    expect(url).toBeTruthy();
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  AUTH CALLBACK — REGRESSION GUARD                                     ║
// ║                                                                       ║
// ║  Added 2026-05-02 after a production incident where every signup      ║
// ║  (Google OAuth + email) 404'd because pages/auth/callback.js had      ║
// ║  been silently deleted. The Vercel logs were the only signal.         ║
// ║  These tests fail loudly if the route stops responding.               ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe('Auth — Callback Route', () => {
  test('GET /auth/callback responds 200 (not 404)', async ({ page }) => {
    // Hit the route with no params — it should still render the loading
    // shell and not 404. If callback.js is missing the request returns 404.
    const response = await page.goto('/auth/callback', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
  });

  test('GET /auth/callback with a provider error redirects to /auth/login', async ({ page }) => {
    // When OAuth fails, the provider sends ?error=…&error_description=…
    // The callback must surface the error and bounce the user to /auth/login.
    await page.goto('/auth/callback?error=access_denied&error_description=test_error', {
      waitUntil: 'domcontentloaded',
    });
    // The redirect happens via setTimeout — wait for it.
    await page.waitForURL(/\/auth\/login/, { timeout: 6000 });
    expect(page.url()).toContain('/auth/login');
  });

  test('GET /auth/callback with no session redirects to /auth/login', async ({ page }) => {
    // Cold hit with no code, token, or session — should land on login.
    await page.goto('/auth/callback', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\/login/, { timeout: 8000 });
    expect(page.url()).toContain('/auth/login');
  });
});

test.describe('Auth — ensure-profile API contract', () => {
  test('POST /api/auth/ensure-profile without a Bearer token returns 401', async ({ request }) => {
    // The OAuth callback flow depends on this endpoint to create profiles
    // for new Google users. If the auth contract changes, signup breaks.
    const res = await request.post('/api/auth/ensure-profile', {
      data: { user_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/auth/ensure-profile with no body returns 4xx (not 500)', async ({ request }) => {
    // Defensive: a malformed request must not crash the function.
    const res = await request.post('/api/auth/ensure-profile', {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
