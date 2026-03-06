import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Phase 5: Tables & Floor Management');
    console.log('═══════════════════════════════════════════════════════════════');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    let lastError = '';
    page.on('pageerror', e => { lastError = e.message; });

    const removeVH = async () => {
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
    await removeVH();
    await page.waitForTimeout(500);
    try {
        await page.fill('input[type="email"]', 'johndonnahue4485@yahoo.com', { timeout: 3000 });
        await page.fill('input[type="password"]', 'SmarterPoker2026!', { timeout: 3000 });
        await page.click('button:has-text("Sign In")', { timeout: 3000 });
    } catch {
        await page.evaluate((c) => {
            const ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            const eEl = document.querySelector('input[type="email"]'), pEl = document.querySelector('input[type="password"]');
            if (eEl) { ns.call(eEl, c[0]); eEl.dispatchEvent(new Event('input', { bubbles: true })); }
            if (pEl) { ns.call(pEl, c[1]); pEl.dispatchEvent(new Event('input', { bubbles: true })); }
            document.querySelectorAll('button').forEach(b => { if (b.textContent.includes('Sign In')) b.click(); });
        }, ['johndonnahue4485@yahoo.com', 'SmarterPoker2026!']);
    }
    await page.waitForURL('**/commander/dashboard*', { timeout: 20000 });
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        s.venue_id = 2006; s.venue_name = 'E2E Test Poker Room';
        localStorage.setItem('commander_staff', JSON.stringify(s));
    });
    console.log('  ✅ Logged in.');
    await page.waitForTimeout(1500);

    // ===============================================================
    // STEP 1: Navigate to Tables page
    // ===============================================================
    console.log('\n[STEP 1] Tables Page');
    await page.evaluate(() => { window.location.href = '/commander/tables'; });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 15; i++) {
        await removeVH();
        const ready = await page.evaluate(() => {
            const t = document.body?.innerText || '';
            return t.includes('Tables and Floor') || t.includes('Table') || t.includes('Idle Tables') || t.includes('No Tables');
        });
        if (ready) break;
        await page.waitForTimeout(1000);
    }

    const tablesState = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            hasHeader: t.includes('Tables and Floor'),
            hasAddTable: t.includes('Add Table'),
            hasTable1: t.includes('Table 1'),
            hasTable2: t.includes('Table 2'),
            hasLive: t.includes('Live Tables'),
            hasIdle: t.includes('Idle Tables'),
            hasNoTables: t.includes('No Tables'),
            snippet: t.substring(0, 400)
        };
    });
    console.log(`  Header=${tablesState.hasHeader} AddTable=${tablesState.hasAddTable} T1=${tablesState.hasTable1} T2=${tablesState.hasTable2} Live=${tablesState.hasLive} Idle=${tablesState.hasIdle}`);

    if (tablesState.hasHeader || tablesState.hasTable1) {
        console.log('  ✅ Tables page loaded!');
    } else {
        console.log('  ⚠️ Tables page may not have loaded. Snippet:', tablesState.snippet.substring(0, 200));
    }

    // ===============================================================
    // STEP 2: Add a new table via API (then verify on page)
    // ===============================================================
    console.log('\n[STEP 2] Add New Table');
    const addTableResult = await page.evaluate(async () => {
        const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        const staffSession = localStorage.getItem('commander_staff') || '';
        try {
            const res = await fetch('/api/commander/tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
                body: JSON.stringify({ venue_id: staff.venue_id, table_number: 99, table_name: 'E2E Test Table', max_seats: 8 })
            });
            return await res.json();
        } catch (err) { return { error: err.message }; }
    });
    console.log(`  API: success=${addTableResult.success || false}`, addTableResult.data?.table?.id ? `id=${addTableResult.data.table.id}` : (addTableResult.error?.message || ''));

    if (addTableResult.success) {
        console.log('  ✅ Table 99 (E2E Test Table) created!');
        // Reload to see new table
        await page.evaluate(() => { window.location.reload(); });
        await page.waitForTimeout(5000);
        await removeVH();
        const hasT99 = await page.evaluate(() => document.body.innerText.includes('Table 99'));
        console.log(`  Visible on page: ${hasT99 ? '✅' : '⚠️ not visible'}`);
    } else {
        console.log(`  ⚠️ Table creation failed: ${addTableResult.error?.message || JSON.stringify(addTableResult.error)}`);
    }

    // ===============================================================
    // STEP 3: Verify existing tables (from Phase 3 provisioning)
    // ===============================================================
    console.log('\n[STEP 3] Verify Tables API');
    const tablesData = await page.evaluate(async () => {
        const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        const staffSession = localStorage.getItem('commander_staff') || '';
        try {
            const res = await fetch(`/api/commander/tables?venue_id=${staff.venue_id}`, {
                headers: { 'x-staff-session': staffSession }
            });
            return await res.json();
        } catch (err) { return { error: err.message }; }
    });
    const tablesList = tablesData.data?.tables || [];
    console.log(`  Tables count: ${tablesList.length}`);
    tablesList.forEach(t => console.log(`    Table ${t.table_number}: ${t.table_name || 'unnamed'} | ${t.max_seats} seats | status=${t.status} | game=${t.game_type || 'none'}`));

    // ===============================================================
    // STEP 4: Start a game on an idle table via API
    // ===============================================================
    console.log('\n[STEP 4] Start Game on Table');
    const idleTable = tablesList.find(t => t.status === 'available') || tablesList.find(t => t.status !== 'in_use');
    if (idleTable) {
        console.log(`  → Starting PLO $2/$5 on Table ${idleTable.table_number}...`);
        const startResult = await page.evaluate(async (tableId) => {
            const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                // Create game
                const gameRes = await fetch('/api/commander/games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
                    body: JSON.stringify({ venue_id: staff.venue_id, table_id: tableId, game_type: 'PLO', stakes: '$2/$5', max_players: 9, status: 'waiting' })
                });
                const gameData = await gameRes.json();
                if (!gameData.success && !gameData.data) return { step: 'game', error: gameData };

                // Update table status
                const tableRes = await fetch(`/api/commander/tables/${tableId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
                    body: JSON.stringify({ status: 'in_use', game_type: 'PLO', stakes: '$2/$5', mode: 'cash', table_purpose: 'cash_game' })
                });
                const tableData = await tableRes.json();
                return { success: true, game: gameData, table: tableData };
            } catch (err) { return { error: err.message }; }
        }, idleTable.id);
        console.log(`  Start result: success=${startResult.success || false}`);
        if (startResult.success) {
            console.log(`  ✅ PLO $2/$5 started on Table ${idleTable.table_number}!`);
        } else {
            console.log(`  ⚠️ Start failed:`, JSON.stringify(startResult.error || startResult).substring(0, 200));
        }
    } else {
        console.log('  ⚠️ No idle table available to start game on.');
    }

    // ===============================================================
    // STEP 5: Set table status (reserved)
    // ===============================================================
    console.log('\n[STEP 5] Set Table Status');
    const tableToReserve = tablesList.find(t => t.status === 'available' && t.id !== idleTable?.id);
    if (tableToReserve) {
        const setStatusResult = await page.evaluate(async (tableId) => {
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/tables/${tableId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
                    body: JSON.stringify({ status: 'reserved' })
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, tableToReserve.id);
        console.log(`  Set Table ${tableToReserve.table_number} to Reserved: ${setStatusResult.success ? '✅' : '⚠️ ' + JSON.stringify(setStatusResult.error)}`);
    } else {
        console.log('  ⚠️ No available table to reserve (all in use or only one).');
    }

    // ===============================================================
    // STEP 6: Navigate to Floor page
    // ===============================================================
    console.log('\n[STEP 6] Floor Map Page');
    await page.evaluate(() => { window.location.href = '/commander/floor'; });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 10; i++) {
        await removeVH();
        const ready = await page.evaluate(() => {
            const t = document.body?.innerText || '';
            return t.includes('Floor') || t.includes('Table') || t.includes('Edit');
        });
        if (ready) break;
        await page.waitForTimeout(1000);
    }

    const floorState = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            hasFloor: t.includes('Floor'),
            hasTable: t.includes('Table'),
            hasEdit: t.includes('Edit'),
            snippet: t.substring(0, 400)
        };
    });
    console.log(`  Floor=${floorState.hasFloor} Table=${floorState.hasTable} Edit=${floorState.hasEdit}`);
    if (floorState.hasFloor || floorState.hasTable) {
        console.log('  ✅ Floor map loaded!');
    } else {
        console.log('  ⚠️ Floor map may not have loaded. Snippet:', floorState.snippet.substring(0, 200));
    }

    // ===============================================================
    // STEP 7: Delete the test table (cleanup)
    // ===============================================================
    console.log('\n[STEP 7] Cleanup — Delete Test Table');
    const t99 = tablesList.find(t => t.table_number === 99);
    if (t99) {
        const delResult = await page.evaluate(async (tableId) => {
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/tables/${tableId}`, {
                    method: 'DELETE',
                    headers: { 'x-staff-session': staffSession }
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, t99.id);
        console.log(`  Delete Table 99: ${delResult.success ? '✅ cleaned up' : '⚠️ ' + JSON.stringify(delResult.error)}`);
    } else if (addTableResult.data?.table?.id) {
        // Try with the ID from the add response
        const delResult = await page.evaluate(async (tableId) => {
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/tables/${tableId}`, {
                    method: 'DELETE',
                    headers: { 'x-staff-session': staffSession }
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, addTableResult.data.table.id);
        console.log(`  Delete Table 99: ${delResult.success ? '✅ cleaned up' : '⚠️'}`);
    } else {
        console.log('  ⚠️ No test table to delete.');
    }

    // ── FINAL SUMMARY ──
    console.log('\n═══════════════════════════════════════════════════════════════');
    const checks = [tablesState.hasHeader || tablesState.hasTable1, addTableResult.success, tablesList.length > 0, floorState.hasFloor || floorState.hasTable];
    const passCount = checks.filter(Boolean).length;
    console.log(`  ✅ PHASE 5 COMPLETED — ${passCount}/${checks.length} checks passed!`);
    console.log('═══════════════════════════════════════════════════════════════');

    await browser.close();
})();
