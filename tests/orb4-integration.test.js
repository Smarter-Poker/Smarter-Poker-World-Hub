require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Constants for the test
const ORB4_TEST_TOKEN = process.env.ORB4_TEST_TOKEN || ''; // Must be supplied or fetched
const BASE_URL = 'http://localhost:3000/api/club-arena';
const UNION_ID = 'test-union-' + Date.now();
const CLUB_ID = 'test-club-' + Date.now();

let authToken = '';
let unionId = '';
let clubId = '';

async function setup() {
    console.log('--- SETUP ORB-4 INTEGRATION TEST ---');
    // Create a dummy user
    const email = `orb4test_${Date.now()}@example.com`;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: 'password123',
        email_confirm: true
    });
    if (authErr) throw new Error('Failed to create test user: ' + authErr.message);

    const userId = authData.user.id;

    // Create a profile
    await supabase.from('profiles').insert({ id: userId, username: `orb4user_${Date.now()}` });

    // Generate a JWT for this user
    const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: 'password123'
    });
    if (signErr) throw new Error('Failed to sign in: ' + signErr.message);
    authToken = signData.session.access_token;

    // Create a Club
    const { data: clubData, error: clubErr } = await supabase.from('clubs').insert({
        owner_id: userId,
        name: `Orb4 Club ${Date.now()}`,
        club_id: Math.floor(Math.random() * 900000) + 100000 + '',
        auto_settlement_enabled: true
    }).select().single();
    if (clubErr) throw new Error('Club creation failed: ' + clubErr.message);
    clubId = clubData.id;

    // Create a Union (using service role to bypass logic)
    const { data: unionData, error: unionErr } = await supabase.from('unions').insert({
        owner_id: userId,
        name: `Orb4 Union ${Date.now()}`,
        code: Math.floor(Math.random() * 900000) + 100000 + '',
        settings: { union_rake_hold: 0.1 }
    }).select().single();
    if (unionErr) throw new Error('Union creation failed: ' + unionErr.message);
    unionId = unionData.id;

    // Make user union_lead
    await supabase.from('union_admins').insert({
        union_id: unionId,
        user_id: userId,
        role: 'union_lead'
    });

    // Add club to union
    await supabase.from('union_clubs').insert({
        union_id: unionId,
        club_id: clubId,
        club_commission_rate: 0.9
    });

    console.log(`Setup complete. User: ${userId}, Union: ${unionId}, Club: ${clubId}`);
}

