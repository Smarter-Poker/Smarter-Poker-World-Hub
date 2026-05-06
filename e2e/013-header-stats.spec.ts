// E2E Test: Verify header displays real profile data (not zeros)
//
// SKIPPED (2026-04-24 — cron governance session): suite is structurally
// broken as written — TEST_EMAIL is Dan's real production account and
// TEST_PASSWORD 'Test123!' is a placeholder that has never matched that
// account. Login fails in 100% of runs, so every test that depends on
// beforeEach() throws before assertions run.
//
// To un-skip: (a) create a dedicated fixture user via Supabase admin API,
// (b) seed it with diamonds/XP so the > 0 assertions hold, (c) store the
// fixture password in CI secrets (PLAYWRIGHT_TEST_PASSWORD), (d) switch
// the constants below to process.env and re-enable. Filed as Phase 4
// technical debt — not blocking Phase 1 gate.

const { test, expect } = require('@playwright/test');

// Test credentials — left in source as documentation of intended wiring
// but suite is skipped below. DO NOT run these against production.
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || 'fixture-user@example.invalid';
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || '';

// Skip the whole suite until a real fixture user exists in Supabase.
test.describe.skip('Header Profile Data (requires seeded fixture user)', () => {
    test.beforeEach(async ({ page }) => {
        // Login first
        await page.goto('/auth/login');
        await page.fill('input[type="email"]', TEST_EMAIL);
        await page.fill('input[type="password"]', TEST_PASSWORD);
        await page.click('button[type="submit"]');

        // Wait for redirect to hub
        await page.waitForURL('**/hub**', { timeout: 10000 });
    });

    test('header shows diamonds > 0 (not zeros)', async ({ page }) => {
        await page.goto('/hub');
        await page.waitForTimeout(3000); // Wait for header data to load

        // Find the diamond display in header
        const diamondElement = await page.locator('[data-testid="header-diamonds"], .header-diamonds, text=/💎.*\\d+/').first();
        const diamondText = await diamondElement.textContent();

        // Extract number from text (e.g., "💎 454,545" -> 454545)
        const diamondCount = parseInt(diamondText.replace(/[^0-9]/g, ''), 10);

        console.log(`[E2E] Header diamonds: ${diamondCount}`);

        // CRITICAL: If diamonds are 0, this test fails and blocks deploy
        expect(diamondCount).toBeGreaterThan(0);
    });

    test('header shows XP > 0 (not zeros)', async ({ page }) => {
        await page.goto('/hub');
        await page.waitForTimeout(3000);

        // Find XP display
        const xpElement = await page.locator('[data-testid="header-xp"], .header-xp, text=/XP.*\\d+/').first();
        const xpText = await xpElement.textContent();
        const xpCount = parseInt(xpText.replace(/[^0-9]/g, ''), 10);

        console.log(`[E2E] Header XP: ${xpCount}`);
        expect(xpCount).toBeGreaterThan(0);
    });

    test('header shows level > 1', async ({ page }) => {
        await page.goto('/hub');
        await page.waitForTimeout(3000);

        // Find level display
        const levelElement = await page.locator('[data-testid="header-level"], .header-level, text=/LV.*\\d+|Level.*\\d+/i').first();
        const levelText = await levelElement.textContent();
        const level = parseInt(levelText.replace(/[^0-9]/g, ''), 10);

        console.log(`[E2E] Header Level: ${level}`);
        // Level 1 with 0 XP indicates broken data fetch
        expect(level).toBeGreaterThan(1);
    });

    test('API returns valid profile data', async ({ page }) => {
        await page.goto('/hub');
        await page.waitForTimeout(2000);

        // Get user ID from session and test API directly
        const result = await page.evaluate(async () => {
            const keys = Object.keys(localStorage);
            const supabaseKey = keys.find(k => k.includes('auth-token'));
            if (!supabaseKey) return { error: 'No session' };

            const session = JSON.parse((localStorage.getItem(supabaseKey) || '{}') as string);
            const userId = session?.user?.id;
            if (!userId) return { error: 'No userId' };

            const res = await fetch('/api/user/get-header-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            return await res.json();
        });

        console.log('[E2E] API Response:', JSON.stringify(result));

        expect(result.success).toBe(true);
        expect(result.profile).toBeDefined();
        expect(result.profile.diamonds).toBeGreaterThanOrEqual(0);
    });
});
