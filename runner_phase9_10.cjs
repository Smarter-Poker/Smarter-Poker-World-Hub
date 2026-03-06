/**
 * Phase 9 & 10 — Reports/Analytics & Kiosk — Comprehensive E2E Test
 * Tests: Report sub-pages, report APIs, analytics APIs, kiosk page, kiosk APIs
 */
const { createClient } = require('@supabase/supabase-js');
const BASE = 'http://localhost:3000';

async function run() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 9 — REPORTS & ANALYTICS E2E');
    console.log('  PHASE 10 — KIOSK MODE E2E');
    console.log('═══════════════════════════════════════════\n');

    const s = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo');

    const { data: auth, error: authErr } = await s.auth.signInWithPassword({
        email: 'johndonnahue4485@yahoo.com', password: 'SmarterPoker2026!'
    });
    if (authErr) { console.error('❌ Login failed:', authErr.message); return; }
    console.log('✅ 1. Logged in');

    const token = auth.session.access_token;
    const venueId = 2006;
    const staffSession = JSON.stringify({ user_id: auth.user.id, email: auth.user.email, role: 'owner', venue_id: venueId, permissions: { manage_settings: true, manage_staff: true, view_reports: true } });
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession };

    // ═══════════════════════════════════
    //  PHASE 9: REPORTS & ANALYTICS
    // ═══════════════════════════════════

    console.log('\n─── PHASE 9: REPORTS & ANALYTICS ───\n');

    // 2. Reports main page
    console.log('📊 2. Reports pages...');
    const reportPages = [
        'reports',
        'reports/analytics-daily',
        'reports/daily-summary',
        'reports/player-activity',
        'reports/revenue',
        'reports/staff-activity',
        'reports/table-utilization',
        'reports/tax-compliance',
        'reports/tournament-results',
        'reports/waitlist-metrics'
    ];
    for (const page of reportPages) {
        try {
            const r = await fetch(`${BASE}/commander/${page}`, { redirect: 'follow' });
            const emoji = r.status === 200 ? '✅' : (r.status === 500 ? '⚠️' : `❌(${r.status})`);
            console.log(`   /commander/${page}: ${r.status} ${emoji}`);
        } catch (e) {
            console.log(`   /commander/${page}: ❌ ${e.message}`);
        }
    }

    // 3. Analytics page
    console.log('\n📈 3. Analytics page...');
    const analyticsRes = await fetch(`${BASE}/commander/analytics`);
    console.log(`   /commander/analytics: ${analyticsRes.status} ${analyticsRes.status === 200 ? '✅' : '⚠️'}`);

    // 4. Report APIs
    console.log('\n📋 4. Report APIs...');
    const reportApis = [
        { path: 'reports/daily', params: `venue_id=${venueId}` },
        { path: 'reports/summary', params: `venue_id=${venueId}` },
        { path: 'reports/revenue', params: `venue_id=${venueId}` },
        { path: 'reports/table-utilization', params: `venue_id=${venueId}` },
        { path: 'reports/waitlist-metrics', params: `venue_id=${venueId}` },
        { path: 'reports/export', params: `venue_id=${venueId}&format=json` },
    ];
    for (const api of reportApis) {
        try {
            const r = await fetch(`${BASE}/api/commander/${api.path}?${api.params}`, { headers });
            const data = await r.json();
            const keys = data.data ? Object.keys(data.data) : (data.success !== undefined ? ['success'] : Object.keys(data));
            console.log(`   GET /${api.path}: ${r.status} ${r.ok ? '✅' : '❌'} [${keys.join(', ')}]`);
        } catch (e) {
            console.log(`   GET /${api.path}: ❌ ${e.message}`);
        }
    }

    // 5. Analytics APIs
    console.log('\n📉 5. Analytics APIs...');
    const analyticsApis = [
        { path: 'analytics/daily', params: `venue_id=${venueId}` },
        { path: 'analytics/players', params: `venue_id=${venueId}` },
    ];
    for (const api of analyticsApis) {
        try {
            const r = await fetch(`${BASE}/api/commander/${api.path}?${api.params}`, { headers });
            const data = await r.json();
            const keys = data.data ? Object.keys(data.data) : Object.keys(data);
            console.log(`   GET /${api.path}: ${r.status} ${r.ok ? '✅' : '❌'} [${keys.join(', ')}]`);
        } catch (e) {
            console.log(`   GET /${api.path}: ❌ ${e.message}`);
        }
    }

    // 6. DB — check if report-related tables exist
    console.log('\n🗃️ 6. DB tables check...');
    const reportTables = [
        'commander_daily_reports',
        'commander_revenue_reports',
        'commander_player_activity',
        'commander_table_sessions',
    ];
    for (const table of reportTables) {
        try {
            const { count, error } = await s.from(table).select('*', { count: 'exact', head: true });
            if (error) {
                console.log(`   ${table}: ⚠️ ${error.message.substring(0, 80)}`);
            } else {
                console.log(`   ${table}: ✅ (${count} rows)`);
            }
        } catch (e) {
            console.log(`   ${table}: ❌ ${e.message}`);
        }
    }

    // ═══════════════════════════════════
    //  PHASE 10: KIOSK MODE
    // ═══════════════════════════════════

    console.log('\n\n─── PHASE 10: KIOSK MODE ───\n');

    // 7. Kiosk page renders
    console.log('🖥️ 7. Kiosk page renders...');
    const kioskRes = await fetch(`${BASE}/commander/kiosk`);
    const kioskHtml = await kioskRes.text();
    console.log(`   HTTP ${kioskRes.status} (${kioskHtml.length} bytes) ${kioskRes.status === 200 ? '✅' : '⚠️'}`);

    // 8. Kiosk-related APIs (games for venue, waitlist lookup)
    console.log('\n📋 8. Kiosk-related APIs...');
    // Games endpoint
    const gamesRes = await fetch(`${BASE}/api/commander/games?venue_id=${venueId}`, { headers });
    const gamesData = await gamesRes.json();
    console.log(`   GET /api/commander/games: ${gamesRes.status} ${gamesRes.ok ? '✅' : '❌'}`);
    if (gamesRes.ok) {
        const games = Array.isArray(gamesData.data) ? gamesData.data : (gamesData.data?.games || []);
        console.log(`   Games: ${games.length}`);
        games.slice(0, 3).forEach(g => console.log(`     • ${g.game_name || g.name || g.id}`));
    }

    // Waitlist endpoint
    const waitlistRes = await fetch(`${BASE}/api/commander/waitlist?venue_id=${venueId}`, { headers });
    const waitlistData = await waitlistRes.json();
    console.log(`   GET /api/commander/waitlist: ${waitlistRes.status} ${waitlistRes.ok ? '✅' : '❌'}`);

    // Members endpoint (for check-in lookup)
    const membersRes = await fetch(`${BASE}/api/commander/members?venue_id=${venueId}&limit=5`, { headers });
    const membersData = await membersRes.json();
    console.log(`   GET /api/commander/members: ${membersRes.status} ${membersRes.ok ? '✅' : '❌'}`);
    if (membersRes.ok) {
        const members = Array.isArray(membersData.data) ? membersData.data : (membersData.data?.members || []);
        console.log(`   Members: ${members.length}`);
    }

    // 9. Other Commander sub-pages (exports, close-day, etc.)
    console.log('\n🔗 9. Remaining sub-page verification...');
    const otherPages = [
        'exports', 'close-day', 'downloads', 'install',
        'floor-calls', 'notifications', 'lobby', 'schedule',
        'shift-handoff', 'incidents', 'high-hands', 'comps'
    ];
    for (const page of otherPages) {
        try {
            const r = await fetch(`${BASE}/commander/${page}`, { redirect: 'follow' });
            const emoji = r.status === 200 ? '✅' : (r.status === 500 ? '⚠️' : `❌(${r.status})`);
            console.log(`   /commander/${page}: ${r.status} ${emoji}`);
        } catch (e) {
            console.log(`   /commander/${page}: ❌ ${e.message}`);
        }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 9 & 10 E2E TEST COMPLETE');
    console.log('═══════════════════════════════════════════\n');

    await s.auth.signOut();
}

run().catch(e => { console.error('FATAL:', e.message); });
