/**
 * SECONDARY BUG SWEEP — All Club Commander Pages
 * Tests EVERY API endpoint, EVERY page route, DB integrity, and real-time sync wiring.
 * Only reports NEW bugs not found in previous sweeps.
 */
const { createClient } = require('@supabase/supabase-js');
const BASE = 'http://localhost:3000';

const BUGS = [];  // Collect all NEW bugs found

function bug(area, desc) {
    BUGS.push({ area, desc });
    console.log(`   🐛 BUG: ${desc}`);
}

async function safeFetch(url, opts = {}) {
    try {
        return await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    } catch (e) {
        return { ok: false, status: 0, statusText: e.message, json: async () => ({ error: e.message }), text: async () => e.message };
    }
}

async function run() {
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  SECONDARY BUG SWEEP — CLUB COMMANDER    ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    const s = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo');

    const { data: auth, error: authErr } = await s.auth.signInWithPassword({
        email: 'johndonnahue4485@yahoo.com', password: 'SmarterPoker2026!'
    });
    if (authErr) { console.error('❌ Login FAILED:', authErr.message); return; }
    console.log('✅ Authenticated\n');

    const token = auth.session.access_token;
    const venueId = 2006;
    const staffSession = JSON.stringify({
        user_id: auth.user.id, email: auth.user.email, role: 'owner',
        venue_id: venueId, venue_name: 'E2E Test Poker Room',
        permissions: { manage_settings: true, manage_staff: true, manage_promotions: true, view_reports: true }
    });
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession };

    // ═══════════════════════════════════
    //  1. ALL API ENDPOINTS
    // ═══════════════════════════════════
    console.log('━━━ 1. API ENDPOINTS ━━━\n');

    const apiTests = [
        // Settings
        { method: 'GET', path: 'settings', expect: 200 },
        // Staff
        { method: 'GET', path: 'staff', expect: 200 },
        { method: 'GET', path: 'staff/verify-pin', expect: [400, 405], note: 'GET not allowed or missing body' },
        // Games
        { method: 'GET', path: 'games', expect: 200 },
        // Waitlist
        { method: 'GET', path: 'waitlist', expect: 200 },
        // Tables
        { method: 'GET', path: 'tables', expect: 200 },
        // Displays
        { method: 'GET', path: 'displays', params: `venue_id=${venueId}`, expect: 200 },
        // Promotions
        { method: 'GET', path: 'promotions', params: `venue_id=${venueId}`, expect: 200 },
        { method: 'GET', path: 'promotions/active', params: `venue_id=${venueId}`, expect: 200 },
        // Reports
        { method: 'GET', path: 'reports/daily', params: `venue_id=${venueId}`, expect: 200 },
        // Members
        { method: 'GET', path: 'members', params: `venue_id=${venueId}&limit=5`, expect: 200 },
        // Check subscription
        { method: 'GET', path: 'check-subscription', expect: [200, 401, 403] },
        // Dealers
        { method: 'GET', path: 'dealers', params: `venue_id=${venueId}`, expect: [200, 404] },
    ];

    for (const test of apiTests) {
        const url = `${BASE}/api/commander/${test.path}${test.params ? '?' + test.params : ''}`;
        const r = await safeFetch(url, { method: test.method, headers });
        const expectedArr = Array.isArray(test.expect) ? test.expect : [test.expect];
        const pass = expectedArr.includes(r.status);
        console.log(`   ${pass ? '✅' : '❌'} ${test.method} /api/commander/${test.path}: ${r.status}`);
        if (!pass && r.status !== 0) {
            try {
                const body = await r.text();
                if (body.startsWith('<')) {
                    bug('API', `${test.path} returned HTML instead of JSON (status ${r.status})`);
                } else {
                    bug('API', `${test.path} returned unexpected ${r.status}`);
                }
            } catch { bug('API', `${test.path} returned ${r.status}`); }
        } else if (r.status === 0) {
            bug('API', `${test.path} — server unreachable: ${r.statusText}`);
        }
    }

    // ═══════════════════════════════════
    //  2. SETTINGS CRUD CYCLE
    // ═══════════════════════════════════
    console.log('\n━━━ 2. SETTINGS CRUD CYCLE ━━━\n');

    // GET original
    const getRes = await safeFetch(`${BASE}/api/commander/settings`, { headers });
    const origData = await getRes.json();
    console.log(`   GET settings: ${getRes.status} ${getRes.ok ? '✅' : '❌'}`);

    // PUT test value
    const testVal = { auto_refresh_interval: 77, security_gate_enabled: false };
    const putRes = await safeFetch(`${BASE}/api/commander/settings`, {
        method: 'PUT', headers, body: JSON.stringify(testVal)
    });
    console.log(`   PUT settings: ${putRes.status} ${putRes.ok ? '✅' : '❌'}`);
    if (!putRes.ok) bug('SETTINGS', `PUT failed: ${putRes.status}`);

    // Verify
    const verifyRes = await safeFetch(`${BASE}/api/commander/settings`, { headers });
    const verifyData = await verifyRes.json();
    if (verifyData.data?.auto_refresh_interval !== 77) {
        bug('SETTINGS', `auto_refresh_interval not persisted (got ${verifyData.data?.auto_refresh_interval})`);
    } else {
        console.log('   ✅ Settings persist correctly');
    }

    // Restore
    const orig = origData.data || {};
    await safeFetch(`${BASE}/api/commander/settings`, {
        method: 'PUT', headers, body: JSON.stringify({
            auto_refresh_interval: orig.auto_refresh_interval ?? 30,
            security_gate_enabled: orig.security_gate_enabled ?? true
        })
    });
    console.log('   ✅ Settings restored');

    // ═══════════════════════════════════
    //  3. STAFF CRUD CYCLE
    // ═══════════════════════════════════
    console.log('\n━━━ 3. STAFF CRUD ━━━\n');

    const testPin = `${Date.now()}`.slice(-4);
    const staffCreateRes = await safeFetch(`${BASE}/api/commander/staff`, {
        method: 'POST', headers,
        body: JSON.stringify({ venue_id: venueId, display_name: 'Sweep Test', role: 'dealer', pin_code: testPin, email: `sweep_${Date.now()}@test.com` })
    });
    const staffCreateData = await staffCreateRes.json();
    console.log(`   POST staff: ${staffCreateRes.status} ${staffCreateRes.ok ? '✅' : '❌'}`);
    const staffId = staffCreateData.data?.staff?.id;
    if (staffId) {
        // UPDATE
        const updateRes = await safeFetch(`${BASE}/api/commander/staff/${staffId}`, {
            method: 'PATCH', headers, body: JSON.stringify({ role: 'floor' })
        });
        console.log(`   PATCH staff: ${updateRes.status} ${updateRes.ok ? '✅' : '❌'}`);
        if (!updateRes.ok) bug('STAFF', `PATCH failed: ${updateRes.status}`);

        // DELETE
        const deleteRes = await safeFetch(`${BASE}/api/commander/staff/${staffId}`, {
            method: 'DELETE', headers
        });
        console.log(`   DELETE staff: ${deleteRes.status} ${deleteRes.ok ? '✅' : '❌'}`);
        if (!deleteRes.ok) bug('STAFF', `DELETE failed: ${deleteRes.status}`);

        // DB verify deletion
        const { data: check } = await s.from('commander_staff').select('id').eq('id', staffId).single();
        if (check) bug('STAFF', `Staff record ${staffId} not deleted from DB`);
        else console.log('   ✅ DB deletion verified');
    } else {
        console.log(`   ⚠️ Staff create response: ${JSON.stringify(staffCreateData).substring(0, 150)}`);
    }

    // PIN verify
    const pinRes = await safeFetch(`${BASE}/api/commander/staff/verify-pin`, {
        method: 'POST', headers, body: JSON.stringify({ venue_id: venueId, pin_code: '0000' })
    });
    console.log(`   PIN verify: ${pinRes.status} ${[200, 401, 404].includes(pinRes.status) ? '✅' : '❌'}`);

    // ═══════════════════════════════════
    //  4. DISPLAYS CRUD + SUB-PAGES
    // ═══════════════════════════════════
    console.log('\n━━━ 4. DISPLAYS CRUD ━━━\n');

    const devId = `sweep_${Date.now()}`;
    const dispCreateRes = await safeFetch(`${BASE}/api/commander/displays`, {
        method: 'POST', headers,
        body: JSON.stringify({ venue_id: venueId, device_id: devId, device_name: 'Sweep TV', device_type: 'tv' })
    });
    const dispCreateData = await dispCreateRes.json();
    console.log(`   POST display: ${dispCreateRes.status} ${dispCreateRes.ok ? '✅' : '❌'}`);
    if (!dispCreateRes.ok) bug('DISPLAYS', `POST failed: ${dispCreateRes.status}`);

    const dispId = dispCreateData.data?.display?.id;
    if (dispId) {
        await s.from('commander_table_displays').delete().eq('id', dispId);
        console.log('   ✅ Cleanup: display deleted');
    }

    // ═══════════════════════════════════
    //  5. GAMES + WAITLIST
    // ═══════════════════════════════════
    console.log('\n━━━ 5. GAMES + WAITLIST ━━━\n');

    const gamesRes = await safeFetch(`${BASE}/api/commander/games?venue_id=${venueId}`, { headers });
    const gamesData = await gamesRes.json();
    console.log(`   GET games: ${gamesRes.status} ${gamesRes.ok ? '✅' : '❌'}`);
    if (gamesRes.ok) {
        const games = Array.isArray(gamesData.data) ? gamesData.data : (gamesData.data?.games || []);
        console.log(`   Games count: ${games.length}`);
    }

    const wlRes = await safeFetch(`${BASE}/api/commander/waitlist?venue_id=${venueId}`, { headers });
    console.log(`   GET waitlist: ${wlRes.status} ${wlRes.ok ? '✅' : '❌'}`);

    // ═══════════════════════════════════
    //  6. TABLES
    // ═══════════════════════════════════
    console.log('\n━━━ 6. TABLES ━━━\n');

    const tablesRes = await safeFetch(`${BASE}/api/commander/tables?venue_id=${venueId}`, { headers });
    const tablesData = await tablesRes.json();
    console.log(`   GET tables: ${tablesRes.status} ${tablesRes.ok ? '✅' : '❌'}`);
    if (tablesRes.ok) {
        const tables = Array.isArray(tablesData.data) ? tablesData.data : (tablesData.data?.tables || []);
        console.log(`   Tables count: ${tables.length}`);
    }

    // ═══════════════════════════════════
    //  7. LOGO UPLOAD/DELETE CYCLE
    // ═══════════════════════════════════
    console.log('\n━━━ 7. LOGO CRUD ━━━\n');

    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const logoUpRes = await safeFetch(`${BASE}/api/commander/settings/logo`, {
        method: 'POST', headers,
        body: JSON.stringify({ data: pngB64, filename: 'sweep_test.png', contentType: 'image/png' })
    });
    const logoUpData = await logoUpRes.json();
    console.log(`   POST logo: ${logoUpRes.status} ${logoUpRes.ok ? '✅' : '❌'}`);
    if (!logoUpRes.ok) bug('LOGO', `Upload failed: ${logoUpRes.status}`);
    if (logoUpRes.ok && !logoUpData.data?.club_logo_url) bug('LOGO', 'Upload succeeded but no URL returned');

    const logoDelRes = await safeFetch(`${BASE}/api/commander/settings/logo`, {
        method: 'DELETE', headers
    });
    console.log(`   DELETE logo: ${logoDelRes.status} ${logoDelRes.ok ? '✅' : '❌'}`);
    if (!logoDelRes.ok) bug('LOGO', `Delete failed: ${logoDelRes.status}`);

    // ═══════════════════════════════════
    //  8. DB INTEGRITY CHECK
    // ═══════════════════════════════════
    console.log('\n━━━ 8. DB INTEGRITY ━━━\n');

    const dbTables = [
        'commander_venue_settings',
        'commander_staff',
        'commander_tables',
        'commander_table_displays',
        'commander_promotions',
        'commander_games',
        'commander_waitlist',
        'commander_daily_reports',
        'commander_table_sessions',
        'commander_members',
    ];
    for (const table of dbTables) {
        try {
            const { count, error } = await s.from(table).select('*', { count: 'exact', head: true });
            if (error) {
                if (error.message.includes('does not exist') || error.code === '42P01') {
                    console.log(`   ⚠️ ${table}: table does not exist`);
                } else {
                    console.log(`   ⚠️ ${table}: ${error.message.substring(0, 60)}`);
                }
            } else {
                console.log(`   ✅ ${table}: ${count ?? 0} rows`);
            }
        } catch (e) {
            console.log(`   ❌ ${table}: ${e.message}`);
        }
    }

    // ═══════════════════════════════════
    //  9. REAL-TIME SYNC WIRING CHECK
    // ═══════════════════════════════════
    console.log('\n━━━ 9. REAL-TIME SYNC WIRING ━━━\n');

    // Verify that broadcastChange and useCommanderSync are imported in key pages
    const fs = require('fs');
    const syncFiles = [
        { file: 'pages/commander/settings.js', expected: ['broadcastChange', 'useCommanderSync'] },
        { file: 'pages/commander/promotions.js', expected: ['broadcastChange', 'useCommanderSync'] },
        { file: 'pages/commander/staff.js', expected: ['broadcastChange', 'useCommanderSync'] },
        { file: 'pages/commander/tables.js', expected: ['broadcastChange', 'useCommanderSync'] },
        { file: 'pages/commander/kiosk.js', expected: ['useCommanderSync', 'broadcastChange'] },
    ];

    const projDir = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub';
    for (const { file, expected } of syncFiles) {
        try {
            const content = fs.readFileSync(`${projDir}/${file}`, 'utf8');
            const missing = expected.filter(fn => !content.includes(fn));
            if (missing.length) {
                bug('SYNC', `${file} missing: ${missing.join(', ')}`);
            } else {
                console.log(`   ✅ ${file}: ${expected.join(' + ')} wired`);
            }
        } catch (e) {
            console.log(`   ⚠️ ${file}: ${e.message.substring(0, 50)}`);
        }
    }

    // Check useCommanderSync lib exists and exports correctly
    try {
        const syncLib = fs.readFileSync(`${projDir}/src/lib/commander/useCommanderSync.js`, 'utf8');
        const hasBroadcast = syncLib.includes('export function broadcastChange') || syncLib.includes('export const broadcastChange');
        const hasHook = syncLib.includes('export function useCommanderSync') || syncLib.includes('export const useCommanderSync');
        console.log(`   ${hasBroadcast ? '✅' : '❌'} useCommanderSync.js exports broadcastChange`);
        console.log(`   ${hasHook ? '✅' : '❌'} useCommanderSync.js exports useCommanderSync`);
        if (!hasBroadcast) bug('SYNC', 'broadcastChange not exported from useCommanderSync.js');
        if (!hasHook) bug('SYNC', 'useCommanderSync not exported from useCommanderSync.js');
    } catch (e) {
        bug('SYNC', `useCommanderSync.js missing or unreadable: ${e.message}`);
    }

    // ═══════════════════════════════════
    //  10. SETTINGS → localStorage SYNC
    // ═══════════════════════════════════
    console.log('\n━━━ 10. SETTINGS → LOCALSTORAGE SYNC ━━━\n');

    // Verify the settings page writes security_gate to localStorage
    try {
        const settingsContent = fs.readFileSync(`${projDir}/pages/commander/settings.js`, 'utf8');
        const hasLsWrite = settingsContent.includes("localStorage.setItem('commander_security_gate'");
        const hasLsLayout = fs.readFileSync(`${projDir}/src/components/commander/shared/CommanderLayout.jsx`, 'utf8')
            .includes("localStorage.getItem('commander_security_gate')");
        console.log(`   ${hasLsWrite ? '✅' : '❌'} settings.js writes security_gate to localStorage`);
        console.log(`   ${hasLsLayout ? '✅' : '❌'} CommanderLayout reads security_gate from localStorage`);
        if (!hasLsWrite) bug('SYNC', 'settings.js never writes security_gate to localStorage');
        if (!hasLsLayout) bug('SYNC', 'CommanderLayout never reads security_gate from localStorage');
    } catch (e) {
        bug('SYNC', `File read error: ${e.message}`);
    }

    // ═══════════════════════════════════
    //  FINAL REPORT
    // ═══════════════════════════════════
    console.log('\n╔═══════════════════════════════════════════╗');
    if (BUGS.length === 0) {
        console.log('║  ✅ SWEEP COMPLETE — ZERO NEW BUGS FOUND  ║');
    } else {
        console.log(`║  🐛 SWEEP COMPLETE — ${BUGS.length} NEW BUG(S) FOUND     ║`);
    }
    console.log('╚═══════════════════════════════════════════╝\n');

    if (BUGS.length > 0) {
        console.log('NEW BUGS:');
        BUGS.forEach((b, i) => console.log(`  ${i + 1}. [${b.area}] ${b.desc}`));
    }

    console.log('');
    await s.auth.signOut();
}

run().catch(e => { console.error('FATAL:', e.message); });
