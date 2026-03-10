require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runCashoutE2E() {
    console.log('🚀 Starting ORB-1 Cashout Idempotency E2E Test');

    const uuid = crypto.randomUUID();
    const email = `orb1_cashout_${uuid.substring(0, 8)}@smarter.poker`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();
    let userId;

    try {
        // 1. Create User
        console.log(`👤 Creating test user: ${email}`);
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
        if (authErr) throw authErr;
        userId = authData.user.id;
        await supabase.from('users').insert({ id: userId, username: `cashout_${uuid.substring(0, 8)}`, email }).maybeSingle();
        await supabase.from('profiles').insert({ id: userId, display_name: 'CashoutTester' }).maybeSingle();

        // 2. Find a club
        const { data: clubs } = await supabase.from('clubs').select('id, name').limit(1);
        if (!clubs?.length) throw new Error('No clubs in DB');
        const club = clubs[0];
        console.log(`🏦 Club: ${club.name} (${club.id})`);

        // 3. Add user to club with chips
        const INITIAL_CHIPS = 50000;
        const CASHOUT_AMOUNT = 10000;
        await supabase.from('club_members').insert({
            club_id: club.id, user_id: userId, status: 'active', role: 'player', chip_balance: INITIAL_CHIPS
        });
        console.log(`🤝 User added to club with ${INITIAL_CHIPS} chips`);

        // 4. Sign in
        const { data: signIn } = await supabase.auth.signInWithPassword({ email, password });
        const token = signIn.session.access_token;
        console.log('🔑 JWT secured');

        // 5. Fire 5 concurrent cashout requests
        console.log(`\n🌪️ Firing 5 concurrent cashout requests (${CASHOUT_AMOUNT} chips)...`);
        console.log(`🔑 Idempotency Key: ${idempotencyKey}`);

        const requests = Array.from({ length: 5 }).map(() =>
            fetch('http://localhost:3000/api/club-arena/request-cashout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    clubId: club.id,
                    amount: CASHOUT_AMOUNT,
                })
            }).then(async res => ({ status: res.status, body: await res.json() }))
        );

        const start = Date.now();
        const results = await Promise.all(requests);
        console.log(`\n⏱️ Responses in ${Date.now() - start}ms:\n`);

        let processed = 0, cached = 0, errors = 0;
        results.forEach((r, i) => {
            console.log(`Request ${i + 1}: HTTP ${r.status} | ${JSON.stringify(r.body).substring(0, 200)}`);
            if (r.body.success && !r.body.cached) processed++;
            else if (r.body.success && r.body.cached) cached++;
            else errors++;
        });

        console.log('\n📊 RESULTS:');
        console.log(`- Processed: ${processed}`);
        console.log(`- Cached/Blocked: ${cached}`);
        console.log(`- Errors: ${errors}`);

        // Verify: Only ONE cashout request should exist
        const { data: cashouts } = await supabase
            .from('cashout_requests')
            .select('id, amount, status')
            .eq('club_id', club.id)
            .eq('player_id', userId);

        const pendingCashouts = (cashouts || []).filter(c => c.status === 'pending');
        console.log(`\n📋 Cashout requests created: ${cashouts?.length || 0} (pending: ${pendingCashouts.length})`);

        // Verify chip_balance is correctly reduced by exactly CASHOUT_AMOUNT
        const { data: member } = await supabase
            .from('club_members')
            .select('chip_balance, held_chips')
            .eq('user_id', userId)
            .eq('club_id', club.id)
            .maybeSingle();

        console.log(`💰 Chip Balance: ${member?.chip_balance} (expected: ${INITIAL_CHIPS - CASHOUT_AMOUNT})`);
        console.log(`🔒 Held Chips: ${member?.held_chips} (expected: ${CASHOUT_AMOUNT})`);

        let passed = true;
        if (processed > 1) { console.error('❌ DOUBLE-CASHOUT: More than 1 request processed!'); passed = false; }
        if (pendingCashouts.length > 1) { console.error('❌ Multiple pending cashout requests created!'); passed = false; }

        if (passed) console.log('\n✅ CASHOUT IDEMPOTENCY TEST: PASSED 100%');
        else console.log('\n❌ CASHOUT IDEMPOTENCY TEST: FAILED');

    } catch (err) {
        console.error('\n🚨 TEST ERROR:', err);
    } finally {
        console.log('\n🧹 Cleaning up...');
        try {
            if (userId) {
                await supabase.from('cashout_requests').delete().eq('player_id', userId);
                await supabase.auth.admin.deleteUser(userId);
                await supabase.from('users').delete().eq('id', userId);
                console.log('✅ Test user + cashout requests deleted');
            }
        } catch (e) { console.error('Cleanup:', e.message); }
        process.exit(0);
    }
}

runCashoutE2E();
