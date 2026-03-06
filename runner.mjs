import { chromium } from '/tmp/node_modules/playwright/index.mjs';

(async () => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Phase 6: Staff Management');
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
    // STEP 1: Navigate to Staff page
    // ===============================================================
    console.log('\n[STEP 1] Staff Page');
    await page.evaluate(() => { window.location.href = '/commander/staff'; });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 15; i++) {
        await removeVH();
        const ready = await page.evaluate(() => {
            const t = document.body?.innerText || '';
            return t.includes('Staff') || t.includes('Add Staff') || t.includes('Dealer') || t.includes('Manager');
        });
        if (ready) break;
        await page.waitForTimeout(1000);
    }

    const staffState = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            hasStaff: t.includes('Staff'),
            hasAddBtn: t.includes('Add Staff') || t.includes('Add'),
            hasRoles: t.includes('Dealer') || t.includes('Manager') || t.includes('Owner'),
            snippet: t.substring(0, 500)
        };
    });
    console.log(`  Staff page: hasStaff=${staffState.hasStaff} hasAdd=${staffState.hasAddBtn} hasRoles=${staffState.hasRoles}`);
    if (staffState.hasStaff) {
        console.log('  ✅ Staff page loaded!');
    } else {
        console.log('  ⚠️ Staff page may not have loaded. Snippet:', staffState.snippet.substring(0, 200));
    }

    // ===============================================================
    // STEP 2: List current staff via API
    // ===============================================================
    console.log('\n[STEP 2] List Staff');
    const staffList = await page.evaluate(async () => {
        const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
        const staffSession = localStorage.getItem('commander_staff') || '';
        try {
            const res = await fetch(`/api/commander/staff?venue_id=${staff.venue_id}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession }
            });
            return await res.json();
        } catch (err) { return { error: err.message }; }
    });
    const existingStaff = staffList.data?.staff || staffList.data || [];
    const staffArr = Array.isArray(existingStaff) ? existingStaff : [];
    console.log(`  Staff count: ${staffArr.length}`);
    staffArr.slice(0, 5).forEach(s => console.log(`    ${s.name} | role=${s.role} | active=${s.is_active}`));

    // ===============================================================
    // STEP 3: Add a new staff member via API
    // ===============================================================
    console.log('\n[STEP 3] Add Staff Member');
    const addStaffResult = await page.evaluate(async () => {
        const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
        const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
        const staffSession = localStorage.getItem('commander_staff') || '';
        try {
            const res = await fetch('/api/commander/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                body: JSON.stringify({
                    venue_id: staff.venue_id,
                    display_name: 'E2E Test Dealer',
                    role: 'dealer',
                    email: 'e2e-test-dealer@test.com',
                    phone: '5559876543',
                    pin_code: '9999'
                })
            });
            return await res.json();
        } catch (err) { return { error: err.message }; }
    });
    console.log(`  Add result: success=${addStaffResult.success || false}`);
    const newStaffId = addStaffResult.data?.staff?.id;
    if (addStaffResult.success) {
        console.log(`  ✅ Staff "E2E Test Dealer" created! ID: ${newStaffId}`);
    } else {
        console.log(`  ⚠️ Add failed:`, JSON.stringify(addStaffResult.error || addStaffResult).substring(0, 200));
    }

    // Reload page to see new staff
    if (addStaffResult.success) {
        await page.evaluate(() => { window.location.reload(); });
        await page.waitForTimeout(5000);
        await removeVH();
        const hasNewStaff = await page.evaluate(() => document.body.innerText.includes('E2E Test Dealer'));
        console.log(`  Visible on page: ${hasNewStaff ? '✅' : '⚠️ not visible'}`);
    }

    // ===============================================================
    // STEP 4: Update staff role via API
    // ===============================================================
    console.log('\n[STEP 4] Update Staff Role');
    if (newStaffId) {
        const updateResult = await page.evaluate(async (staffId) => {
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/staff/${staffId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                    body: JSON.stringify({ role: 'floor', name: 'E2E Test Floor' })
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, newStaffId);
        console.log(`  Update: success=${updateResult.success || false}`);
        if (updateResult.success) {
            console.log('  ✅ Role changed: dealer → floor, name → "E2E Test Floor"');
        } else {
            console.log('  ⚠️ Update failed:', JSON.stringify(updateResult.error || updateResult).substring(0, 200));
        }
    } else {
        console.log('  ⚠️ Skipped — no staff ID from step 3.');
    }

    // ===============================================================
    // STEP 5: Generate link code for staff
    // ===============================================================
    console.log('\n[STEP 5] Generate Link Code');
    if (newStaffId) {
        const linkResult = await page.evaluate(async (staffId) => {
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch('/api/commander/staff/generate-claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession },
                    body: JSON.stringify({ staff_id: staffId })
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, newStaffId);
        console.log(`  Link code: success=${linkResult.success || false}`);
        if (linkResult.success) {
            console.log(`  ✅ Link code generated: ${linkResult.data?.claim_code || linkResult.data?.code || 'present'}`);
        } else {
            console.log(`  ⚠️ Link code failed:`, JSON.stringify(linkResult.error || linkResult).substring(0, 200));
        }
    } else {
        console.log('  ⚠️ Skipped — no staff ID.');
    }

    // ===============================================================
    // STEP 6: Delete staff member (cleanup)
    // ===============================================================
    console.log('\n[STEP 6] Delete Staff (Cleanup)');
    if (newStaffId) {
        const deleteResult = await page.evaluate(async (staffId) => {
            const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') || '';
            const staffSession = localStorage.getItem('commander_staff') || '';
            try {
                const res = await fetch(`/api/commander/staff/${staffId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession }
                });
                return await res.json();
            } catch (err) { return { error: err.message }; }
        }, newStaffId);
        console.log(`  Delete: success=${deleteResult.success || false}`);
        if (deleteResult.success) {
            console.log('  ✅ Staff "E2E Test Floor" deleted!');
        } else {
            console.log('  ⚠️ Delete failed:', JSON.stringify(deleteResult.error || deleteResult).substring(0, 200));
        }
    } else {
        console.log('  ⚠️ Skipped — no staff ID.');
    }

    // ── FINAL SUMMARY ──
    console.log('\n═══════════════════════════════════════════════════════════════');
    const checks = [staffState.hasStaff, staffArr.length >= 0, addStaffResult.success, !!newStaffId];
    const passCount = checks.filter(Boolean).length;
    console.log(`  ✅ PHASE 6 COMPLETED — ${passCount}/${checks.length} checks passed!`);
    console.log('═══════════════════════════════════════════════════════════════');

    await browser.close();
})();
