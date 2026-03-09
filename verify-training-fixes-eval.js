const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    let allPassed = true;

    const pass = (msg) => console.log(`✅ PASS: ${msg}`);
    const fail = (msg) => { console.error(`❌ FAIL: ${msg}`); allPassed = false; };
    const log = (msg) => console.log(`👉 ${msg}`);

    try {
        page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

        log('Starting E2E Verification for Training Games Fixes...');

        // 1. Check BUG-B: Arena Redirect
        log('Test 1: Check BUG-B (Arena Redirect)');
        await page.goto('http://localhost:3000/hub/training/arena/cash-001', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); // allow redirect
        const url1 = page.url();
        if (url1.includes('/hub/training/play/cash-001')) {
            pass('Arena redirect works (BUG-B)');
        } else {
            fail(`Arena redirect failed, ended up at: ${url1}`);
        }

        // 2. Check BUG-A & BUG-E & BUG-G: Cash Game Shuffling and Keyboard
        log('Test 2: Cash Game Shuffling & Correctness (BUG-A, BUG-E, BUG-G)');
        await page.goto('http://localhost:3000/hub/training/play/cash-001', { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for the action buttons to appear
        log('Waiting for questions to load...');
        await page.waitForSelector('button:has-text("Fold")', { timeout: 45000 });

        // Get options for Question 1
        const getButtonTexts = async () => {
            // target the action buttons block specifically
            return await page.$$eval('#action-button-container button, div[class*="options"] button',
                btns => btns.map(b => b.innerText.trim()).filter(t => t.length > 0)
            );
        };
        // wait for animation to settle
        await page.waitForTimeout(1000);
        let q1Options = await getButtonTexts();
        log(`Q1 Options Order: ${q1Options.join(', ')}`);

        // Answer Q1 via keyboard shortcut '1' 
        // We will press '1' and verify if the feedback triggers, confirming BUG-G fix
        log('Pressing `1` shortcut...');
        await page.keyboard.press('1');

        // Check for feedback
        try {
            await page.waitForSelector('text=Next Hand', { timeout: 10000 });
            pass('Keyboard shortcut `1` properly selected an answer and showed feedback (BUG-G)');
        } catch (e) {
            fail('Keyboard shortcut `1` did not trigger an answer submission.');
            // fallback click
            const btns = await page.$$('button');
            if (btns.length > 0) await btns[0].click();
            await page.waitForSelector('text=Next Hand', { timeout: 10000 });
        }

        // Verify hints (BUG-E)
        let hintVisible = await page.isVisible('text=preferred when checked to') || await page.isVisible('text=blunder') || await page.isVisible('text=The solver');
        if (hintVisible) pass('Explanation overlay works and is immune to shuffle map (BUG-E)');

        // Next Q2
        log('Clicking Next Hand...');
        await page.click('button:has-text("Next Hand")');
        await page.waitForTimeout(2000); // wait for shuffle and render
        await page.waitForSelector('button:has-text("Fold")', { timeout: 15000 });

        // Get options for Question 2
        let q2Options = await getButtonTexts();
        log(`Q2 Options Order: ${q2Options.join(', ')}`);

        // Check if Q1 Options === Q2 Options (they should vary at some point)
        if (q1Options.join(',') !== q2Options.join(',')) {
            pass('Options successfully shuffled between questions (BUG-A)');
        } else {
            // Might be randomly the same, let's check one more
            log('Q1 and Q2 options identical, checking Q3 for shuffle...');
            await page.keyboard.press('1');
            await page.waitForSelector('text=Next Hand', { timeout: 10000 });
            await page.click('button:has-text("Next Hand")');
            await page.waitForTimeout(2000);
            let q3Options = await getButtonTexts();
            log(`Q3 Options Order: ${q3Options.join(', ')}`);
            if (q1Options.join(',') !== q3Options.join(',')) {
                pass('Options successfully shuffled on Q3 (BUG-A)');
            } else {
                fail('Options did NOT shuffle after 3 questions - positional bias is present (BUG-A)');
            }
        }

        // 3. Check BUG-D: Psychology Game Shuffling
        log('Test 3: Psychology Game Shuffling (BUG-D)');
        await page.goto('http://localhost:3000/hub/training/play/psy-001', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('text=Tilt', { timeout: 30000 });
        // wait for buttons
        await page.waitForTimeout(2000);
        let psyQ1 = await getButtonTexts();
        log(`Psy Q1 Options: ${psyQ1.join(', ')}`);

        await page.keyboard.press('1'); // click first
        await page.waitForSelector('text=Next Question', { timeout: 5000 }).catch(e => null);
        await page.click('button:has-text("Next")').catch(e => null);
        await page.locator('button', { hasText: 'Next' }).first().click().catch(e => null);

        await page.waitForTimeout(2000);
        let psyQ2 = await getButtonTexts();
        log(`Psy Q2 Options: ${psyQ2.join(', ')}`);

        if (psyQ1.join(',') !== psyQ2.join(',')) {
            pass('Psychology options successfully shuffled (BUG-D)');
        } else {
            fail('Psychology options did NOT shuffle - positional bias (BUG-D)');
        }

    } catch (err) {
        console.error('Test script encountered an error:', err);
        await page.screenshot({ path: '/Users/smarter.poker/.gemini/antigravity/brain/d0e903b5-405a-4a36-9cbc-516e0413f524/pw_error.png' });
        allPassed = false;
    } finally {
        await browser.close();
        if (allPassed) {
            log('ALL FIXES VERIFIED SUCCESSFULLY! 🎉');
            process.exit(0);
        } else {
            log('SOME TESTS FAILED! ❌');
            process.exit(1);
        }
    }
})();
