require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runIdempotencyE2E() {
    console.log('🚀 Starting ORB-1 Escrow Idempotency E2E Test');

    const uuid = crypto.randomUUID();
    const email = `orb1_test_user_${uuid}@smarter.poker`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();

    console.log(`👤 Creating test tenant: ${email}`);

    try {
        // 1. Create User
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });
        if (authErr) throw authErr;

        const user = authData.user;
        console.log(`✅ User created in auth.users (ID: ${user.id})`);

        // Wait for the auth trigger to create the users row
        console.log('⏳ Waiting for Auth triggers to replicate user to public.users...');
        let userInDb = false;
        for (let i = 0; i < 20; i++) {
            const { data } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
            if (data) { userInDb = true; break; }
            await delay(1000);
        }
        if (!userInDb) console.warn('⚠️ User not found in public.users - wait loop timed out. Proceeding anyway...');

        // Wait for profiles row
        console.log('⏳ Waiting for profiles table...');
        let profileInDb = false;
        for (let i = 0; i < 20; i++) {
            const { data } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
            if (data) { profileInDb = true; break; }
            await delay(1000);
        }
        if (!profileInDb) console.warn('⚠️ User not found in profiles - wait loop timed out.');

        // 2. Fund Profile with Diamonds
        const { error: fundErr } = await supabase.from('profiles').update({ diamonds: 100000 }).eq('id', user.id);
        if (fundErr) throw new Error(`Profile fund failed: ${fundErr.message}`);
        console.log('💎 Funded profile with 100,000 diamonds');

        // 3. Find a target club
        const { data: clubs } = await supabase.from('clubs').select('id, name').limit(1);
        if (!clubs || clubs.length === 0) throw new Error('No clubs found in DB to test with');
        const club = clubs[0];
        console.log(`🏦 Selected test club: ${club.name} (${club.id})`);

        // 4. Add user to club
        const { error: clubErr } = await supabase.from('club_members').insert({
            club_id: club.id,
            user_id: user.id,
            status: 'active',
            role: 'player',
            chip_balance: 0
        });
        if (clubErr) throw new Error(`Club Member Insert Failed: ${JSON.stringify(clubErr)}`);
        console.log('🤝 Added user to club as active player');

        // 5. Get User JWT by signing in
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (signInErr) throw signInErr;
        const token = signInData.session.access_token;
        console.log('🔑 Secured JWT session token');

        // 6. Fire 5 Concurrent POST requests
        console.log(`\n🌪️ Firing 5 concurrent buy-in requests (5000 chips)...`);
        console.log(`🔑 Idempotency Key: ${idempotencyKey}`);

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

        console.log(`\n⏱️ Responses received in ${endTime - startTime}ms:\n`);

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

        console.log('\n📊 RESULTS SUMMARY:');
        console.log(`- Processed (Charged): ${processedCount}`);
        console.log(`- Blocked/Cached (Idempotent): ${cachedCount}`);
        console.log(`- Errors: ${errorCount}`);

        // Verify final balances
        const { data: finalProfile, error: fpErr } = await supabase.from('profiles').select('diamonds').eq('id', user.id).single();
        const { data: finalMember, error: fmErr } = await supabase.from('club_members').select('chip_balance').eq('user_id', user.id).eq('club_id', club.id).single();

        if (fpErr || fmErr) throw new Error(`Fetch Balance Errors: ${JSON.stringify(fpErr || fmErr)}`);

        const expectedDiamonds = 100000 - Math.ceil((5000 / 100) * 38);

        console.log('\n💰 FINAL BALANCES:');
        console.log(`Diamonds: ${finalProfile.diamonds} (Expected: 98100 | Start: 100000)`);
        console.log(`Chips: ${finalMember.chip_balance} (Expected: 5000 | Start: 0)`);

        let passed = true;
        if (processedCount !== 1) {
            console.error('❌ FAILED: More or less than ONE request processed.');
            passed = false;
        }
        if (finalProfile.diamonds !== expectedDiamonds) {
            console.error('❌ FAILED: Diamonds were double-deducted or incorrect!');
            passed = false;
        }
        if (finalMember.chip_balance !== 5000) {
            console.error('❌ FAILED: Chips were double-credited or incorrect!');
            passed = false;
        }

        if (passed) {
            console.log('\n✅ E2E IDEMPOTENCY TEST: PASSED 100%');
        }

    } catch (err) {
        console.error('\n🚨 TEST ERROR:', err);
    } finally {
        console.log('\n🧹 Cleaning up test user...');
        try {
            if (email) {
                const { data } = await supabase.auth.admin.listUsers();
                const u = data.users.find(x => x.email === email);
                if (u) {
                    await supabase.auth.admin.deleteUser(u.id);
                    console.log('✅ Test user deleted');
                }
            }
        } catch (e) { console.error('Cleanup failed:', e.message); }
        process.exit(0);
    }
}

runIdempotencyE2E();
