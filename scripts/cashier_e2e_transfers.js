require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTransferE2E() {
    console.log('🚀 Starting ORB-1 Transfer Idempotency E2E Test');

    const uuid1 = crypto.randomUUID();
    const uuid2 = crypto.randomUUID();
    const email1 = `orb1_sender_${uuid1.substring(0, 8)}@smarter.poker`;
    const email2 = `orb1_receiver_${uuid2.substring(0, 8)}@smarter.poker`;
    const password = 'TestPassword123!';
    const idempotencyKey = crypto.randomUUID();

    let userId1, userId2;

    try {
        // 1. Create Sender
        console.log(`👤 Creating sender: ${email1}`);
        const { data: auth1, error: e1 } = await supabase.auth.admin.createUser({ email: email1, password, email_confirm: true });
        if (e1) throw e1;
        userId1 = auth1.user.id;
        await supabase.from('users').insert({ id: userId1, username: `sender_${uuid1.substring(0, 8)}`, email: email1 }).maybeSingle();
        await supabase.from('profiles').insert({ id: userId1, display_name: 'Sender' }).maybeSingle();

        // 2. Create Receiver
        console.log(`👤 Creating receiver: ${email2}`);
        const { data: auth2, error: e2 } = await supabase.auth.admin.createUser({ email: email2, password, email_confirm: true });
        if (e2) throw e2;
        userId2 = auth2.user.id;
        await supabase.from('users').insert({ id: userId2, username: `receiver_${uuid2.substring(0, 8)}`, email: email2 }).maybeSingle();
        await supabase.from('profiles').insert({ id: userId2, display_name: 'Receiver' }).maybeSingle();

        // 3. Find a club
        const { data: clubs } = await supabase.from('clubs').select('id, name').limit(1);
        if (!clubs?.length) throw new Error('No clubs in DB');
        const club = clubs[0];
        console.log(`🏦 Club: ${club.name} (${club.id})`);

        // 4. Add both to club with chips
        await supabase.from('club_members').insert({ club_id: club.id, user_id: userId1, status: 'active', role: 'player', chip_balance: 50000 });
        await supabase.from('club_members').insert({ club_id: club.id, user_id: userId2, status: 'active', role: 'player', chip_balance: 0 });
        console.log('🤝 Both users added to club (sender: 50,000 chips)');

        // 5. Sign in sender
        const { data: signIn } = await supabase.auth.signInWithPassword({ email: email1, password });
        const token = signIn.session.access_token;
        console.log('🔑 Sender JWT secured');

        // 6. Fire 5 concurrent transfers (same idempotency key, 10,000 chips each)
        const TRANSFER_AMOUNT = 10000;
        console.log(`\n🌪️ Firing 5 concurrent transfer requests (${TRANSFER_AMOUNT} chips)...`);
        console.log(`🔑 Idempotency Key: ${idempotencyKey}`);

        const requests = Array.from({ length: 5 }).map(() =>
            fetch('http://localhost:3000/api/club-arena/transfer-chips', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    clubId: club.id,
                    toUserId: userId2,
                    amount: TRANSFER_AMOUNT,
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

        // Verify balances
        const { data: s } = await supabase.from('club_members').select('chip_balance').eq('user_id', userId1).eq('club_id', club.id).maybeSingle();
        const { data: r } = await supabase.from('club_members').select('chip_balance').eq('user_id', userId2).eq('club_id', club.id).maybeSingle();

        console.log(`\n💰 Sender balance: ${s?.chip_balance} (expected: ${50000 - TRANSFER_AMOUNT})`);
        console.log(`💰 Receiver balance: ${r?.chip_balance} (expected: ${TRANSFER_AMOUNT})`);

        let passed = true;
        // The idempotency guard guards via the in-memory cache, so exactly 1 should process
        if (processed > 1) { console.error('❌ DOUBLE-CHARGE: More than 1 transfer processed!'); passed = false; }
        if (s?.chip_balance !== 50000 - TRANSFER_AMOUNT) { console.error('❌ Sender balance wrong!'); passed = false; }
        if (r?.chip_balance !== TRANSFER_AMOUNT) { console.error('❌ Receiver balance wrong!'); passed = false; }

        if (passed) console.log('\n✅ TRANSFER IDEMPOTENCY TEST: PASSED 100%');
        else console.log('\n❌ TRANSFER IDEMPOTENCY TEST: FAILED');

    } catch (err) {
        console.error('\n🚨 TEST ERROR:', err);
    } finally {
        console.log('\n🧹 Cleaning up...');
        try {
            if (userId1) { await supabase.auth.admin.deleteUser(userId1); await supabase.from('users').delete().eq('id', userId1); }
            if (userId2) { await supabase.auth.admin.deleteUser(userId2); await supabase.from('users').delete().eq('id', userId2); }
            console.log('✅ Test users deleted');
        } catch (e) { console.error('Cleanup:', e.message); }
        process.exit(0);
    }
}

runTransferE2E();
