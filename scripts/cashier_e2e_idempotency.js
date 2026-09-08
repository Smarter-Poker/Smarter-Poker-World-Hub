require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runIdempotencyE2E() {
    console.log('Starting ORB-1 Escrow Idempotency E2E Test');

    const uuid = crypto.randomUUID();
    const email = `orb1_test_user_${uuid}@smarter.poker`;
    const username = `orb1_${uuid.substring(0, 8)}`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();

    console.log(`Creating test tenant: ${email} (${username})`);

    try {
        // 1. Create User
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });
        if (authErr) throw authErr;

        const user = authData.user;
        console.log(`User created in auth.users (ID: ${user.id})`);

        // Initialize public tables explicitly to bypass missing triggers
        console.log('Initializing public.users and profiles...');
        await supabase.from('users').insert({ id: user.id, username, email }).maybeSingle();
        await supabase.from('profiles').insert({ id: user.id, display_name: username }).maybeSingle();

        // 2. Fund Profile with Diamonds - through the Mint, never a direct
        // balance write (Diamond Accounting Standard DR2/DR6: a balance that
        // appears without a register row is the defect the standard exists to
        // catch, and a harness that writes one teaches the alarms to ignore it).
        const { data: minted, error: fundErr } = await supabase.rpc('fn_ca_mint', {
            p_asset: 'diamonds',
            p_destination: 'player',
            p_target_id: user.id,
            p_amount: 100000,
            p_reason: 'Cashier idempotency E2E: fixture funding',
            p_op_id: `cashier-e2e-fund:${user.id}`,
            p_class: 'admin',
        });
        if (fundErr) throw new Error(`Profile fund failed: ${fundErr.message}`);
        if (!minted || (minted.ok !== true && minted.replayed !== true)) {
            throw new Error(`Profile fund refused: ${JSON.stringify(minted)}`);
        }
        console.log('Funded profile with 100,000 diamonds through fn_ca_mint');

        // 3. Find a target club
        const { data: clubs } = await supabase.from('clubs').select('id, name').limit(1);
        if (!clubs || clubs.length === 0) throw new Error('No clubs found in DB to test with');
        const club = clubs[0];
        console.log(`Selected test club: ${club.name} (${club.id})`);

        // 4. Add user to club
        const { error: clubErr } = await supabase.from('club_members').insert({
            club_id: club.id,
            user_id: user.id,
            status: 'active',
            role: 'player',
            chip_balance: 0
        });
        if (clubErr) throw new Error(`Club Member Insert Failed: ${JSON.stringify(clubErr)}`);
        console.log('Added user to club as active player');

        // 5. Get User JWT by signing in
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (signInErr) throw signInErr;
        const token = signInData.session.access_token;
        console.log('Secured JWT session token');

        // 6. Fire 5 Concurrent POST requests
        console.log(`\nFiring 5 concurrent buy-in requests (5000 chips)...`);
        console.log(`Idempotency Key: ${idempotencyKey}`);

        const requests = Array.from({ length: 5 }).map((_, i) =>
            fetch('http://localhost:3000/api/club-arena/buyin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    clubId: club.id,
                    chipAmount: 5000
                })
            }).then(async res => {
                const body = await res.json();
                return { status: res.status, body };
            })
        );

        const startTime = Date.now();
        const results = await Promise.all(requests);
        const endTime = Date.now();

        console.log(`\nResponses received in ${endTime - startTime}ms:\n`);

        let processedCount = 0;
        let cachedCount = 0;
        let errorCount = 0;

        results.forEach((res, i) => {
            console.log(`Request ${i + 1}: HTTP ${res.status} | Response:`, res.body);
            if (res.body.success && !res.body.cached) processedCount++;
            else if (res.body.success && res.body.cached) cachedCount++;
            else if (!res.body.success && res.body.error === 'Concurrent transaction lock failed') cachedCount++;
            else errorCount++;
        });

        console.log('\nRESULTS SUMMARY:');
        console.log(`- Processed (Charged): ${processedCount}`);
        console.log(`- Blocked/Cached (Idempotent): ${cachedCount}`);
        console.log(`- Errors: ${errorCount}`);

        // Verify final balances
        const { data: finalProfile, error: fpErr } = await supabase.from('profiles').select('diamonds').eq('id', user.id).maybeSingle();
        const { data: finalMember, error: fmErr } = await supabase.from('club_members').select('chip_balance').eq('user_id', user.id).eq('club_id', club.id).maybeSingle();

        if (fpErr || fmErr) throw new Error(`Fetch Balance Errors: ${JSON.stringify(fpErr || fmErr)}`);

        const expectedDiamonds = 100000 - Math.ceil((5000 / 100) * 38);

        console.log('\nFINAL BALANCES:');
        console.log(`Diamonds: ${finalProfile.diamonds} (Expected: 98100 | Start: 100000)`);
        console.log(`Chips: ${finalMember.chip_balance} (Expected: 5000 | Start: 0)`);

        let passed = true;
        if (processedCount !== 1) {
            console.error('FAILED: More or less than ONE request processed.');
            passed = false;
        }
        if (finalProfile.diamonds !== expectedDiamonds) {
            console.error('FAILED: Diamonds were double-deducted or incorrect!');
            passed = false;
        }
        if (finalMember.chip_balance !== 5000) {
            console.error('FAILED: Chips were double-credited or incorrect!');
            passed = false;
        }

        if (passed) {
            console.log('\nE2E IDEMPOTENCY TEST: PASSED 100%');
        }

    } catch (err) {
        console.error('\nTEST ERROR:', err);
    } finally {
        console.log('\nCleaning up test user...');
        try {
            if (email) {
                const { data } = await supabase.auth.admin.listUsers();
                const u = data.users.find(x => x.email === email);
                if (u) {
                    await supabase.auth.admin.deleteUser(u.id);
                    // Clean up users row (auth deletion usually cascades, but just in case)
                    await supabase.from('users').delete().eq('id', u.id);
                    console.log('Test user deleted');
                }
            }
        } catch (e) { console.error('Cleanup failed:', e.message); }
        process.exit(0);
    }
}

runIdempotencyE2E();
