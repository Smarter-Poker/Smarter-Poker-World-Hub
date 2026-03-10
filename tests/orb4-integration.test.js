require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = 'http://localhost:3000/api/club-arena';
let authToken = '';
let unionId = '';
let clubId = '';

async function waitForProfile(userId) {
    for (let i = 0; i < 10; i++) {
        const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
        if (data) return;
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Profile not created for ' + userId);
}

async function setup() {
    console.log('--- SETUP ORB-4 INTEGRATION TEST ---');

    // 1. Create Lead User
    const email = `orb4lead_${Date.now()}@example.com`;
    const { data: authData } = await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
    const userId = authData.user.id;
    await waitForProfile(userId);
    await supabase.from('profiles').update({ username: `orb4lead_${Date.now()}` }).eq('id', userId);

    const { data: signData } = await supabase.auth.signInWithPassword({ email, password: 'password123' });
    authToken = signData.session.access_token;

    // 2. Create Club
    const { data: clubData } = await supabase.from('clubs').insert({
        owner_id: userId, name: `Orb4 Club ${Date.now()}`, club_id: Math.floor(Math.random() * 900000) + 100000 + '', auto_settlement_enabled: true
    }).select().maybeSingle();
    clubId = clubData.id;

    // 3. Create Union
    const { data: unionData } = await supabase.from('unions').insert({
        owner_id: userId, name: `Orb4 Union ${Date.now()}`, code: Math.floor(Math.random() * 900000) + 100000 + '', settings: { union_rake_hold: 0.1 }
    }).select().maybeSingle();
    unionId = unionData.id;

    // 4. Link everything
    await supabase.from('union_admins').insert({ union_id: unionId, user_id: userId, role: 'union_lead' });
    await supabase.from('union_clubs').insert({ union_id: unionId, club_id: clubId, club_commission_rate: 0.9 });
    console.log(`Setup complete. Union: ${unionId}, Club: ${clubId}`);
}

async function api(endpoint, payload, token = authToken) {
    const res = await fetch(`${BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(payload)
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function runTests() {
    let passed = 0; let failed = 0;
    function assert(condition, message) { condition ? (console.log(`  ✅ ${message}`), passed++) : (console.error(`  ❌ ${message}`), failed++); }

    await setup();

    console.log('\n--- TESTING UNION-GAMES.JS ---');
    // 1. Create Tourn
    const createTourn = await api('union-games', { action: 'create_tournament', unionId, hostClubId: clubId, name: 'Orb4 E2E Tournament', buyIn: 500, startingChips: 10000, maxPlayers: 50 });
    assert(createTourn.status === 200 && createTourn.data.success, 'Tournament created'); const tournId = createTourn.data.tournament?.id;

    assert((await api('union-games', { action: 'list_tournaments', unionId, status: ['scheduled'] })).status === 200, 'Tournaments listed');
    assert((await api('union-games', { action: 'open_registration', unionId, tournamentId: tournId })).data.success, 'Registration opened');
    assert((await api('union-games', { action: 'start_tournament', unionId, tournamentId: tournId })).data.success, 'Tournament started');
    assert((await api('union-games', { action: 'pause_tournament', unionId, tournamentId: tournId })).data.success, 'Tournament paused');
    assert((await api('union-games', { action: 'resume_tournament', unionId, tournamentId: tournId })).data.success, 'Tournament resumed');
    assert((await api('union-games', { action: 'get_tournament_details', unionId, tournamentId: tournId })).data.success, 'Tournament details retrieved');
    assert((await api('union-games', { action: 'cancel_tournament', unionId, tournamentId: tournId })).data.success, 'Tournament cancelled');

    const createTable = await api('union-games', { action: 'create_table', unionId, clubId, name: 'Orb4 E2E Table', smallBlind: 1, bigBlind: 2, maxPlayers: 6 });
    assert(createTable.status === 200 && createTable.data.success, 'Table created'); const tableId = createTable.data.table?.id;
    assert((await api('union-games', { action: 'list_tables', unionId })).status === 200, 'Tables listed');
    assert((await api('union-games', { action: 'close_table', unionId, tableId })).data.success, 'Table closed');
    assert((await api('union-games', { action: 'get_bbj_status', unionId })).status === 200, 'BBJ status retrieved');

    console.log('\n--- TESTING UNION-APPLICATION.JS ---');
    const applicantEmail = `orb4app_${Date.now()}@example.com`;
    const { data: authData2 } = await supabase.auth.admin.createUser({ email: applicantEmail, password: 'password123', email_confirm: true });
    await waitForProfile(authData2.user.id);
    const { data: signData2 } = await supabase.auth.signInWithPassword({ email: applicantEmail, password: 'password123' });
    const appToken = signData2.session.access_token;

    const { data: appClubData } = await supabase.from('clubs').insert({ owner_id: authData2.user.id, name: `Orb4 App Club ${Date.now()}`, club_id: Math.floor(Math.random() * 900000) + 100000 + '' }).select().maybeSingle();
    const midwayName = `Midway Union Mock ${Date.now()}`;
    const { data: midwayData } = await supabase.from('unions').insert({ owner_id: authData2.user.id, name: midwayName, code: Math.floor(Math.random() * 900000) + 100000 + '' }).select().maybeSingle();

    const applyRes = await api('union-application', { action: 'apply', clubId: appClubData.id }, appToken);
    assert(applyRes.status === 200 && applyRes.data.success, 'Application submitted to Midway Union');
    assert((await api('union-application', { action: 'status', clubId: appClubData.id }, appToken)).status === 200, 'Application status retrieved');

    // Lead user lists and rejects the application
    await supabase.from('union_admins').insert({ union_id: midwayData.id, user_id: authData2.user.id, role: 'union_lead' });
    assert((await api('union-application', { action: 'list', statusFilter: 'all' }, appToken)).status === 200, 'Applications listed');
    assert((await api('union-application', { action: 'reject', applicationId: applyRes.data.application?.id, reason: 'E2E Testing' }, appToken)).data.success, 'Application rejected successfully');

    console.log(`\n  RESULTS: ${passed}/${passed + failed} passed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => { console.error(e); process.exit(1); });