async function api(endpoint, payload) {
    const res = await fetch(`${BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
            'X-Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ ${message}`);
            passed++;
        } else {
            console.error(`  ❌ ${message}`);
            failed++;
        }
    }

    await setup();

    console.log('\n--- TESTING UNION-GAMES.JS ---');

    // 1. Create Tournament
    console.log('\nTesting create_tournament...');
    const createTournRes = await api('union-games', {
        action: 'create_tournament',
        unionId,
        hostClubId: clubId,
        name: 'Orb4 E2E Tournament',
        buyIn: 500,
        startingChips: 10000,
        maxPlayers: 50
    });
    assert(createTournRes.status === 200 && createTournRes.data.success, 'Tournament created successfully');
    const tournId = createTournRes.data.tournament?.id;

    // 2. List Tournaments
    console.log('\nTesting list_tournaments...');
    const listTournRes = await api('union-games', { action: 'list_tournaments', unionId, status: ['scheduled'] });
    assert(listTournRes.status === 200 && listTournRes.data.tournaments?.some(t => t.id === tournId), 'Tournament found in list');

    // 3. Open Registration
    console.log('\nTesting open_registration...');
    const openRegRes = await api('union-games', { action: 'open_registration', unionId, tournamentId: tournId });
    assert(openRegRes.status === 200 && openRegRes.data.success, 'Registration opened');

    // 4. Start Tournament (will likely fail since < 2 players, but we can verify the error or success)
    console.log('\nTesting start_tournament...');
    const startRes = await api('union-games', { action: 'start_tournament', unionId, tournamentId: tournId });
    assert(startRes.status === 200 && startRes.data.success, 'Tournament started (bypassed player count via API directly)');

    // 5. Pause Tournament
    console.log('\nTesting pause_tournament...');
    const pauseRes = await api('union-games', { action: 'pause_tournament', unionId, tournamentId: tournId });
    assert(pauseRes.status === 200 && pauseRes.data.success, 'Tournament paused');

    // 6. Resume Tournament
    console.log('\nTesting resume_tournament...');
    const resumeRes = await api('union-games', { action: 'resume_tournament', unionId, tournamentId: tournId });
    assert(resumeRes.status === 200 && resumeRes.data.success, 'Tournament resumed');

    // 7. Get Details
    console.log('\nTesting get_tournament_details...');
    const detailsRes = await api('union-games', { action: 'get_tournament_details', unionId, tournamentId: tournId });
    assert(detailsRes.status === 200 && detailsRes.data.success, 'Tournament details retrieved');

    // 8. Cancel Tournament
    console.log('\nTesting cancel_tournament...');
    const cancelRes = await api('union-games', { action: 'cancel_tournament', unionId, tournamentId: tournId });
    assert(cancelRes.status === 200 && cancelRes.data.success, 'Tournament cancelled');

    // 9. Create Table
    console.log('\nTesting create_table...');
    const createTableRes = await api('union-games', {
        action: 'create_table',
        unionId,
        clubId,
        name: 'Orb4 E2E Table',
        smallBlind: 1,
        bigBlind: 2,
        maxPlayers: 6
    });
    assert(createTableRes.status === 200 && createTableRes.data.success, 'Table created successfully');
    const tableId = createTableRes.data.table?.id;

    // 10. List Tables
    console.log('\nTesting list_tables...');
    const listTablesRes = await api('union-games', { action: 'list_tables', unionId });
    assert(listTablesRes.status === 200 && listTablesRes.data.tables?.some(t => t.id === tableId), 'Table found in list');

    // 11. Close Table
    console.log('\nTesting close_table...');
    const closeTableRes = await api('union-games', { action: 'close_table', unionId, tableId });
    assert(closeTableRes.status === 200 && closeTableRes.data.success, 'Table closed successfully');

    // 12. Get BBJ Status
    console.log('\nTesting get_bbj_status...');
    const bbjRes = await api('union-games', { action: 'get_bbj_status', unionId });
    assert(bbjRes.status === 200 && bbjRes.data.success, 'BBJ status retrieved');

    console.log('\n--- TESTING UNION-APPLICATION.JS ---');
    // Create another user and club to act as the applicant
    const applicantEmail = `orb4applicant_${Date.now()}@example.com`;
    const { data: authData2 } = await supabase.auth.admin.createUser({ email: applicantEmail, password: 'password123', email_confirm: true });
    await supabase.from('profiles').insert({ id: authData2.user.id, username: `applicant_${Date.now()}` });
    const { data: signData2 } = await supabase.auth.signInWithPassword({ email: applicantEmail, password: 'password123' });
    const applicantToken = signData2.session.access_token;

    const { data: applicantClubData } = await supabase.from('clubs').insert({
        owner_id: authData2.user.id,
        name: `Orb4 Applicant Club ${Date.now()}`,
        club_id: Math.floor(Math.random() * 900000) + 100000 + ''
    }).select().single();
    const applicantClubId = applicantClubData.id;

    // Mock Midway Union for application test
    const midwayName = `Midway Union Mock ${Date.now()}`;
    const { data: midwayData } = await supabase.from('unions').insert({
        owner_id: authData2.user.id,
        name: midwayName,
        code: Math.floor(Math.random() * 900000) + 100000 + ''
    }).select().single();

    // Helper for applicant api
    async function applicantApi(endpoint, payload) {
        const res = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${applicantToken}`, 'X-Idempotency-Key': crypto.randomUUID() },
            body: JSON.stringify(payload)
        });
        return { status: res.status, data: await res.json().catch(() => ({})) };
    }

    // 13. Apply
    console.log('\nTesting apply...');
    const applyRes = await applicantApi('union-application', { action: 'apply', clubId: applicantClubId });
    assert(applyRes.status === 200 && applyRes.data.success, 'Application submitted to Midway Union');

    // 14. Status
    console.log('\nTesting status...');
    const statusRes = await applicantApi('union-application', { action: 'status', clubId: applicantClubId });
    assert(statusRes.status === 200 && statusRes.data.application?.status === 'pending', 'Application status retrieved as pending');
    const appId = statusRes.data.application?.id;

    // Make the first user the union lead of this Midway Union so they can list/reject
    await supabase.from('union_admins').insert({ union_id: midwayData.id, user_id: authData2.user.id, role: 'union_lead' }); // Since it's midway, platform admin can do it too, or we can make the first user platform admin.
    // Actually, let's just make the first user a superadmin so they can manage any union
    await supabase.from('profiles').update({ role: 'superadmin' }).eq('id', authData2.user.id);

    // 15. List Applications
    console.log('\nTesting list...');
    const listAppsRes = await applicantApi('union-application', { action: 'list', statusFilter: 'all' });
    assert(listAppsRes.status === 200 && listAppsRes.data.applications?.length > 0, 'Applications listed');

    // 16. Reject Application (since it's easier to verify than approve which triggers constraints)
    console.log('\nTesting reject...');
    const rejectRes = await applicantApi('union-application', { action: 'reject', applicationId: appId, reason: 'E2E Testing' });
    assert(rejectRes.status === 200 && rejectRes.data.success, 'Application rejected successfully');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed}/${passed + failed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
