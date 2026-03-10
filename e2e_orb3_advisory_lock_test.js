// e2e_orb3_advisory_lock_test.js
// Simulates 100 concurrent registration POST requests to test the Postgres Advisory Lock.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let envStr = '';
try {
    envStr = fs.readFileSync(envPath, 'utf-8');
} catch (e) {
    console.error('❌ Could not read .env.local file');
    process.exit(1);
}

// Extract using simple string splitting to avoid regex quirks with quotes
const getEnvVal = (key) => {
    const line = envStr.split('\n').find(l => l.startsWith(key + '='));
    if (!line) return null;
    let val = line.substring(key.length + 1).trim();
    // remove surrounding quotes if any
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
    }
    return val;
};

const SUPABASE_URL = getEnvVal('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = getEnvVal('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE credentials in .env.local');
    process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NUM_CONCURRENT = 100;
const TEST_BUY_IN = 500;
const TEST_MAX_PLAYERS = 105;

async function runConcurrencyTest() {
    console.log(`[E2E ORB-3] Starting Advisory Lock Concurrency Test (${NUM_CONCURRENT} requests) 🚀`);

    // 1. Setup Phase: Create Test Club and Tournament
    const clubId = crypto.randomUUID();
    const testTournamentId = crypto.randomUUID();

    console.log(`[E2E ORB-3] Provisioning Test Club: ${clubId}`);
    await supabase.from('clubs').insert({ id: clubId, name: 'ORB-3 Load Test Club', owner_id: '123e4567-e89b-12d3-a456-426614174000' }); // Use a dummy UUID for owner, won't matter for RPC test

    console.log(`[E2E ORB-3] Provisioning Test Tournament: ${testTournamentId}`);
    await supabase.from('club_tournaments').insert({
        id: testTournamentId,
        club_id: clubId,
        name: 'E2E Concurrency Stress Test',
        type: 'mtt',
        variant: 'nlh',
        buy_in: TEST_BUY_IN,
        starting_chips: 10000,
        max_players: TEST_MAX_PLAYERS,
        status: 'registering',
        registered_count: 0,
        prize_pool: 0,
    });

    // 2. Provision 100 dummy users with enough chips
    console.log(`[E2E ORB-3] Provisioning ${NUM_CONCURRENT} test users with chip balances...`);
    const testUsers = [];
    for (let i = 0; i < NUM_CONCURRENT; i++) {
        const userId = crypto.randomUUID();
        testUsers.push(userId);
        // Insert into auth.users (mock) and profiles
        await supabase.from('profiles').insert({ id: userId, alias: `TestUser_${i}`, is_horse: true });
        // Give them chips in the club
        await supabase.from('club_members').insert({
            club_id: clubId,
            user_id: userId,
            role: 'member',
            chip_balance: TEST_BUY_IN * 2, // Exactly enough for 1 buy-in + spare
        });
    }

    console.log(`[E2E ORB-3] Setup complete. Preparing HTTP payload burst...`);

    // 3. Execution Phase: 100 concurrent HTTP requests (Bypassing Next.js API direct to RPC for isolated DB test)
    // Why direct RPC? We want to specifically stress test the Postgres lock `pg_advisory_xact_lock(hashtext('reg_' || p_tournament_id::text))`
    // This removes Node.js event-loop bottlenecks and tests the raw DB lock natively.

    const promises = testUsers.map(async (userId) => {
        return supabase.rpc('fn_tournament_atomic_register', {
            p_user_id: userId,
            p_club_id: clubId,
            p_tournament_id: testTournamentId,
            p_buy_in: TEST_BUY_IN,
        });
    });

    console.time('Concurrency Burst');
    const results = await Promise.allSettled(promises);
    console.timeEnd('Concurrency Burst');

    // 4. Verification Phase: Assertions
    let successCount = 0;
    let failCount = 0;

    results.forEach(res => {
        if (res.status === 'fulfilled' && res.value.data?.success) {
            successCount++;
        } else {
            failCount++;
            console.error(res.reason || res.value?.error || res.value?.data?.error);
        }
    });

    console.log(`\n[E2E ORB-3] Results: ${successCount} Success, ${failCount} Fails`);

    // Assert DB Truth
    const { data: finalTourn } = await supabase.from('club_tournaments').select('*').eq('id', testTournamentId).maybeSingle();
    const { count: finalRegs } = await supabase.from('tournament_registrations').select('*', { count: 'exact' }).eq('tournament_id', testTournamentId);

    console.log(`\n[E2E ORB-3] Final Database State:`);
    console.log(`- Expected Registrations: ${NUM_CONCURRENT}`);
    console.log(`- Actual DB tourney.registered_count: ${finalTourn.registered_count}`);
    console.log(`- Actual DB registrations rows: ${finalRegs}`);
    console.log(`- Expected Prize Pool: ${NUM_CONCURRENT * TEST_BUY_IN}`);
    console.log(`- Actual DB Prize Pool: ${finalTourn.prize_pool}`);

    if (finalTourn.registered_count === NUM_CONCURRENT && finalRegs === NUM_CONCURRENT && finalTourn.prize_pool === (NUM_CONCURRENT * TEST_BUY_IN)) {
        console.log(`\n✅ ADVISORY LOCK TEST PASSED: 100% sequential consistency achieved across ${NUM_CONCURRENT} concurrent requests.`);
    } else {
        console.log(`\n❌ ADVISORY LOCK TEST FAILED: Race condition detected.`);
    }

    // 5. Teardown
    console.log(`[E2E ORB-3] Cleaning up test data...`);
    await supabase.from('club_tournaments').delete().eq('id', testTournamentId);
    await supabase.from('clubs').delete().eq('id', clubId);
    // cascading deletes should handle members and registrations

    for (const uid of testUsers) {
        await supabase.from('profiles').delete().eq('id', uid);
    }

    process.exit(0);
}

runConcurrencyTest();
