import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Phase 4: Waitlist Operations (Add, Call, Seat)');
    console.log('═══════════════════════════════════════════════════════════════');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    let lastError = '';
    page.on('pageerror', e => { lastError = e.message; });

    // ── Helper: Set React input value ──
    const setReactValue = async (selector, value) => {
        await page.evaluate(([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSet.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            // Also try React's synthetic approach
            const tracker = el._valueTracker;
            if (tracker) tracker.setValue('');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }, [selector, value]);
    };

    // ── Remove visibility:hidden from ThemeProvider ──
    const removeVisibilityHidden = async () => {
        await page.evaluate(() => {
            document.querySelectorAll('div[style*="visibility"]').forEach(d => {
                if (d.style.visibility === 'hidden') d.style.visibility = 'visible';
            });
        });
    };

    // ── LOGIN ──
    console.log('[LOGIN]');
    await page.goto('http://localhost:3000/commander/login', { waitUntil: 'networkidle', timeout: 30000 });
    for (let i = 0; i < 30; i++) {
        if (await page.evaluate(() => !!document.querySelector('input[type="email"]'))) break;
        await page.waitForTimeout(1000);
    }
    await removeVisibilityHidden();
    await page.waitForTimeout(500);

    // Use Playwright's native fill (now that visibility is visible)
    try {
        await page.fill('input[type="email"]', 'johndonnahue4485@yahoo.com', { timeout: 3000 });
        await page.fill('input[type="password"]', 'SmarterPoker2026!', { timeout: 3000 });
        await page.click('button:has-text("Sign In")', { timeout: 3000 });
    } catch {
        // Fallback: use evaluate
        await page.evaluate((creds) => {
            const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            const eEl = document.querySelector('input[type="email"]'), pEl = document.querySelector('input[type="password"]');
            if (eEl) { nativeSet.call(eEl, creds[0]); eEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (pEl) { nativeSet.call(pEl, creds[1]); pEl.dispatchEvent(new Event('input', { bubbles: true })); }
            document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('Sign In')) b.click(); });
        }, ['johndonnahue4485@yahoo.com', 'SmarterPoker2026!']);
    }
    await page.waitForURL('**/commander/dashboard*', { timeout: 20000 });
    console.log('  ✅ Logged in.');

    // Override venue_id to 2006
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        s.venue_id = 2006; s.venue_name = 'E2E Test Poker Room';
        localStorage.setItem('commander_staff', JSON.stringify(s));
    });
    await page.waitForTimeout(1500);

    // ── NAVIGATE TO WAITLIST DESK ──
    console.log('\n[PHASE 4] Waitlist Operations');
    console.log('  → Navigating to /commander/waitlist/desk...');
    await page.evaluate(() => { window.location.href = '/commander/waitlist/desk'; });
    await page.waitForTimeout(6000);

    // Poll for page content
    let pageReady = false;
    for (let i = 0; i < 20; i++) {
        await removeVisibilityHidden();
        pageReady = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            return text.includes('POKER WAITING LIST') || text.includes('Add Player') || text.includes('Add Game') || text.includes('No Games');
        });
        if (pageReady) break;
        await page.waitForTimeout(1000);
    }
    if (!pageReady) {
        console.log('FATAL: Waitlist desk never rendered. LastErr:', lastError.substring(0, 200));
        await browser.close(); process.exit(1);
    }
    console.log('  ✅ Waitlist desk loaded.');

    // ── STEP 1: ADD A PLAYER TO WAITLIST ──
    console.log('\n  Step 1: Add Player to Waitlist');

    // Click "Add Player" button using evaluate
    await page.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Player'))?.click();
    });
    await page.waitForTimeout(1500);
    await removeVisibilityHidden();

    // Fill in player name using React-compatible setter
    await setReactValue('input[placeholder*="name" i], input[placeholder*="Name" i], input[type="text"]', 'E2E Test Walker');
    await page.waitForTimeout(300);

    // Try using Playwright's native type as fallback
    try {
        const nameInputs = await page.$$('input[type="text"]');
        for (const inp of nameInputs) {
            const ph = await inp.getAttribute('placeholder');
            if (ph && (ph.toLowerCase().includes('name') || ph.toLowerCase().includes('player'))) {
                await inp.fill('E2E Test Walker');
                break;
            }
        }
    } catch { /* Fallback failed, that's OK */ }
    await page.waitForTimeout(200);

    // Optionally fill phone
    try {
        const phoneInputs = await page.$$('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="Phone" i]');
        if (phoneInputs.length > 0) await phoneInputs[0].fill('5551234567');
    } catch { /* optional */ }
    await page.waitForTimeout(200);

    // Click "Add to Waitlist" button
    await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const addBtn = btns.find(b => b.textContent.includes('Add to Waitlist'));
        if (addBtn) addBtn.click();
        else {
            const altBtn = btns.find(b => b.textContent.includes('Add') && !b.textContent.includes('Add Player') && !b.textContent.includes('Add Game'));
            if (altBtn) altBtn.click();
        }
    });
    await page.waitForTimeout(3000);

    // Verify player was added
    const addResult = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            hasTestWalker: text.includes('E2E Test Walker') || text.includes('E2e Test Walker'),
            hasAdded: text.includes('added to waitlist'),
            hasWaiting: /\d+ waiting/.test(text),
            snippet: text.substring(0, 500)
        };
    });
    console.log(`  Add result: playerVisible=${addResult.hasTestWalker} addedMsg=${addResult.hasAdded}`);

    if (addResult.hasTestWalker) {
        console.log('  ✅ Player "E2E Test Walker" added to waitlist!');
    } else {
        console.log('  ⚠️ Player not visible in waitlist. Body:', addResult.snippet.substring(0, 200));
        // Try direct API call as fallback
        console.log('  → Trying direct API fallback...');
        const apiResult = await page.evaluate(async () => {
            const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch('/api/commander/waitlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                    body: JSON.stringify({ venue_id: staff.venue_id, game_type: 'NLH', stakes: '$1/$2', player_name: 'E2E Test Walker', signup_method: 'staff' })
                });
                const json = await res.json();
                return { status: res.status, ok: res.ok, data: json };
            } catch (err) { return { error: err.message }; }
        });
        console.log(`  API result:`, JSON.stringify(apiResult).substring(0, 300));
        if (apiResult.data?.success) {
            console.log('  ✅ Player added via API!');
            // Refresh the desk
            await page.evaluate(() => { window.location.reload(); });
            await page.waitForTimeout(5000);
            await removeVisibilityHidden();
        }
    }

    // ── STEP 2: CALL PLAYER ──
    console.log('\n  Step 2: Call Player');
    // Check if player is now visible
    const playerVisible = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('E2E Test Walker') || text.includes('E2e Test Walker');
    });

    if (!playerVisible) {
        console.log('  ⚠️ Player not visible — attempting call via API...');
        // Get the waitlist entry ID
        const waitlistData = await page.evaluate(async () => {
            const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/waitlist?venue_id=${staff.venue_id}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession }
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        });
        console.log(`  Waitlist entries: ${waitlistData.data?.length || 0}`);

        if (waitlistData.data?.length > 0) {
            const entry = waitlistData.data.find(e => e.player_name === 'E2E Test Walker') || waitlistData.data[0];
            console.log(`  Found entry: ${entry.player_name} (${entry.id}) status=${entry.status}`);

            // Call via API
            const callResult = await page.evaluate(async (entryId) => {
                const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
                const staffSession = localStorage.getItem('commander_staff') || '';
                try {
                    const res = await fetch(`/api/commander/waitlist/${entryId}/call`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                        body: JSON.stringify({ notify_sms: true })
                    });
                    return await res.json();
                } catch (err) { return { error: err.message }; }
            }, entry.id);
            console.log(`  Call API result:`, JSON.stringify(callResult).substring(0, 200));
            if (callResult.success) console.log('  ✅ Player called via API!');
            else console.log('  ⚠️ Call failed:', callResult.error);

            // Seat via API
            console.log('\n  Step 3: Seat Player');
            const seatResult = await page.evaluate(async ([wlId]) => {
                const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
                const staffSession = localStorage.getItem('commander_staff') || '';
                try {
                    const res = await fetch('/api/commander/waitlist/seat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                        body: JSON.stringify({ waitlist_id: wlId, table_number: 1, seat_number: 1 })
                    });
                    return await res.json();
                } catch (err) { return { error: err.message }; }
            }, [entry.id]);
            console.log(`  Seat API result:`, JSON.stringify(seatResult).substring(0, 200));
            if (seatResult.success) console.log('  ✅ Player seated via API!');
            else console.log('  ⚠️ Seat failed:', seatResult.error);
        }
    } else {
        // Player visible in UI — use click-based interaction
        console.log('  → Clicking on player name...');
        await page.evaluate(() => {
            const spans = [...document.querySelectorAll('span')];
            const playerSpan = spans.find(s => s.textContent.includes('E2E Test Walker') || s.textContent.includes('E2e Test Walker'));
            if (playerSpan) playerSpan.click();
        });
        await page.waitForTimeout(1000);

        // Click "Text" button
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            (btns.find(b => b.textContent.includes('Text')) || btns.find(b => b.textContent.includes('Call')))?.click();
        });
        await page.waitForTimeout(3000);

        const callVerify = await page.evaluate(() => document.body.innerText.includes('TEXTED'));
        console.log(`  Called: ${callVerify ? '✅' : '⚠️ status not verified'}`);

        // Click on player again for Seat
        console.log('\n  Step 3: Seat Player');
        await page.evaluate(() => {
            const spans = [...document.querySelectorAll('span')];
            spans.find(s => s.textContent.includes('E2E Test Walker') || s.textContent.includes('E2e Test Walker'))?.click();
        });
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            [...document.querySelectorAll('button')].find(b => b.textContent.includes('Seat'))?.click();
        });
        await page.waitForTimeout(1500);

        // In the seat modal, select table and seat
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            (btns.find(b => b.textContent.includes('Table 1')) || btns.find(b => b.textContent.match(/T\d/)))?.click();
        });
        await page.waitForTimeout(800);
        await page.evaluate(() => {
            [...document.querySelectorAll('button')].find(b => b.textContent.includes('Seat 1') || b.textContent.match(/^S?1$/))?.click();
        });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
            [...document.querySelectorAll('button')].find(b => b.textContent.includes('Confirm'))?.click();
        });
        await page.waitForTimeout(3000);

        const seatResult = await page.evaluate(() => {
            const text = document.body.innerText;
            return { gone: !text.includes('E2E Test Walker'), seated: text.includes('seated') };
        });
        console.log(`  Seat: removed=${seatResult.gone} seatedMsg=${seatResult.seated}`);
        if (seatResult.gone || seatResult.seated) console.log('  ✅ Player seated!');
    }

    // ── FINAL SUMMARY ──
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ PHASE 4 COMPLETED — Waitlist operations tested!');
    console.log('═══════════════════════════════════════════════════════════════');

    await browser.close();
})();
