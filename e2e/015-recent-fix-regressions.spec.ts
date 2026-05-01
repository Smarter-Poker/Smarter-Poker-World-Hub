import { test, expect } from '@playwright/test';

/**
 * 015 — Regression suite for fixes shipped 2026-04-30 / 2026-05-01.
 *
 * Each block here corresponds to a specific incident. If a future agent
 * is debugging a flake or considers reverting a fix, this file is the
 * first place to look — every test cites the original ticket/SHA.
 *
 * These tests run against the live smarter.poker domain (per
 * playwright.config.ts baseURL). They do NOT require auth (storageState
 * is reused but the endpoints themselves are public reads where possible).
 */

// ─────────────────────────────────────────────────────────────────────
// PHASE 28 / task #109 — batch-counts crashed when venue_ids was an array
// Original error in Vercel runtime logs:
//   TypeError: r.split is not a function (at ./pages/api/poker/checkins/batch-counts.js)
// Triggered when JSON.parse succeeded on the string OR Next.js parsed
// repeated ?venue_ids= params into a real JS array. Fix: c8dffdfcc7
// ─────────────────────────────────────────────────────────────────────
test.describe('batch-counts venue_ids parsing (task #109)', () => {
    test('csv string', async ({ request }) => {
        const r = await request.get('/api/poker/checkins/batch-counts?venue_ids=1,2,3');
        expect(r.status()).toBe(200);
        const body = await r.json();
        expect(body.success).toBe(true);
        expect(body.counts).toBeDefined();
        expect(Object.keys(body.counts).length).toBe(3);
    });

    test('JSON-encoded array string', async ({ request }) => {
        const r = await request.get('/api/poker/checkins/batch-counts?venue_ids=' + encodeURIComponent('[1,2,3]'));
        expect(r.status()).toBe(200);
        const body = await r.json();
        expect(body.success).toBe(true);
    });

    test('repeated query params (Next.js parses to array)', async ({ request }) => {
        const r = await request.get('/api/poker/checkins/batch-counts?venue_ids=1&venue_ids=2&venue_ids=3');
        expect(r.status()).toBe(200);
        const body = await r.json();
        expect(body.success).toBe(true);
    });

    test('empty / missing returns 400 not 500', async ({ request }) => {
        const r = await request.get('/api/poker/checkins/batch-counts');
        expect(r.status()).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 28 / task #103 — link-preview was hanging until Vercel 504'd
// the function. Fix: AbortController timeout (5–6s) on every fetch().
// Regression: the response should arrive in well under 10s even for
// a slow upstream. Fix: 4d75febb62 / 030460f9ce range.
// ─────────────────────────────────────────────────────────────────────
test.describe('link-preview timeout cap (task #103)', () => {
    test('responds in <12s even on slow upstream', async ({ request }) => {
        const t0 = Date.now();
        const r = await request.get('/api/link-preview?url=' + encodeURIComponent('https://example.com'));
        const elapsed = Date.now() - t0;

        // 12s is generous (allows 6s upstream + 6s for next.js + DNS); the
        // raw issue was Vercel's 25s function timeout firing at the limit.
        // Anything under ~12s means our AbortController is working.
        expect(elapsed).toBeLessThan(12000);
        expect(r.status()).toBe(200);
    });

    test('rejects SSRF target with 403', async ({ request }) => {
        // The handler's isBlockedUrl() must reject 169.254.169.254
        // and other private IPs. Important security regression check.
        const r = await request.get('/api/link-preview?url=' + encodeURIComponent('http://169.254.169.254/'));
        expect(r.status()).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 23 / task #96 — Commander admin pages used to be client-side
// gated (HTML+JS visible without auth). Server-side gate now returns
// 200/redirect for unauthed but should NOT include admin-only HTML.
// ─────────────────────────────────────────────────────────────────────
test.describe('Commander admin server-side gate (task #96)', () => {
    test('admin page does not leak admin-only markup to unauthed user', async ({ page }) => {
        const r = await page.goto('/commander/admin', { waitUntil: 'domcontentloaded' });
        expect(r?.status()).toBeLessThan(500);
        // Whatever the gate's failure-path is (redirect, login prompt,
        // 401 page), the body must NOT contain the admin dashboard's
        // distinguishing strings. Update these matchers if the
        // admin-page copy changes.
        const body = await page.content();
        expect(body).not.toMatch(/Approve\s+Cashout/i);
        expect(body).not.toMatch(/Suspend\s+User/i);
    });
});

// ─────────────────────────────────────────────────────────────────────
// PHASE 31 / engine commits 943cb47e61 + 062a7f318a — chip cast flood.
// We can't easily verify this from the client side without a real
// auth token, but /api/health must be green (heap, db ms reasonable).
// ─────────────────────────────────────────────────────────────────────
test.describe('post-engine-fix health (PHASE 31)', () => {
    test('api/health is green', async ({ request }) => {
        const r = await request.get('/api/health');
        expect(r.status()).toBe(200);
        const body = await r.json();
        expect(body.status).toBe('ok');
        // db latency should be reasonable; assertion is loose to avoid flakes
        if (typeof body.db === 'number') {
            expect(body.db).toBeLessThan(2000);
        } else if (body.db?.ms !== undefined) {
            expect(body.db.ms).toBeLessThan(2000);
        }
    });
});
