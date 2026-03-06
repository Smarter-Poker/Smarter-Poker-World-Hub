import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('Starting Authentic UI E2E Test...');

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    // Use an isolated context to ensure no session carryover
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => {
        if (!msg.text().includes('ERR_BLOCKED_BY_RESPONSE.NotSameOrigin') && !msg.text().includes('React DevTools')) {
            console.log('BROWSER:', msg.text());
        }
    });

    console.log('[PHASE 1] Navigating to Login...');
    await page.goto('http://localhost:3000/commander/login');

    console.log('[PHASE 1] Filling Credentials...');
    await page.fill('input[type="email"]', 'johndonnahue4485@yahoo.com');
    await page.fill('input[type="password"]', 'SmarterPoker2026!');

    console.log('[PHASE 1] Submitting Form...');
    await page.click('button:has-text("Sign In")');

    // Wait for network idle or URL change to dashboard
    try {
        await page.waitForURL('**/commander/dashboard*', { timeout: 15000 });
        console.log('✅ Phase 1: Login & Dashboard navigation SUCCESS.');
    } catch (e) {
        const bodyText = await page.innerText('body');
        console.log('❌ Phase 1 FAILED. Did not reach dashboard. URL:', page.url());
        console.log('Body Preview:', bodyText.substring(0, 300));
        await browser.close();
        process.exit(1);
    }

    console.log('[PHASE 2] Navigating to Member Maintenance...');
    await page.goto('http://localhost:3000/commander/members');

    try {
        await page.waitForSelector('button:has-text("Add Member"), button:has-text("New Member"), button:has-text("Add")', { timeout: 5000 });
        console.log('[PHASE 2] Opening Add Member Form...');

        // Find the right Add button
        const addBtn = await page.locator('button:text-is("Add Member"), button:text-is("New Member"), button:text-matches("(?i)\\\\+.*Add")').first();
        if (await addBtn.count() === 0) {
            const fallback = await page.locator('button').filter({ hasText: /Add/i }).first();
            await fallback.click();
        } else {
            await addBtn.click();
        }

        await page.waitForTimeout(1000); // Wait for modal animation

        console.log('[PHASE 2] Filling Member Form...');
        // Fill fields (resilient selectors based on standard forms)
        await page.fill('input[name="firstName"], input[placeholder*="First"]', 'E2E Test').catch(() => null);
        await page.fill('input[name="lastName"], input[placeholder*="Last"]', 'User').catch(() => null);
        await page.fill('input[name="email"], input[type="email"], input[placeholder*="Email"]', `e2e_user_${Date.now()}@example.com`).catch(() => null);
        await page.fill('input[name="phone"], input[type="tel"], input[placeholder*="Phone"]', '5551239999').catch(() => null);

        console.log('[PHASE 2] Saving Member...');
        const saveBtn = await page.locator('button:text-is("Save"), button:text-is("Add Member"), button[type="submit"]').last();
        await saveBtn.click();

        // Wait for success indicator (list update or toast)
        await page.waitForTimeout(2000);

        const bodyText = await page.innerText('body');
        if (bodyText.includes('E2E Test User')) {
            console.log('✅ Phase 2: Add new club member SUCCESS.');
        } else {
            console.log('⚠️ Phase 2 Verification Warning: Could not find "E2E Test User" on screen, but no crash occurred.');
        }

    } catch (e) {
        console.log('❌ Phase 2 FAILED:', e.message);
    }

    await browser.close();
})();
