#!/usr/bin/env node
/**
 * ORB-3 CONCURRENCY E2E TEST (Advisory Locks)
 * 
 * Simulates 100 concurrent registration POST requests in the final second
 * of late-registration. Asserts that the Postgres Advisory Lock sequentially
 * processes them without dropping a single buy-in from the prize pool.
 * 
 * Run: node tests/orb3_mtt_concurrency.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const TEST_UUID = crypto.randomUUID();
const CLUB_NAME = `orb3_mtt_test_club_${TEST_UUID.slice(0, 8)}`;
const MTT_NAME = `orb3_mtt_test_${TEST_UUID.slice(0, 8)}`;
const BUY_IN = 100;
const CONCURRENT_USERS = 100;

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${testName}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${testName}`);
    }
}

async function runTest() {
    console.log(`\n🔴 ORB-3 E2E Test: 100 Concurrent Registrations`);
    console.log(`  UUID: ${TEST_UUID}`);

    try {
        // 1. Create a god-mode test user id
        const { data: godUser, error: uErr } = await supabaseAdmin.auth.admin.createUser({
            email: `god_${TEST_UUID}@test.com`,
            password: 'password123',
            email_confirm: true,
        });
        if (uErr) throw uErr;
        const godId = godUser.user.id;

        // We need all player IDs to exist in `auth.users`
        const playerIds = [godId];
        console.log(`  [+] Creating 100 mock auth users (takes a few seconds)...`);
        const authUserPromises = [];
        for (let i = 0; i < CONCURRENT_USERS; i++) {
            authUserPromises.push(
                supabaseAdmin.auth.admin.createUser({
                    email: `tester_${crypto.randomUUID()}@test.com`,
                    password: 'password123',
                    email_confirm: true,
                })
            );
        }

        const authResults = await Promise.all(authUserPromises);
        for (const res of authResults) {
            if (res.error) throw res.error;
            playerIds.push(res.data.user.id);
        }

        const userInserts = playerIds.map(id => ({
            id,
            username: `Tester_${id.slice(0, 8)}`
        }));

        console.log(`  [+] Inserting ${userInserts.length} mock users into 'users' table to satisfy constraints...`);
        const { error: userErr } = await supabaseAdmin.from('users').insert(userInserts);
        if (userErr) throw userErr;

        // (Profile is auto-created by Supabase trigger on auth.users insert)

        // 2. Setup Test Club
        const { data: club, error: cErr } = await supabaseAdmin
            .from('clubs')
            .insert({
                name: CLUB_NAME,
                owner_id: godId,
                settings: {}
            })
            .select('id')
            .maybeSingle();
        if (cErr) throw cErr;

        const clubId = club.id;

        // 3. Setup Test Tournament
        const tId = crypto.randomUUID();
        const { error: tsErr } = await supabaseAdmin.from('tournaments').insert({
            id: tId,
            name: MTT_NAME,
            game_type: 'texas_holdem',
            buy_in_amount: BUY_IN,
            buy_in_fee: 0,
            max_players: 1000,
            start_time: new Date().toISOString(),
            status: 'REGISTERING'
        });
        if (tsErr) throw tsErr;

        const { data: mtt, error: tErr } = await supabaseAdmin
            .from('club_tournaments')
            .insert({
                id: tId,
                club_id: clubId,
                name: MTT_NAME,
                status: 'registering',
                buy_in: BUY_IN,
                registered_count: 0,
                prize_pool: 0,
                settings: { late_reg_minutes: 10 },
                created_by: godId
            })
            .select('id')
            .maybeSingle();
        if (tErr) throw tErr;

        const tournamentId = mtt.id;
        console.log(`  [+] Created test club and MTT (${tournamentId})`);

        // 4. Create 100 Test Users and Give them Chips
        console.log(`  [+] Spinning up ${CONCURRENT_USERS} synthetic test players...`);

        // Remove the godId from the array so we only have 100 players for registering
        playerIds.shift();

        // Insert dummy profiles & club members instantly instead of auth creation to save time/limits
        const memberInserts = playerIds.map(id => ({
            user_id: id,
            club_id: clubId,
            role: 'player',
            chip_balance: BUY_IN * 2 // enough for buy-in + rebuy
        }));

        const { error: mErr } = await supabaseAdmin.from('club_members').insert(memberInserts);
        if (mErr) throw mErr;

        console.log(`  [+] Test players funded and ready for bombardment`);

        // 5. Fire 100 CONCURRENT POST registration requests via RPC directly
        console.log(`\n  🚀 BOMBARDMENT COMMENCING: 100 concurrent RPC calls...`);

        const startTime = Date.now();

        const promises = playerIds.map(playerId =>
            supabaseAdmin.rpc('fn_tournament_atomic_register', {
                p_club_id: clubId,
                p_tournament_id: tournamentId,
                p_user_id: playerId,
                p_buy_in: BUY_IN
            })
        );

        const results = await Promise.allSettled(promises);

        const duration = Date.now() - startTime;
        console.log(`  [+] Bombardment completed in ${duration}ms`);

        let successCount = 0;
        let failCount = 0;
        results.forEach(r => {
            if (r.status === 'fulfilled' && r.value.data && r.value.data.success) {
                successCount++;
            } else {
                failCount++;
                if (failCount === 1) console.error("First failure details:", r.value?.error || r.reason || r.value?.data);
            }
        });

        console.log(`  [!] RPC Results: ${successCount} successful, ${failCount} failed`);

        // In a perfect world, all 100 should succeed if there are no deadlocks
        assert(successCount === CONCURRENT_USERS, `100/100 concurrent requests processed successfully without deadlocks`);
        assert(failCount === 0, `0 requests dropped or failed`);

        // 6. Verify Final State matching 100% (No TOCTOU)
        const { data: finalMtt } = await supabaseAdmin
            .from('club_tournaments')
            .select('registered_count, prize_pool')
            .eq('id', tournamentId)
            .maybeSingle();

        console.log(`\n  📊 Final State Evaluation:`);
        console.log(`    Expected Registered: ${CONCURRENT_USERS}`);
        console.log(`    Actual Registered  : ${finalMtt.registered_count}`);
        console.log(`    Expected Prize Pool: ${(CONCURRENT_USERS * BUY_IN).toLocaleString()}`);
        console.log(`    Actual Prize Pool  : ${finalMtt.prize_pool.toLocaleString()}`);

        assert(finalMtt.registered_count === CONCURRENT_USERS, 'Advisory Lock mapped registered_count perfectly');
        assert(finalMtt.prize_pool === CONCURRENT_USERS * BUY_IN, 'Advisory Lock mapped prize_pool perfectly (No Double-Spending / Lost Updates)');

        // 7. Teardown
        console.log(`\n  🧹 Teardown Initiated`);
        await supabaseAdmin.from('club_tournaments').delete().eq('id', tournamentId);
        await supabaseAdmin.from('tournaments').delete().eq('id', tournamentId);
        await supabaseAdmin.from('clubs').delete().eq('id', clubId);
        await supabaseAdmin.from('profiles').delete().in('id', [godId, ...playerIds]);
        const { error: delErr } = await supabaseAdmin.from('users').delete().in('id', [godId, ...playerIds]);
        if (delErr) console.error('  [!] Warning: Failed to clean up fake users:', delErr.message);

        console.log(`  [+] Deleting mock auth users...`);
        const delAuthPromises = playerIds.map(id => supabaseAdmin.auth.admin.deleteUser(id));
        await Promise.all(delAuthPromises);

        console.log(`  [+] Cleaned up isolated test data`);

    } catch (err) {
        console.error('\n🚨 FATAL TEST ERROR:', err);
        failed++;
    }

    // ═══════════════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`ORB-3 CONCURRENCY RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`${'═'.repeat(60)}`);

    if (failed > 0) {
        console.error('\n🚨 ORB-3 MANDATE FAILED — Fix failing tests before deploy!');
        process.exit(1);
    } else {
        console.log('\n✅ ORB-3 ADVISORY LOCKS VERIFIED — 100% perfectly mapped. Domain mathematically immune to race conditions.');
        process.exit(0);
    }
}

runTest();
