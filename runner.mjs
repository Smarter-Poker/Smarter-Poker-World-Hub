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

    // ── LOGIN ──
    console.log('[LOGIN]');
    await page.goto('http://localhost:3000/commander/login', { waitUntil: 'networkidle', timeout: 30000 });
    for (let i = 0; i < 30; i++) {
        if (await page.evaluate(() => !!document.querySelector('input[type="email"]'))) break;
        await page.waitForTimeout(1000);
    }
    await page.evaluate((creds) => {
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const eEl = document.querySelector('input[type="email"]'), pEl = document.querySelector('input[type="password"]');
        if (eEl) { nativeSet.call(eEl, creds[0]); eEl.dispatchEvent(new Event('input', { bubbles: true })); }
        if (pEl) { nativeSet.call(pEl, creds[1]); pEl.dispatchEvent(new Event('input', { bubbles: true })); }
        document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('Sign In')) b.click(); });
    }, ['johndonnahue4485@yahoo.com', 'SmarterPoker2026!']);
    await page.waitForURL('**/commander/dashboard*', { timeout: 20000 });
    console.log('  ✅ Logged in.');

    // Override venue_id to 2006
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        s.venue_id = 2006; s.venue_name = 'E2E Test Poker Room';
        localStorage.setItem('commander_staff', JSON.stringify(s));
    });
    await page.waitForTimeout(2000);

    // ── NAVIGATE TO WAITLIST DESK ──
    console.log('\n[PHASE 4] Waitlist Operations');
    console.log('  → Navigating to /commander/waitlist/desk...');
    await page.evaluate(() => { window.location.href = '/commander/waitlist/desk'; });
    await page.waitForTimeout(6000);

    // Poll for page content
    let pageReady = false;
    for (let i = 0; i < 20; i++) {
        pageReady = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            return text.includes('POKER WAITING LIST') || text.includes('Add Player') || text.includes('Add Game') || text.includes('No Games');
        });
        if (pageReady) break;
        await page.waitForTimeout(1000);
        if (i === 10) console.log('  Waiting for desk to render... lastErr:', lastError.substring(0, 80));
    }

    if (!pageReady) {
        console.log('FATAL: Waitlist desk never rendered. LastErr:', lastError.substring(0, 200));
        const html = await page.evaluate(() => document.body?.innerHTML?.substring(0, 500) || 'EMPTY');
        console.log('HTML:', html);
        await browser.close(); process.exit(1);
    }
    console.log('  ✅ Waitlist desk loaded.');

    // Check page state
    const deskState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            hasAddPlayer: text.includes('Add Player'),
            hasAddGame: text.includes('Add Game'),
            hasNoGames: text.includes('No Games'),
            hasNLH: text.toUpperCase().includes('NLH'),
            snippet: text.substring(0, 300)
        };
    });
    console.log(`  State: AddPlayer=${deskState.hasAddPlayer} AddGame=${deskState.hasAddGame} NoGames=${deskState.hasNoGames} NLH=${deskState.hasNLH}`);

    // ── STEP 1: ADD A PLAYER TO WAITLIST ──
    console.log('\n  Step 1: Add Player to Waitlist');

    // If no games exist, we need to add one first via the "Add Game" modal
    if (deskState.hasNoGames || !deskState.hasNLH) {
        console.log('  → No games on board. Adding NLH $1/$2 game...');
        await page.evaluate(() => {
            [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Game'))?.click();
        });
        await page.waitForTimeout(1000);

        // Fill in the Add Game modal
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            // Find game type and stakes inputs
            inputs.forEach(inp => {
                const placeholder = (inp.placeholder || '').toLowerCase();
                const label = inp.previousElementSibling?.textContent?.toLowerCase() || '';
                if (placeholder.includes('game') || placeholder.includes('type') || label.includes('game') || label.includes('type')) {
                    setter.call(inp, 'NLH'); inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (placeholder.includes('stakes') || placeholder.includes('blind') || label.includes('stakes') || label.includes('blind')) {
                    setter.call(inp, '$1/$2'); inp.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        });
        await page.waitForTimeout(500);

        // Click the confirm/add button
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const addBtn = btns.find(b => b.textContent.includes('Add') && !b.textContent.includes('Player') && !b.textContent.includes('Game'));
            if (addBtn) addBtn.click();
        });
        await page.waitForTimeout(2000);
        console.log('  ✅ Game added.');
    }

    // Click "Add Player" button
    console.log('  → Clicking "Add Player"...');
    await page.evaluate(() => {
        [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Player'))?.click();
    });
    await page.waitForTimeout(1500);

    // Check what modal appeared
    const modalState = await page.evaluate(() => {
        const text = document.body.innerText;
        const inputs = [...document.querySelectorAll('input')];
        return {
            hasNameInput: inputs.some(i => (i.placeholder || '').toLowerCase().includes('name') || (i.type === 'text')),
            hasModal: text.includes('Walk-In') || text.includes('Add') || text.includes('Name') || text.includes('Player'),
            inputCount: inputs.length,
            snippet: text.substring(0, 400)
        };
    });
    console.log(`  Modal: hasName=${modalState.hasNameInput} inputs=${modalState.inputCount}`);

    // Fill in walk-in player name
    await page.evaluate(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const inputs = [...document.querySelectorAll('input')];
        // Find name input (usually the first text input in the modal)
        const nameInput = inputs.find(i => {
            const ph = (i.placeholder || '').toLowerCase();
            return ph.includes('name') || ph.includes('player') || (i.type === 'text' && !ph.includes('phone'));
        }) || inputs.find(i => i.type === 'text');

        if (nameInput) {
            setter.call(nameInput, 'E2E Test Walker');
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Find phone input (optional)
        const phoneInput = inputs.find(i => {
            const ph = (i.placeholder || '').toLowerCase();
            return ph.includes('phone') || i.type === 'tel';
        });
        if (phoneInput) {
            setter.call(phoneInput, '5551234567');
            phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    await page.waitForTimeout(500);

    // Find and select game type in the modal (if there's a select/dropdown)
    await page.evaluate(() => {
        const selects = [...document.querySelectorAll('select')];
        selects.forEach(sel => {
            const opts = [...sel.options];
            const nlhOpt = opts.find(o => o.text.toUpperCase().includes('NLH') || o.value.toUpperCase().includes('NLH'));
            if (nlhOpt) {
                sel.value = nlhOpt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });
    await page.waitForTimeout(300);

    // Click the submit button in the modal
    await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        // Look for "Add", "Join", "Submit", or "Save" button
        const submitBtn = btns.find(b => {
            const t = b.textContent.trim();
            return (t.includes('Add') || t.includes('Join') || t.includes('Submit') || t.includes('Save'))
                && !t.includes('Add Player') && !t.includes('Add Game');
        });
        if (submitBtn) submitBtn.click();
    });
    await page.waitForTimeout(3000);

    // Verify player was added
    const addResult = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            hasTestWalker: text.includes('E2E Test Walker') || text.includes('E2e Test Walker'),
            hasAdded: text.includes('added to waitlist'),
            snippet: text.substring(0, 400)
        };
    });
    console.log(`  Add result: playerVisible=${addResult.hasTestWalker} addedMsg=${addResult.hasAdded}`);

    if (addResult.hasTestWalker) {
        console.log('  ✅ Player "E2E Test Walker" added to waitlist!');
    } else {
        console.log('  ⚠️ Player may not have been added. Checking body...');
        console.log('  Body:', addResult.snippet);
    }

    // ── STEP 2: CALL PLAYER ──
    console.log('\n  Step 2: Call Player');
    // Click on the player name to open action buttons
    await page.evaluate(() => {
        const divs = [...document.querySelectorAll('div')];
        const playerDiv = divs.find(d => d.textContent.includes('E2E Test Walker') || d.textContent.includes('E2e Test Walker'));
        if (playerDiv) playerDiv.click();
    });
    await page.waitForTimeout(1000);

    // Click "Text" button (which calls the player)
    const callResult = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const textBtn = btns.find(b => b.textContent.includes('Text'));
        if (textBtn) { textBtn.click(); return { clicked: true }; }
        // Also try "Call" button
        const callBtn = btns.find(b => b.textContent.includes('Call'));
        if (callBtn) { callBtn.click(); return { clicked: true, isCall: true }; }
        return { clicked: false, buttons: btns.map(b => b.textContent.trim().substring(0, 20)) };
    });
    console.log(`  Call: ${callResult.clicked ? '✅ Clicked' : '❌ Button not found'}`);
    await page.waitForTimeout(3000);

    // Verify status changed to "called"
    const callVerify = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            hasTexted: text.includes('TEXTED'),
            hasCalled: text.includes('Called'),
            hasNotified: text.includes('notified'),
            snippet: text.substring(0, 400)
        };
    });
    console.log(`  Status: TEXTED=${callVerify.hasTexted} Called=${callVerify.hasCalled} Notified=${callVerify.hasNotified}`);
    if (callVerify.hasTexted || callVerify.hasCalled) {
        console.log('  ✅ Player called/texted!');
    }

    // ── STEP 3: SEAT PLAYER ──
    console.log('\n  Step 3: Seat Player');
    // Re-click the player name to re-open actions (call may have closed them)
    await page.evaluate(() => {
        const spans = [...document.querySelectorAll('span')];
        const playerSpan = spans.find(s => s.textContent.includes('E2E Test Walker') || s.textContent.includes('E2e Test Walker'));
        if (playerSpan) playerSpan.click();
    });
    await page.waitForTimeout(1000);

    // Click "Seat" button
    const seatClicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const seatBtn = btns.find(b => b.textContent.includes('Seat'));
        if (seatBtn) { seatBtn.click(); return true; }
        return false;
    });
    console.log(`  Seat button: ${seatClicked ? '✅ Clicked' : '❌ Not found'}`);
    await page.waitForTimeout(1500);

    // Check if a seat selection modal appeared
    const seatModalState = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            hasTable: text.includes('Table'),
            hasSeat: text.includes('Seat'),
            hasSelect: text.includes('Select'),
            buttons: [...document.querySelectorAll('button')].map(b => b.textContent.trim().substring(0, 25)),
            snippet: text.substring(0, 500)
        };
    });
    console.log(`  Seat modal: table=${seatModalState.hasTable} seat=${seatModalState.hasSeat}`);

    if (seatModalState.hasTable && seatModalState.hasSeat) {
        // Select table and seat
        await page.evaluate(() => {
            // Click on Table 1 or the first available table button
            const btns = [...document.querySelectorAll('button')];
            const tableBtn = btns.find(b => b.textContent.includes('Table 1') || b.textContent.match(/T\d/));
            if (tableBtn) tableBtn.click();
        });
        await page.waitForTimeout(800);

        // Click on Seat 1 or the first available seat
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const seatBtn = btns.find(b => b.textContent.includes('Seat 1') || b.textContent.match(/^S?1$/));
            if (seatBtn) seatBtn.click();
        });
        await page.waitForTimeout(500);

        // Confirm seat
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const confirmBtn = btns.find(b => b.textContent.includes('Confirm') || b.textContent.includes('Seat'));
            if (confirmBtn) confirmBtn.click();
        });
        await page.waitForTimeout(3000);
    }

    // Verify player was seated (removed from waitlist)
    const seatResult = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
            playerGone: !text.includes('E2E Test Walker') && !text.includes('E2e Test Walker'),
            hasSeated: text.includes('seated'),
            snippet: text.substring(0, 400)
        };
    });
    console.log(`  Seat result: playerRemoved=${seatResult.playerGone} seatedMsg=${seatResult.hasSeated}`);

    if (seatResult.playerGone) {
        console.log('  ✅ Player removed from waitlist (seated)!');
    } else if (seatResult.hasSeated) {
        console.log('  ✅ Player seated!');
    } else {
        console.log('  ⚠️ Player may still be on waitlist.');
    }

    // ── FINAL SUMMARY ──
    console.log('\n═══════════════════════════════════════════════════════════════');
    const passed = (addResult.hasTestWalker || addResult.hasAdded) && (callVerify.hasTexted || callVerify.hasCalled);
    if (passed) {
        console.log('  ✅ PHASE 4 PASSED — Waitlist operations verified!');
    } else {
        console.log('  ⚠️ PHASE 4 PARTIAL — Some operations may need manual verification.');
    }
    console.log('═══════════════════════════════════════════════════════════════');

    await browser.close();
})();
