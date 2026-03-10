require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    const testEmail = `orb1_test_user_${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();
    let userId = null;

    try {
        console.log('1. Finding a valid club...');
        const { data: club } = await supabaseAdmin.from('clubs').select('id').limit(1).single();
        if (!club) throw new Error('No club found to test with.');

        console.log('2. Generating test tenant...', testEmail);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: testEmail,
            password,
            email_confirm: true
        });
        if (authErr) throw authErr;
        userId = authData.user.id;

        console.log('3. Funding test tenant with diamonds and club membership...');
        let profileReady = false;
        for (let i = 0; i < 10; i++) {
            const { data } = await supabaseAdmin.from('profiles').select('id').eq('id', userId).maybeSingle();
            if (data) { profileReady = true; break; }
            await new Promise(r => setTimeout(r, 1000));
        }
        if (!profileReady) {
            console.log(' - Forcing profile insert (trigger delay)...');
            await supabaseAdmin.from('profiles').insert({ id: userId, username: 'test_' + Date.now(), diamond_balance: 1000 });
        } else {
            console.log(' - Profile found. Updating diamonds...');
            await supabaseAdmin.from('profiles').update({ diamond_balance: 1000 }).eq('id', userId);
        }
        await supabaseAdmin.from('club_members').insert({
            club_id: club.id,
            user_id: userId,
            role: 'player',
            chip_balance: 0,
            status: 'active'
        });

        console.log('4. Authenticating to get JWT token...');
        const { data: loginData } = await supabaseAdmin.auth.signInWithPassword({ email: testEmail, password });
        const token = loginData.session.access_token;

        console.log(`5. Firing 5 concurrent POST requests to /api/club-arena/buyin...`);
        console.log(`Idempotency Key: ${idempotencyKey}`);

        const payload = { clubId: club.id, chipAmount: 500 }; // Cost is 190 diamonds

        // Fire 5 requests in parallel using Node 18+ native fetch
        const promises = Array.from({ length: 5 }).map((_, i) => {
            return fetch('http://localhost:3000/api/club-arena/buyin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify(payload)
            }).then(res => res.json());
        });

        const results = await Promise.all(promises);

        console.log('\n--- RESULTS ---');
        let successfulTransactions = 0;
        let cachedResponses = 0;

        results.forEach((res, i) => {
            console.log(`Request ${i + 1}:`, res.success ? '✅ SUCCESS' : `❌ FAILED: ${res.error}`, res.cached ? '(CACHED)' : '');
            if (res.success && !res.cached) successfulTransactions++;
            if (res.success && res.cached) cachedResponses++;
        });

        console.log(`\nValid Transactions Processes: ${successfulTransactions} (Expected: 1)`);
        console.log(`Cached Responses Returned: ${cachedResponses} (Expected: 4)`);

        // Verify DB balances
        const { data: profile } = await supabaseAdmin.from('profiles').select('diamonds').eq('id', userId).single();
        const { data: member } = await supabaseAdmin.from('club_members').select('chip_balance').eq('club_id', club.id).eq('user_id', userId).single();

        console.log(`\nFinal Diamond Balance: ${profile.diamonds} (Expected: 810)`);
        console.log(`Final Chip Balance: ${member.chip_balance} (Expected: 500)`);

        if (successfulTransactions !== 1 || cachedResponses !== 4 || profile.diamonds !== 810 || member.chip_balance !== 500) {
            console.error('\n❌ E2E IDEMPOTENCY TEST FAILED!');
            process.exitCode = 1;
        } else {
            console.log('\n✅ E2E IDEMPOTENCY TEST PASSED 100%!');
        }

    } catch (err) {
        console.error('Test Error:', err);
        process.exitCode = 1;
    } finally {
        if (userId) {
            console.log('\nCleaning up test tenant...');
            await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        process.exit();
    }
}

run();
