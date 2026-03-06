/**
 * Phase 7 Settings & Configuration — Comprehensive E2E Test
 * Tests: Page render, GET settings, PUT settings (all fields), toggles, number inputs,
 *        logo upload/delete, navigation links, DB verification
 */
const { createClient } = require('@supabase/supabase-js');
const BASE = 'http://localhost:3000';

async function run() {
    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 7 — SETTINGS & CONFIGURATION E2E');
    console.log('═══════════════════════════════════════════\n');

    const s = createClient('https://kuklfnapbkmacvwxktbh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo');

    // 1. Login
    const { data: auth, error: authErr } = await s.auth.signInWithPassword({
        email: 'johndonnahue4485@yahoo.com', password: 'SmarterPoker2026!'
    });
    if (authErr) { console.error('❌ Login failed:', authErr.message); return; }
    console.log('✅ 1. Logged in');

    const token = auth.session.access_token;
    const venueId = 2006;
    const staffSession = JSON.stringify({ user_id: auth.user.id, email: auth.user.email, role: 'owner', venue_id: venueId, permissions: { manage_settings: true, manage_staff: true } });
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-staff-session': staffSession };

    // ── 2. Settings page renders ──
    console.log('\n📄 2. Settings page renders...');
    const pageRes = await fetch(`${BASE}/commander/settings`);
    const pageHtml = await pageRes.text();
    console.log(`   HTTP ${pageRes.status} (${pageHtml.length} bytes)`);
    const hasSettingsContent = pageHtml.includes('Settings') || pageHtml.includes('settings');
    console.log(`   Contains "Settings": ${hasSettingsContent} ${pageRes.status === 200 ? '✅' : '❌'}`);

    // ── 3. GET /api/commander/settings ──
    console.log('\n📋 3. GET /api/commander/settings...');
    const getRes = await fetch(`${BASE}/api/commander/settings`, { headers });
    const getData = await getRes.json();
    console.log(`   HTTP ${getRes.status} ${getRes.ok ? '✅' : '❌'}`);
    if (getData.data) {
        const d = getData.data;
        console.log('   Current settings from DB:');
        console.log(`     auto_refresh_interval: ${d.auto_refresh_interval}`);
        console.log(`     sms_notifications_enabled: ${d.sms_notifications_enabled}`);
        console.log(`     push_notifications_enabled: ${d.push_notifications_enabled}`);
        console.log(`     max_waitlist_size: ${d.max_waitlist_size}`);
        console.log(`     call_timeout_minutes: ${d.call_timeout_minutes}`);
        console.log(`     default_wait_time_per_player: ${d.default_wait_time_per_player}`);
        console.log(`     show_player_names_on_display: ${d.show_player_names_on_display}`);
        console.log(`     venue_type: ${d.venue_type}`);
        console.log(`     time_billing_rate: ${d.time_billing_rate}`);
        console.log(`     auto_comp_rate: ${d.auto_comp_rate}`);
        console.log(`     bulk_time_packages: ${JSON.stringify(d.bulk_time_packages)}`);
        console.log(`     security_gate_enabled: ${d.security_gate_enabled}`);
        console.log(`     club_logo_url: ${d.club_logo_url || 'null'}`);
    } else {
        console.log('   ⚠️ No data returned:', JSON.stringify(getData).substring(0, 200));
    }

    // Save original settings for restoration later
    const originalSettings = getData.data ? { ...getData.data } : null;

    // ── 4. PUT /api/commander/settings — Save ALL settings ──
    console.log('\n💾 4. PUT /api/commander/settings (save all fields)...');
    const testSettings = {
        auto_refresh_interval: 45,
        sms_notifications_enabled: false,
        push_notifications_enabled: false,
        max_waitlist_size: 75,
        call_timeout_minutes: 8,
        default_wait_time_per_player: 20,
        show_player_names_on_display: true,
        venue_type: 'texas',
        time_billing_rate: 15,
        auto_comp_rate: 2.5,
        bulk_time_packages: [{ name: 'E2E Test Pack', hours: 10, price: 100, active: true }],
        security_gate_enabled: false
    };

    const putRes = await fetch(`${BASE}/api/commander/settings`, {
        method: 'PUT', headers,
        body: JSON.stringify(testSettings)
    });
    const putData = await putRes.json();
    console.log(`   HTTP ${putRes.status} ${putRes.ok ? '✅' : '❌'}`);
    if (!putRes.ok) console.log('   Error:', JSON.stringify(putData).substring(0, 200));

    // ── 5. Verify settings were persisted (GET again) ──
    console.log('\n🔍 5. Verify settings persisted...');
    const verifyRes = await fetch(`${BASE}/api/commander/settings`, { headers });
    const verifyData = await verifyRes.json();
    console.log(`   HTTP ${verifyRes.status}`);
    if (verifyData.data) {
        const v = verifyData.data;
        const checks = [
            ['auto_refresh_interval', v.auto_refresh_interval, 45],
            ['sms_notifications_enabled', v.sms_notifications_enabled, false],
            ['push_notifications_enabled', v.push_notifications_enabled, false],
            ['max_waitlist_size', v.max_waitlist_size, 75],
            ['call_timeout_minutes', v.call_timeout_minutes, 8],
            ['default_wait_time_per_player', v.default_wait_time_per_player, 20],
            ['show_player_names_on_display', v.show_player_names_on_display, true],
            ['venue_type', v.venue_type, 'texas'],
            ['time_billing_rate', v.time_billing_rate, 15],
            ['auto_comp_rate', v.auto_comp_rate, 2.5],
            ['security_gate_enabled', v.security_gate_enabled, false],
        ];
        let allPass = true;
        for (const [name, actual, expected] of checks) {
            const pass = actual === expected;
            if (!pass) allPass = false;
            console.log(`     ${pass ? '✅' : '❌'} ${name}: ${actual} (expected: ${expected})`);
        }
        // Check bulk packages
        const pkgs = v.bulk_time_packages;
        const pkgPass = Array.isArray(pkgs) && pkgs.length === 1 && pkgs[0].name === 'E2E Test Pack' && pkgs[0].hours === 10 && pkgs[0].price === 100;
        console.log(`     ${pkgPass ? '✅' : '❌'} bulk_time_packages: ${JSON.stringify(pkgs)}`);
        if (!pkgPass) allPass = false;
        console.log(`   ${allPass ? '✅ ALL SETTINGS VERIFIED' : '❌ SOME SETTINGS MISMATCHED'}`);
    }

    // ── 6. Toggle test — flip a single boolean and verify auto-save ──
    console.log('\n🔄 6. Toggle auto-save test...');
    const toggleRes = await fetch(`${BASE}/api/commander/settings`, {
        method: 'PUT', headers,
        body: JSON.stringify({ sms_notifications_enabled: true })
    });
    const toggleData = await toggleRes.json();
    console.log(`   Toggle SMS → true: HTTP ${toggleRes.status} ${toggleRes.ok ? '✅' : '❌'}`);

    // Verify only SMS changed
    const toggleVerify = await fetch(`${BASE}/api/commander/settings`, { headers });
    const toggleVerifyData = await toggleVerify.json();
    const smsValue = toggleVerifyData.data?.sms_notifications_enabled;
    const maxStillCorrect = toggleVerifyData.data?.max_waitlist_size === 75;
    console.log(`   SMS now: ${smsValue} ${smsValue === true ? '✅' : '❌'}`);
    console.log(`   Other settings unchanged: ${maxStillCorrect ? '✅' : '❌'} (max_waitlist_size=${toggleVerifyData.data?.max_waitlist_size})`);

    // ── 7. DB Direct verification ──
    console.log('\n🗃️ 7. DB direct verification (commander_venue_settings)...');
    const { data: dbRow, error: dbErr } = await s
        .from('commander_venue_settings')
        .select('*')
        .eq('venue_id', venueId)
        .single();
    if (dbErr) {
        console.log(`   ⚠️ DB query error: ${dbErr.message}`);
    } else if (dbRow) {
        console.log(`   ✅ DB row found for venue ${venueId}`);
        console.log(`     auto_refresh_interval: ${dbRow.auto_refresh_interval}`);
        console.log(`     max_waitlist_size: ${dbRow.max_waitlist_size}`);
        console.log(`     venue_type: ${dbRow.venue_type}`);
        console.log(`     time_billing_rate: ${dbRow.time_billing_rate}`);
        console.log(`     security_gate_enabled: ${dbRow.security_gate_enabled}`);
    } else {
        console.log('   ⚠️ No DB row found — settings may be stored differently');
    }

    // ── 8. Navigation links — verify sub-pages return 200 or compile ──
    console.log('\n🔗 8. Navigation link verification...');
    const subPages = [
        'membership-plans', 'game-types', 'room-presets', 'tables',
        'staff', 'dealers', 'members', 'promotions',
        'displays', 'reports', 'time-billing', 'system-info'
    ];
    for (const page of subPages) {
        try {
            const r = await fetch(`${BASE}/commander/${page}`, { redirect: 'follow' });
            const label = r.status === 200 ? '✅' : (r.status === 500 ? '⚠️ (compiling)' : `❌ (${r.status})`);
            console.log(`   /commander/${page}: ${r.status} ${label}`);
        } catch (e) {
            console.log(`   /commander/${page}: ❌ ${e.message}`);
        }
    }

    // ── 9. Logo API endpoints ──
    console.log('\n🖼️ 9. Logo API endpoints...');
    // Test GET (current logo state)
    const logoGetRes = await fetch(`${BASE}/api/commander/settings`, { headers });
    const logoGetData = await logoGetRes.json();
    console.log(`   Current logo URL: ${logoGetData.data?.club_logo_url || 'none'}`);

    // Test POST logo (small test image — 1x1 px transparent PNG)
    const testPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const logoPostRes = await fetch(`${BASE}/api/commander/settings/logo`, {
        method: 'POST', headers,
        body: JSON.stringify({ data: testPngBase64, filename: 'test_logo.png', contentType: 'image/png' })
    });
    const logoPostData = await logoPostRes.json();
    console.log(`   POST logo: HTTP ${logoPostRes.status} ${logoPostRes.ok ? '✅' : '❌'}`);
    if (logoPostRes.ok) {
        console.log(`   Uploaded URL: ${logoPostData.data?.club_logo_url || 'missing'}`);
    } else {
        console.log(`   Error: ${JSON.stringify(logoPostData).substring(0, 200)}`);
    }

    // Test DELETE logo
    const logoDeleteRes = await fetch(`${BASE}/api/commander/settings/logo`, {
        method: 'DELETE', headers
    });
    const logoDeleteData = await logoDeleteRes.json();
    console.log(`   DELETE logo: HTTP ${logoDeleteRes.status} ${logoDeleteRes.ok ? '✅' : '❌'}`);

    // ── 10. Restore original settings ──
    console.log('\n♻️ 10. Restoring original settings...');
    if (originalSettings) {
        const restoreRes = await fetch(`${BASE}/api/commander/settings`, {
            method: 'PUT', headers,
            body: JSON.stringify({
                auto_refresh_interval: originalSettings.auto_refresh_interval ?? 30,
                sms_notifications_enabled: originalSettings.sms_notifications_enabled ?? true,
                push_notifications_enabled: originalSettings.push_notifications_enabled ?? true,
                max_waitlist_size: originalSettings.max_waitlist_size ?? 50,
                call_timeout_minutes: originalSettings.call_timeout_minutes ?? 5,
                default_wait_time_per_player: originalSettings.default_wait_time_per_player ?? 15,
                show_player_names_on_display: originalSettings.show_player_names_on_display ?? false,
                venue_type: originalSettings.venue_type ?? 'texas',
                time_billing_rate: originalSettings.time_billing_rate ?? 12,
                auto_comp_rate: originalSettings.auto_comp_rate ?? 1,
                bulk_time_packages: originalSettings.bulk_time_packages ?? [],
                security_gate_enabled: originalSettings.security_gate_enabled ?? true,
            })
        });
        console.log(`   Restore: HTTP ${restoreRes.status} ${restoreRes.ok ? '✅' : '❌'}`);
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('  PHASE 7 E2E TEST COMPLETE');
    console.log('═══════════════════════════════════════════\n');

    await s.auth.signOut();
}

run().catch(e => { console.error('FATAL:', e.message); });
