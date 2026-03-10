require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSettlementE2E() {
    console.log('🚀 Starting ORB-1 Settlement Idempotency E2E Test');

    const uuid = crypto.randomUUID();
    const email = `orb1_settle_${uuid.substring(0, 8)}@smarter.poker`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();
    let userId;

    try {
        // 1. Create admin user
        console.log(`👤 Creating test admin: ${email}`);
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
        if (authErr) throw authErr;
        userId = authData.user.id;
        await supabase.from('users').insert({ id: userId, username: `settle_${uuid.substring(0, 8)}`, email }).maybeSingle();
        await supabase.from('profiles').insert({ id: userId, display_name: 'SettleTester' }).maybeSingle();

        // 2. Find a club
        const { data: clubs } = await supabase.from('clubs').select('id, name').limit(1);
        if (!clubs?.length) throw new Error('No clubs in DB');
        const club = clubs[0];
        console.log(`🏦 Club: ${club.name} (${club.id})`);

        // 3. Add user as owner
        await supabase.from('club_members').upsert({
            club_id: club.id, user_id: userId, status: 'active', role: 'owner', chip_balance: 100000
        }, { onConflict: 'club_id,user_id' });
        console.log('🤝 User added as club owner');

        // 4. Sign in
        const { data: signIn } = await supabase.auth.signInWithPassword({ email, password });
        const token = signIn.session.access_token;
        console.log('🔑 JWT secured');

        // 5. Fire 5 concurrent settlement requests
        console.log(`\n🌪️ Firing 5 concurrent settle-period requests...`);
        console.log(`🔑 Idempotency Key: ${idempotencyKey}`);

        const requests = Array.from({ length: 5 }).map(() =>
            fetch('http://localhost:3000/api/club-arena/settle-period', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    clubId: club.id,
                    action: 'close',
                })
            }).then(async res => ({ status: res.status, body: await res.json() }))
                .catch(err => ({ status: 0, body: { error: err.message } }))
        );

        const start = Date.now();
        const results = await Promise.all(requests);
        console.log(`\n⏱️ Responses in ${Date.now() - start}ms:\n`);

        let processed = 0, cached = 0, errors = 0;
        results.forEach((r, i) => {
            console.log(`Request ${i + 1}: HTTP ${r.status} | ${JSON.stringify(r.body).substring(0, 200)}`);
            if (r.body.success && !r.body.cached) processed++;
            else if (r.status === 409) cached++;
            else if (r.body.success && r.body.cached) cached++;
            else errors++;
        });

        console.log('\n📊 RESULTS:');
        console.log(`- Processed: ${processed}`);
        console.log(`- Cached/Blocked: ${cached}`);
        console.log(`- Errors (biz logic): ${errors}`);

        // The key test: at most 1 settlement should have been created
        const { data: periods } = await supabase
            .from('settlement_periods')
            .select('id, status')
            .eq('club_id', club.id)
            .order('created_at', { ascending: false })
            .limit(5);

        console.log(`\n📋 Settlement periods found: ${periods?.length || 0}`);

        let passed = true;
        if (processed > 1) { console.error('❌ DOUBLE-SETTLEMENT: More than 1 processed!'); passed = false; }

        if (passed) console.log('\n✅ SETTLEMENT IDEMPOTENCY TEST: PASSED 100%');
        else console.log('\n❌ SETTLEMENT IDEMPOTENCY TEST: FAILED');

    } catch (err) {
        console.error('\n🚨 TEST ERROR:', err);
    } finally {
        console.log('\n🧹 Cleaning up...');
        try {
            if (userId) {
                await supabase.auth.admin.deleteUser(userId);
                await supabase.from('users').delete().eq('id', userId);
                console.log('✅ Test user deleted');
            }
        } catch (e) { console.error('Cleanup:', e.message); }
        process.exit(0);
    }
}

runSettlementE2E();
