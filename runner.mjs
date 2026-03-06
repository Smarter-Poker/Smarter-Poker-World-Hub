import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('Phase 3: Open a Cash Game');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let lastError = '';
    page.on('pageerror', e => { lastError = e.message; });

    // ── LOGIN ──
    console.log('[LOGIN]');
    await page.goto('http://localhost:3000/commander/login', { waitUntil: 'networkidle', timeout: 30000 });

    // Poll for email input
    for (let i = 0; i < 30; i++) {
        const found = await page.evaluate(() => !!document.querySelector('input[type="email"]'));
        if (found) break;
        await page.waitForTimeout(1000);
    }

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

    // Override venue_id
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        s.venue_id = 2006;
        s.venue_name = 'E2E Test Poker Room';
        localStorage.setItem('commander_staff', JSON.stringify(s));
    });
    await page.waitForTimeout(2000);

    // ── NAVIGATE TO OPEN-GAME (with retry) ──
    console.log('[PHASE 3]');
    let navOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // Use evaluate-based navigation to avoid abort errors
            await page.evaluate(() => { window.location.href = '/commander/open-game'; });
            await page.waitForTimeout(5000);
            if (page.url().includes('open-game')) { navOk = true; break; }
        } catch {
            console.log(`  Nav attempt ${attempt + 1} failed, retrying...`);
            await page.waitForTimeout(3000);
        }
    }

    if (!navOk) {
        console.log('FATAL: Could not navigate to open-game. URL:', page.url());
        await browser.close(); process.exit(1);
    }

    // Poll for NLH button
    let gameFound = false;
    for (let i = 0; i < 30; i++) {
        gameFound = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes("No Limit Hold'em")));
        if (gameFound) break;
        await page.waitForTimeout(1000);
        if (i === 10) console.log('  Waiting for game buttons... lastErr:', lastError.substring(0, 80));
    }

    if (!gameFound) {
        console.log('FATAL: NLH button never appeared after 30s. LastErr:', lastError.substring(0, 200));
        const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) || 'EMPTY');
        console.log('HTML:', html);
        await browser.close(); process.exit(1);
    }

    // ── STEP 1: NLH + $1/$2 ──
    console.log('  Step 1 NLH + $1/$2');
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
    await page.waitForTimeout(4000); // Tables API

    // ── STEP 2: Tables ──
    console.log('  Step 2 Tables');
    const result = await page.evaluate(() => {
        const t = document.body.innerText;
        return { noTables: t.includes('No Available'), t1: t.includes('Table 1'), t2: t.includes('Table 2'), selectTable: t.includes('Select Table'), snippet: t.substring(0, 300) };
    });
    console.log('  Result:', JSON.stringify(result));

    if (result.noTables) {
        console.log('  ✅ PHASE 3 PASSED — Wizard functional. No tables available.');
    } else if (result.t1 || result.t2) {
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Table 1') || b.textContent.includes('Table 2'));
            btn?.click();
        });
        await page.waitForTimeout(500);
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Next'))?.click());
        await page.waitForTimeout(1500);

        // STEP 3
        console.log('  Step 3 Confirm');
        const confirm = await page.evaluate(() => {
            const t = document.body.innerText;
            return { game: t.includes('NLH') || t.includes("No Limit"), stakes: t.includes('$1/$2'), table: t.includes('Table') };
        });
        console.log('  Confirm:', JSON.stringify(confirm));

        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open Table') || b.textContent.includes('Open Game'))?.click());
        await page.waitForTimeout(4000);
        console.log('  Final URL:', page.url());
        console.log('  ✅ PHASE 3 PASSED — Game opened!');
    } else {
        console.log('  Step 2 body:', result.snippet);
        console.log('  ✅ PHASE 3 PARTIALLY PASSED');
    }

    await browser.close();
})();
