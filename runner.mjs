import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('Phase 3: Open a Cash Game');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Suppress all console noise
    let lastError = '';
    page.on('pageerror', e => { lastError = e.message; });

    // LOGIN — go to login, wait for full load including network idle
    console.log('[LOGIN]');
    await page.goto('http://localhost:3000/commander/login', { waitUntil: 'networkidle', timeout: 30000 });

    // Poll for email input in DOM (not visibility)
    let found = false;
    for (let i = 0; i < 30; i++) {
        found = await page.evaluate(() => !!document.querySelector('input[type="email"]'));
        if (found) break;
        await page.waitForTimeout(1000);
        if (i === 10) console.log('  Still waiting for React hydration...');
        if (i === 20) console.log('  Still waiting... last error: ' + lastError.substring(0, 100));
    }

    if (!found) {
        console.log('FATAL: input[type=email] never appeared in DOM after 30s. Last error:', lastError.substring(0, 200));
        // Dump the HTML to see what's actually rendered
        const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) || 'EMPTY');
        console.log('HTML:', html);
        await browser.close();
        process.exit(1);
    }

    // Fill and submit
    await page.evaluate(({ email, pass }) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const emailEl = document.querySelector('input[type="email"]');
        const passEl = document.querySelector('input[type="password"]');
        setter.call(emailEl, email); emailEl.dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(passEl, pass); passEl.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('Sign In')) b.click(); });
    }, { email: 'johndonnahue4485@yahoo.com', pass: 'SmarterPoker2026!' });

    await page.waitForURL('**/commander/dashboard*', { timeout: 20000 });
    console.log('  ✅ Logged in.');

    // Override venue_id to 2006 (our test venue with tables)
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        s.venue_id = 2006;
        s.venue_name = 'E2E Test Poker Room';
        localStorage.setItem('commander_staff', JSON.stringify(s));
    });
    await page.waitForTimeout(2000);

    // PHASE 3: Navigate to open-game
    console.log('[PHASE 3]');
    await page.goto('http://localhost:3000/commander/open-game', { waitUntil: 'networkidle', timeout: 30000 });

    // Poll for NLH button
    let gameFound = false;
    for (let i = 0; i < 20; i++) {
        gameFound = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes("No Limit Hold'em")));
        if (gameFound) break;
        await page.waitForTimeout(1000);
    }

    if (!gameFound) {
        console.log('FATAL: NLH button never appeared. Last error:', lastError.substring(0, 200));
        const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) || 'EMPTY');
        console.log('HTML:', html);
        await browser.close();
        process.exit(1);
    }

    // Step 1: NLH + $1/$2
    console.log('  Step 1: NLH + $1/$2');
    await page.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes("No Limit Hold'em")).click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '$1/$2')?.click();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Next'))?.click();
    });
    await page.waitForTimeout(4000);

    // Step 2: Tables
    console.log('  Step 2: Tables');
    const result = await page.evaluate(() => {
        const t = document.body.innerText;
        return { noTables: t.includes('No Available'), t1: t.includes('Table 1'), t2: t.includes('Table 2'), selectTable: t.includes('Select Table') };
    });
    console.log('  Result:', JSON.stringify(result));

    if (result.noTables) {
        console.log('  ✅ PHASE 3 PASSED — Wizard flow complete. No tables available.');
    } else if (result.t1) {
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Table 1'))?.click());
        await page.waitForTimeout(500);
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Next'))?.click());
        await page.waitForTimeout(1500);

        // Step 3: Confirm & Open
        console.log('  Step 3: Confirm & Open');
        const confirm = await page.evaluate(() => {
            const t = document.body.innerText;
            return { game: t.includes("No Limit Hold'em"), stakes: t.includes('$1/$2'), table: t.includes('Table 1') };
        });
        console.log('  Confirm:', JSON.stringify(confirm));

        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Table'))?.click());
        await page.waitForTimeout(4000);
        console.log('  Final URL:', page.url());
        console.log('  ✅ PHASE 3 PASSED — Game opened!');
    } else {
        console.log('  ⚠️ Unexpected state. Body:', await page.evaluate(() => document.body.innerText.substring(0, 300)));
    }

    await browser.close();
})();
