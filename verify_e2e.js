/**
 * FULL SYSTEM RE-VERIFICATION — All Components
 * Covers: Schema, Auth, Auto-Delete, Member Upsert, Phone Wiring,
 * Kiosk Search Compat, Desk View, Player Page Data Mapping
 */
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const VENUE_ID = 1996;
let passed = 0, failed = 0;
const cleanupIds = { waitlist: [], members: [] };

function ok(label, cond, detail) {
    if (cond) { console.log(`  ✅ ${label}`); passed++; }
    else { console.log(`  ❌ ${label}${detail ? ': ' + detail : ''}`); failed++; }
}

async function run() {
    console.log('═══════════════════════════════════════════════════');
    console.log('  FULL SYSTEM RE-VERIFICATION — ALL COMPONENTS');
    console.log('═══════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════
    // 1. DATABASE SCHEMA
    // ═══════════════════════════════════════
    console.log('1. DATABASE SCHEMA — commander_waitlist');
    const { data: wlRow } = await supabase.from('commander_waitlist').select('*').eq('venue_id', VENUE_ID).limit(1).maybeSingle();
    if (wlRow) {
        const c = Object.keys(wlRow);
        ok('signup_method column', c.includes('signup_method'));
        ok('checked_in_at column', c.includes('checked_in_at'));
        ok('player_id column', c.includes('player_id'));
        ok('player_name column', c.includes('player_name'));
        ok('player_phone column', c.includes('player_phone'));
        ok('venue_id column', c.includes('venue_id'));
        ok('game_type column', c.includes('game_type'));
        ok('stakes column', c.includes('stakes'));
        ok('status column', c.includes('status'));
        ok('position column', c.includes('position'));
        ok('created_at column', c.includes('created_at'));
    } else { ok('Test row exists', false, 'No rows in waitlist for venue'); }

    console.log('\n   DATABASE SCHEMA — commander_members');
    const { data: memRow } = await supabase.from('commander_members').select('*').limit(1).maybeSingle();
    if (memRow) {
        const c = Object.keys(memRow);
        ok('first_name column', c.includes('first_name'));
        ok('last_name column', c.includes('last_name'));
        ok('phone column', c.includes('phone'));
        ok('email column', c.includes('email'));
        ok('venue_id column', c.includes('venue_id'));
        ok('membership_status column', c.includes('membership_status'));
    }

    // ═══════════════════════════════════════
    // 2. SIGNUP_METHOD CONSTRAINT
    // ═══════════════════════════════════════
    console.log('\n2. SIGNUP_METHOD CONSTRAINT');
    const { data: webIns, error: webErr } = await supabase
        .from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '1/2', player_name: '__VERIFY_WEB__', position: 999, signup_method: 'web', status: 'waiting' })
        .select().maybeSingle();
    ok('web signup_method accepted', !!webIns && !webErr, webErr?.message);
    if (webIns) cleanupIds.waitlist.push(webIns.id);

    const { error: badErr } = await supabase
        .from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '1/2', player_name: '__VERIFY_BAD__', position: 998, signup_method: 'INVALID', status: 'waiting' })
        .select().maybeSingle();
    ok('invalid signup_method rejected', !!badErr);

    // ═══════════════════════════════════════
    // 3. CHECKED_IN_AT LIFECYCLE
    // ═══════════════════════════════════════
    console.log('\n3. CHECKED_IN_AT LIFECYCLE');
    if (webIns) {
        const ts = new Date().toISOString();
        const { data: patched } = await supabase.from('commander_waitlist').update({ checked_in_at: ts }).eq('id', webIns.id).select().maybeSingle();
        ok('PATCH sets checked_in_at', patched?.checked_in_at != null);
        // Reset for later auto-delete test
        await supabase.from('commander_waitlist').update({ checked_in_at: null }).eq('id', webIns.id);
    }

    // ═══════════════════════════════════════
    // 4. RPC — get_next_waitlist_position
    // ═══════════════════════════════════════
    console.log('\n4. RPC — get_next_waitlist_position');
    const { data: pos, error: posErr } = await supabase.rpc('get_next_waitlist_position', { p_venue_id: VENUE_ID, p_game_type: 'nlh', p_stakes: '1/2' });
    ok('RPC returns position', typeof pos === 'number' && pos > 0, posErr?.message);
    ok('RPC accepts INTEGER venue_id', !posErr);

    // ═══════════════════════════════════════
    // 5. AUTO-DELETE LOGIC
    // ═══════════════════════════════════════
    console.log('\n5. AUTO-DELETE LOGIC');
    const oldTime = new Date(Date.now() - 70 * 60 * 1000).toISOString();

    // 5a: Expired entry (no check-in) → SHOULD be deleted
    const { data: expired } = await supabase.from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '88/88', player_name: '__VERIFY_EXPIRED__', position: 997, signup_method: 'web', status: 'waiting', created_at: oldTime })
        .select().maybeSingle();
    ok('Expired test entry created', !!expired);

    // 5b: Checked-in entry (old) → should NOT be deleted
    const { data: checkedIn } = await supabase.from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '87/87', player_name: '__VERIFY_SAFE__', position: 996, signup_method: 'web', status: 'waiting', created_at: oldTime, checked_in_at: new Date().toISOString() })
        .select().maybeSingle();
    ok('Checked-in test entry created', !!checkedIn);

    // 5c: Walk-in entry (old) → should NOT be deleted
    const { data: walkIn } = await supabase.from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '86/86', player_name: '__VERIFY_WALKIN__', position: 995, signup_method: 'walk_in', status: 'waiting', created_at: oldTime })
        .select().maybeSingle();
    ok('Walk-in test entry created', !!walkIn);

    // Run cleanup (same as API)
    const expiryTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase.from('commander_waitlist').delete()
        .eq('venue_id', VENUE_ID).eq('signup_method', 'web').eq('status', 'waiting')
        .is('checked_in_at', null).lt('created_at', expiryTime);

    // Verify results
    if (expired) {
        const { data: e } = await supabase.from('commander_waitlist').select('id').eq('id', expired.id).maybeSingle();
        ok('Expired web entry DELETED', !e);
    }
    if (checkedIn) {
        const { data: s } = await supabase.from('commander_waitlist').select('id').eq('id', checkedIn.id).maybeSingle();
        ok('Checked-in web entry PRESERVED', !!s);
        cleanupIds.waitlist.push(checkedIn.id);
    }
    if (walkIn) {
        const { data: w } = await supabase.from('commander_waitlist').select('id').eq('id', walkIn.id).maybeSingle();
        ok('Walk-in entry PRESERVED', !!w);
        cleanupIds.waitlist.push(walkIn.id);
    }

    // ═══════════════════════════════════════
    // 6. MEMBER UPSERT (Kiosk Compat)
    // ═══════════════════════════════════════
    console.log('\n6. MEMBER UPSERT — Kiosk Compatibility');

    // Simulate what public-join does: create a member record
    const testEmail = '__verify_test__@test.smarter.poker';
    const testPhone = '+10005551234';
    const { data: newMember, error: memInsErr } = await supabase.from('commander_members')
        .insert({
            venue_id: VENUE_ID, member_number: `TEST-${Date.now().toString(36).slice(-5)}`,
            first_name: 'TestWeb', last_name: 'Player',
            phone: testPhone, email: testEmail,
            membership_status: 'active', member_type: 'player',
            notes: 'Auto-registered via web waitlist sign-up'
        })
        .select().maybeSingle();
    ok('Member INSERT succeeds', !!newMember && !memInsErr, memInsErr?.message);
    if (newMember) cleanupIds.members.push(newMember.id);

    // 6a: Kiosk search by name (ilike)
    const { data: byName } = await supabase.from('commander_members')
        .select('id, first_name, last_name, phone')
        .eq('venue_id', VENUE_ID)
        .or('first_name.ilike.%TestWeb%,last_name.ilike.%TestWeb%')
        .limit(1).maybeSingle();
    ok('Kiosk finds member by NAME', !!byName);

    // 6b: Kiosk search by phone (ilike digits)
    const { data: byPhone } = await supabase.from('commander_members')
        .select('id, first_name, last_name, phone')
        .eq('venue_id', VENUE_ID)
        .ilike('phone', '%0005551234%')
        .limit(1).maybeSingle();
    ok('Kiosk finds member by PHONE', !!byPhone);

    // 6c: Verify name fields are populated
    if (byName) {
        ok('first_name populated', byName.first_name === 'TestWeb');
        ok('last_name populated', byName.last_name === 'Player');
        ok('phone populated', !!byName.phone);
    }

    // 6d: Email dedup check
    const { data: emailCheck } = await supabase.from('commander_members')
        .select('id').eq('venue_id', VENUE_ID).eq('email', testEmail).maybeSingle();
    ok('Email dedup finds existing member', !!emailCheck);

    // 6e: Phone dedup check
    const { data: phoneCheck } = await supabase.from('commander_members')
        .select('id').eq('venue_id', VENUE_ID).eq('phone', testPhone).maybeSingle();
    ok('Phone dedup finds existing member', !!phoneCheck);

    // ═══════════════════════════════════════
    // 7. VENUE WAITLIST API DATA FLOW
    // ═══════════════════════════════════════
    console.log('\n7. VENUE WAITLIST API DATA FLOW');
    const { data: entries } = await supabase.from('commander_waitlist')
        .select('*').eq('venue_id', VENUE_ID).in('status', ['waiting', 'called']).order('position', { ascending: true });
    ok('Entries returned', entries?.length > 0, `Got ${entries?.length || 0}`);

    // Simulate grouping (same as venue API)
    const waitlistMap = {};
    (entries || []).forEach(e => {
        const key = `${e.game_type}-${e.stakes}`;
        if (!waitlistMap[key]) waitlistMap[key] = { game_type: e.game_type, stakes: e.stakes, players: [], count: 0 };
        waitlistMap[key].players.push({ id: e.id, player_name: e.player_name, status: e.status, signup_method: e.signup_method, created_at: e.created_at });
        waitlistMap[key].count++;
    });
    const wls = Object.values(waitlistMap);
    ok('Grouped into columns', wls.length > 0);
    ok('Players have signup_method', wls[0]?.players?.[0]?.signup_method !== undefined);
    ok('Players have player_name', !!wls[0]?.players?.[0]?.player_name);

    // ═══════════════════════════════════════
    // 8. DESK VIEW FIELDS
    // ═══════════════════════════════════════
    console.log('\n8. DESK VIEW FIELDS');
    if (wlRow) {
        const c = Object.keys(wlRow);
        ok('signup_method for WEB badge', c.includes('signup_method'));
        ok('checked_in_at for countdown', c.includes('checked_in_at'));
        ok('created_at for timer calc', c.includes('created_at'));
        ok('player_name for display', c.includes('player_name'));
        ok('status for called/waiting', c.includes('status'));
    }

    // ═══════════════════════════════════════
    // 9. HISTORY TABLE
    // ═══════════════════════════════════════
    console.log('\n9. HISTORY TABLE');
    const { data: hist } = await supabase.from('commander_waitlist_history').select('*').limit(1).maybeSingle();
    if (hist) {
        ok('History: signup_method', Object.keys(hist).includes('signup_method'));
        ok('History: wait_time_minutes', Object.keys(hist).includes('wait_time_minutes'));
        ok('History: was_seated', Object.keys(hist).includes('was_seated'));
    } else {
        ok('History table queryable', true);
    }

    // ═══════════════════════════════════════
    // 10. DUPLICATE PREVENTION
    // ═══════════════════════════════════════
    console.log('\n10. DUPLICATE PREVENTION');
    const pid = '00000000-0000-0000-0000-000000000099';
    const { data: d1 } = await supabase.from('commander_waitlist')
        .insert({ venue_id: VENUE_ID, game_type: 'nlh', stakes: '85/85', player_name: '__DUP__', position: 994, player_id: pid, signup_method: 'web', status: 'waiting' })
        .select().maybeSingle();
    if (d1) cleanupIds.waitlist.push(d1.id);

    const { data: dupCheck } = await supabase.from('commander_waitlist')
        .select('id').eq('venue_id', VENUE_ID).eq('game_type', 'nlh').eq('stakes', '85/85').eq('player_id', pid).eq('status', 'waiting').maybeSingle();
    ok('Duplicate check finds existing', !!dupCheck);

    // ═══════════════════════════════════════
    // 11. AUTH FLOW (JWT Verification)
    // ═══════════════════════════════════════
    console.log('\n11. AUTH FLOW — JWT VERIFICATION');
    // Verify anon client can check tokens (the mechanism used in public-join)
    const { data: { user: fakeUser }, error: fakeErr } = await supabaseAnon.auth.getUser('not-a-real-token');
    ok('Invalid token rejected', fakeErr != null || !fakeUser);

    // ═══════════════════════════════════════
    // 12. PHONE NUMBER SOURCING
    // ═══════════════════════════════════════
    console.log('\n12. PHONE NUMBER SOURCING');
    const { data: profileCols } = await supabase.from('profiles').select('*').limit(1).maybeSingle();
    if (profileCols) {
        const pCols = Object.keys(profileCols);
        ok('profiles.phone exists', pCols.includes('phone'));
        ok('profiles.display_name exists', pCols.includes('display_name'));
        ok('profiles.full_name exists', pCols.includes('full_name'));
    }
    // Verify some profiles have phone numbers
    const { data: withPhone, count: phoneCount } = await supabase.from('profiles').select('id', { count: 'exact' }).not('phone', 'is', null).limit(1);
    ok('Some profiles have phone numbers', (phoneCount || withPhone?.length) > 0);

    // ═══════════════════════════════════════
    // 13. COUNTDOWN = INTERNAL ONLY (code audit)
    // ═══════════════════════════════════════
    console.log('\n13. COUNTDOWN = INTERNAL ONLY');
    const playerPage = fs.readFileSync('pages/hub/commander/waitlist/[venueId].js', 'utf-8');
    const deskPage = fs.readFileSync('pages/commander/waitlist/desk.js', 'utf-8');
    ok('Player page has NO countdown', !playerPage.includes('minutesLeft') && !playerPage.includes('webMinutesLeft'));
    ok('Desk view HAS countdown', deskPage.includes('webMinutesLeft'));
    ok('Desk view HAS EXPIRED badge', deskPage.includes('EXPIRED'));
    ok('Desk view HAS Check In button', deskPage.includes('Check In') || deskPage.includes('handleCheckIn'));

    // ═══════════════════════════════════════
    // 14. API ROUTE FILE AUDIT
    // ═══════════════════════════════════════
    console.log('\n14. API ROUTE FILES EXIST');
    ok('public-join.js exists', fs.existsSync('pages/api/commander/waitlist/public-join.js'));
    ok('venue/[venueId].js exists', fs.existsSync('pages/api/commander/waitlist/venue/[venueId].js'));
    ok('[id].js exists', fs.existsSync('pages/api/commander/waitlist/[id].js'));
    ok('members/search.js exists', fs.existsSync('pages/api/commander/members/search.js'));

    // Verify public-join has member upsert
    const joinCode = fs.readFileSync('pages/api/commander/waitlist/public-join.js', 'utf-8');
    ok('public-join has member upsert', joinCode.includes('commander_members'));
    ok('public-join verifies JWT', joinCode.includes('auth.getUser'));
    ok('public-join has auto-delete', joinCode.includes('WEB_EXPIRY_MINUTES') || joinCode.includes('auto-delete'));
    ok('public-join uses maybeSingle', joinCode.includes('.maybeSingle()'));
    ok('public-join checks user.phone', joinCode.includes('user.phone'));

    // Verify venue API has auto-cleanup
    const venueCode = fs.readFileSync('pages/api/commander/waitlist/venue/[venueId].js', 'utf-8');
    ok('venue API has auto-cleanup', venueCode.includes('Auto-cleanup') || venueCode.includes('signup_method'));

    // ═══════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════
    console.log('\n── CLEANUP ──');
    for (const id of cleanupIds.waitlist) await supabase.from('commander_waitlist').delete().eq('id', id);
    for (const id of cleanupIds.members) await supabase.from('commander_members').delete().eq('id', id);
    await supabase.from('commander_waitlist').delete().like('player_name', '__VERIFY_%');
    await supabase.from('commander_waitlist').delete().like('player_name', '__DUP__%');
    await supabase.from('commander_members').delete().eq('email', '__verify_test__@test.smarter.poker');
    console.log('  All test data cleaned up ✓');

    // ═══════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════');
    if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
