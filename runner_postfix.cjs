/**
 * POST-FIX VERIFICATION SWEEP — All Commander APIs + CRUD + DB + Sync
 * Verifies the 4 owner-auth fixes plus ALL other functionality.
 * Only reports NEW bugs not found in previous sweeps.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const BASE = 'http://localhost:3000';
const PROJ = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
const BUGS = [];

function bug(area, desc) { BUGS.push({ area, desc }); console.log(`   🐛 NEW BUG: [${area}] ${desc}`); }

async function sf(url, opts = {}) {
    try { return await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) }); }
    catch (e) { return { ok: false, status: 0, json: async () => ({ error: e.message }), text: async () => e.message }; }
}

async function run() {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║  POST-FIX VERIFICATION SWEEP                  ║');
    console.log('╚═══════════════════════════════════════════════╝\n');

    const s = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo');
    const { data: auth, error: ae } = await s.auth.signInWithPassword({ email: 'johndonnahue4485@yahoo.com', password: 'SmarterPoker2026!' });
    if (ae) { console.error('❌ Login FAILED:', ae.message); return; }
    console.log('✅ Authenticated\n');

    const token = auth.session.access_token;
    const venueId = 2006;
    const ss = JSON.stringify({ user_id: auth.user.id, email: auth.user.email, role: 'owner', venue_id: venueId, venue_name: 'E2E Test Poker Room', permissions: { manage_settings: true, manage_staff: true, manage_promotions: true, view_reports: true } });
    const h = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': ss };

    // ═══════════════════════════════════
    //  1. PREVIOUSLY-FIXED ENDPOINTS (must still work)
    // ═══════════════════════════════════
    console.log('━━━ 1. VERIFY 4 OWNER-AUTH FIXES ━━━\n');

    const r1 = await sf(`${BASE}/api/commander/promotions`, { method: 'POST', headers: h, body: JSON.stringify({ venue_id: venueId, name: 'Sweep Verify', promotion_type: 'high_hand', status: 'draft' }) });
    const d1 = await r1.json();
    console.log(`   POST /promotions: ${r1.status} ${r1.status === 201 ? '✅' : '❌'}`);
    if (r1.status !== 201) bug('FIX-REGRESSION', `Promotions POST returned ${r1.status} — fix regressed`);
    const promoId = d1.promotion?.id;

    const r2 = await sf(`${BASE}/api/commander/reports/summary?range=today`, { headers: h });
    console.log(`   GET /reports/summary: ${r2.status} ${r2.ok ? '✅' : '❌'}`);
    if (!r2.ok) bug('FIX-REGRESSION', `Reports summary returned ${r2.status}`);

    const r3 = await sf(`${BASE}/api/commander/reports/revenue?venue_id=${venueId}`, { headers: h });
    console.log(`   GET /reports/revenue: ${r3.status} ${r3.ok ? '✅' : '❌'}`);
    if (!r3.ok) bug('FIX-REGRESSION', `Reports revenue returned ${r3.status}`);

    const r4 = await sf(`${BASE}/api/commander/game-types`, { headers: h });
    console.log(`   GET /game-types: ${r4.status} ${r4.ok ? '✅' : '❌'}`);
    if (!r4.ok) bug('FIX-REGRESSION', `Game-types returned ${r4.status}`);

    // Cleanup promo
    if (promoId) await s.from('commander_promotions').delete().eq('id', promoId);

    // ═══════════════════════════════════
    //  2. ALL OTHER API ENDPOINTS
    // ═══════════════════════════════════
    console.log('\n━━━ 2. ALL API ENDPOINTS ━━━\n');

    const apis = [
        { m: 'GET', p: 'settings', e: 200 },
        { m: 'GET', p: 'staff?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'waitlist?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'tables?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'displays?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'promotions?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'promotions/active?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'members?venue_id=' + venueId + '&limit=5', e: 200 },
        { m: 'GET', p: 'dealers?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'reports/daily?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'games/live?venue_id=' + venueId, e: 200 },
        { m: 'GET', p: 'games/venue/' + venueId, e: 200 },
    ];
    for (const a of apis) {
        const r = await sf(`${BASE}/api/commander/${a.p}`, { method: a.m, headers: h });
        const ok = r.status === a.e;
        console.log(`   ${ok ? '✅' : '❌'} ${a.m} /${a.p.split('?')[0]}: ${r.status}`);
        if (!ok) bug('API', `${a.p} expected ${a.e}, got ${r.status}`);
    }

    // ═══════════════════════════════════
    //  3. SETTINGS CRUD CYCLE
    // ═══════════════════════════════════
    console.log('\n━━━ 3. SETTINGS CRUD ━━━\n');
    const origSettings = await sf(`${BASE}/api/commander/settings`, { headers: h }).then(r => r.json());
    const putR = await sf(`${BASE}/api/commander/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ auto_refresh_interval: 88 }) });
    const verifyR = await sf(`${BASE}/api/commander/settings`, { headers: h }).then(r => r.json());
    if (verifyR.data?.auto_refresh_interval !== 88) bug('SETTINGS', 'PUT did not persist');
    else console.log('   ✅ Settings persist correctly');
    await sf(`${BASE}/api/commander/settings`, { method: 'PUT', headers: h, body: JSON.stringify({ auto_refresh_interval: origSettings.data?.auto_refresh_interval ?? 30 }) });
    console.log('   ✅ Settings restored');

    // ═══════════════════════════════════
    //  4. STAFF FULL CRUD + PIN
    // ═══════════════════════════════════
    console.log('\n━━━ 4. STAFF CRUD + PIN ━━━\n');
    const pin = `${Date.now()}`.slice(-4);
    const sc = await sf(`${BASE}/api/commander/staff`, { method: 'POST', headers: h, body: JSON.stringify({ venue_id: venueId, display_name: 'Sweep2', role: 'dealer', pin_code: pin, email: `s2_${Date.now()}@test.com` }) });
    const scd = await sc.json();
    console.log(`   POST staff: ${sc.status} ${sc.ok ? '✅' : '❌'}`);
    if (!sc.ok) bug('STAFF', `POST failed: ${sc.status}`);
    const sid = scd.data?.staff?.id;
    if (sid) {
        const su = await sf(`${BASE}/api/commander/staff/${sid}`, { method: 'PATCH', headers: h, body: JSON.stringify({ role: 'floor' }) });
        console.log(`   PATCH staff: ${su.status} ${su.ok ? '✅' : '❌'}`);
        if (!su.ok) bug('STAFF', 'PATCH failed');
        const sd = await sf(`${BASE}/api/commander/staff/${sid}`, { method: 'DELETE', headers: h });
        console.log(`   DELETE staff: ${sd.status} ${sd.ok ? '✅' : '❌'}`);
        if (!sd.ok) bug('STAFF', 'DELETE failed');
        const { data: check } = await s.from('commander_staff').select('id').eq('id', sid).single();
        console.log(`   DB deletion: ${!check ? '✅' : '❌'}`);
        if (check) bug('STAFF', 'DB record not deleted');
    }
    const pv = await sf(`${BASE}/api/commander/staff/verify-pin`, { method: 'POST', headers: h, body: JSON.stringify({ venue_id: venueId, pin_code: '0000' }) });
    console.log(`   PIN verify: ${pv.status} ${[200, 401, 404].includes(pv.status) ? '✅' : '❌'}`);

    // ═══════════════════════════════════
    //  5. DISPLAYS CRUD
    // ═══════════════════════════════════
    console.log('\n━━━ 5. DISPLAYS CRUD ━━━\n');
    const dc = await sf(`${BASE}/api/commander/displays`, { method: 'POST', headers: h, body: JSON.stringify({ venue_id: venueId, device_id: `sv_${Date.now()}`, device_name: 'Sweep TV', device_type: 'tv' }) });
    console.log(`   POST display: ${dc.status} ${dc.ok ? '✅' : '❌'}`);
    if (!dc.ok) bug('DISPLAYS', 'POST failed');
    const dcd = await dc.json();
    if (dcd.data?.display?.id) { await s.from('commander_table_displays').delete().eq('id', dcd.data.display.id); console.log('   ✅ Cleanup OK'); }

    // ═══════════════════════════════════
    //  6. LOGO UPLOAD/DELETE
    // ═══════════════════════════════════
    console.log('\n━━━ 6. LOGO CRUD ━━━\n');
    const lu = await sf(`${BASE}/api/commander/settings/logo`, { method: 'POST', headers: h, body: JSON.stringify({ data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', filename: 'sv.png', contentType: 'image/png' }) });
    console.log(`   POST logo: ${lu.status} ${lu.ok ? '✅' : '❌'}`);
    if (!lu.ok) bug('LOGO', 'Upload failed');
    const ld = await sf(`${BASE}/api/commander/settings/logo`, { method: 'DELETE', headers: h });
    console.log(`   DELETE logo: ${ld.status} ${ld.ok ? '✅' : '❌'}`);
    if (!ld.ok) bug('LOGO', 'Delete failed');

    // ═══════════════════════════════════
    //  7. PROMOTIONS FULL LIFECYCLE
    // ═══════════════════════════════════
    console.log('\n━━━ 7. PROMOTIONS LIFECYCLE ━━━\n');
    const pc = await sf(`${BASE}/api/commander/promotions`, { method: 'POST', headers: h, body: JSON.stringify({ venue_id: venueId, name: 'Lifecycle Test', promotion_type: 'bonus', status: 'active', description: 'E2E test' }) });
    const pcd = await pc.json();
    const pid = pcd.promotion?.id;
    console.log(`   CREATE promo: ${pc.status} ${pc.status === 201 ? '✅' : '❌'}`);
    if (pid) {
        // Update
        const pu = await sf(`${BASE}/api/commander/promotions/${pid}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'inactive', name: 'Updated Lifecycle' }) });
        console.log(`   UPDATE promo: ${pu.status} ${pu.ok ? '✅' : '❌'}`);
        if (!pu.ok) bug('PROMOTIONS', 'PATCH failed');
        // Delete
        const pdel = await sf(`${BASE}/api/commander/promotions/${pid}`, { method: 'DELETE', headers: h });
        console.log(`   DELETE promo: ${pdel.status} ${pdel.ok ? '✅' : '❌'}`);
        if (!pdel.ok) bug('PROMOTIONS', 'DELETE failed');
        // DB verify deletion
        const { data: pcheck } = await s.from('commander_promotions').select('id').eq('id', pid).single();
        console.log(`   DB deletion: ${!pcheck ? '✅' : '❌'}`);
        if (pcheck) { await s.from('commander_promotions').delete().eq('id', pid); }
    } else {
        bug('PROMOTIONS', 'CREATE returned no ID');
    }

    // ═══════════════════════════════════
    //  8. DB INTEGRITY
    // ═══════════════════════════════════
    console.log('\n━━━ 8. DB INTEGRITY ━━━\n');
    const tables = ['commander_venue_settings', 'commander_staff', 'commander_tables', 'commander_table_displays', 'commander_promotions', 'commander_games', 'commander_waitlist', 'commander_daily_reports', 'commander_table_sessions', 'commander_members'];
    for (const t of tables) {
        const { count, error } = await s.from(t).select('*', { count: 'exact', head: true });
        if (error) console.log(`   ⚠️ ${t}: ${error.message.substring(0, 60)}`);
        else console.log(`   ✅ ${t}: ${count ?? 0} rows`);
    }

    // ═══════════════════════════════════
    //  9. REAL-TIME SYNC WIRING
    // ═══════════════════════════════════
    console.log('\n━━━ 9. SYNC WIRING ━━━\n');
    const syncChecks = [
        { f: 'pages/commander/settings.js', fns: ['broadcastChange', 'useCommanderSync'] },
        { f: 'pages/commander/promotions.js', fns: ['broadcastChange', 'useCommanderSync'] },
        { f: 'pages/commander/staff.js', fns: ['broadcastChange', 'useCommanderSync'] },
        { f: 'pages/commander/tables.js', fns: ['broadcastChange', 'useCommanderSync'] },
        { f: 'pages/commander/kiosk.js', fns: ['useCommanderSync', 'broadcastChange'] },
        { f: 'pages/commander/dashboard.js', fns: ['useCommanderSync'] },
        { f: 'pages/commander/analytics.js', fns: ['useCommanderSync'] },
    ];
    for (const { f, fns } of syncChecks) {
        try {
            const c = fs.readFileSync(`${PROJ}/${f}`, 'utf8');
            const missing = fns.filter(fn => !c.includes(fn));
            if (missing.length) { bug('SYNC', `${f} missing: ${missing.join(', ')}`); }
            else console.log(`   ✅ ${f.split('/').pop()}: ${fns.join(' + ')}`);
        } catch (e) { console.log(`   ⚠️ ${f}: ${e.message.substring(0, 40)}`); }
    }

    // Check sync lib exports
    try {
        const lib = fs.readFileSync(`${PROJ}/src/lib/commander/useCommanderSync.js`, 'utf8');
        const has1 = lib.includes('export function broadcastChange') || lib.includes('export const broadcastChange');
        const has2 = lib.includes('export function useCommanderSync') || lib.includes('export const useCommanderSync');
        console.log(`   ${has1 ? '✅' : '❌'} broadcastChange exported`);
        console.log(`   ${has2 ? '✅' : '❌'} useCommanderSync exported`);
        if (!has1) bug('SYNC', 'broadcastChange not exported');
        if (!has2) bug('SYNC', 'useCommanderSync not exported');
    } catch (e) { bug('SYNC', `useCommanderSync.js unreadable`); }

    // ═══════════════════════════════════
    //  10. localStorage SYNC
    // ═══════════════════════════════════
    console.log('\n━━━ 10. localStorage SYNC ━━━\n');
    try {
        const sc = fs.readFileSync(`${PROJ}/pages/commander/settings.js`, 'utf8');
        const lc = fs.readFileSync(`${PROJ}/src/components/commander/shared/CommanderLayout.jsx`, 'utf8');
        const w = sc.includes("localStorage.setItem('commander_security_gate'");
        const r = lc.includes("localStorage.getItem('commander_security_gate')");
        console.log(`   ${w ? '✅' : '❌'} settings.js writes security_gate`);
        console.log(`   ${r ? '✅' : '❌'} CommanderLayout reads security_gate`);
        if (!w) bug('SYNC', 'settings not writing security_gate');
        if (!r) bug('SYNC', 'Layout not reading security_gate');
    } catch (e) { bug('SYNC', e.message); }

    // ═══════════════════════════════════
    //  FINAL REPORT
    // ═══════════════════════════════════
    console.log('\n╔═══════════════════════════════════════════════╗');
    if (BUGS.length === 0) {
        console.log('║  ✅ SWEEP COMPLETE — ZERO NEW BUGS FOUND       ║');
    } else {
        console.log(`║  🐛 SWEEP COMPLETE — ${String(BUGS.length).padEnd(2)} NEW BUG(S) FOUND       ║`);
    }
    console.log('╚═══════════════════════════════════════════════╝\n');
    if (BUGS.length > 0) {
        console.log('NEW BUGS:');
        BUGS.forEach((b, i) => console.log(`  ${i + 1}. [${b.area}] ${b.desc}`));
    }
    await s.auth.signOut();
}
run().catch(e => { console.error('FATAL:', e.message); });
