const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Check if deduct_diamonds exists with right signature
    const { data: deduct, error: deductErr } = await supabase.rpc('deduct_diamonds', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_amount: 1,
        p_description: 'test',
        p_transaction_type: 'diamond_gift_sent',
        p_source: null,
        p_metadata: {},
        p_reference_id: 'test-ref',
        p_cooldown_seconds: 0
    });
    console.log('deduct_diamonds:', deductErr ? `ERROR: ${deductErr.message} (${deductErr.code})` : JSON.stringify(deduct));

    // Check if add_diamonds_to_balance has p_type param
    const { data: add, error: addErr } = await supabase.rpc('add_diamonds_to_balance', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_amount: 0,
        p_type: 'diamond_gift_received',
        p_description: 'test',
        p_reference_id: 'test-ref-2',
    });
    console.log('add_diamonds_to_balance:', addErr ? `ERROR: ${addErr.message} (${addErr.code})` : JSON.stringify(add));

    // Check get_source_tier_available
    const { data: tier, error: tierErr } = await supabase.rpc('get_source_tier_available', {
        p_user_id: '00000000-0000-0000-0000-000000000000'
    });
    console.log('get_source_tier_available:', tierErr ? `ERROR: ${tierErr.message} (${tierErr.code})` : JSON.stringify(tier));

    // Check sum_diamond_transactions
    const { data: sum, error: sumErr } = await supabase.rpc('sum_diamond_transactions', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_types: ['diamond_gift_sent'],
        p_start: new Date(Date.now() - 86400000).toISOString(),
    });
    console.log('sum_diamond_transactions:', sumErr ? `ERROR: ${sumErr.message} (${sumErr.code})` : JSON.stringify(sum));

    // Check anti_farming_ips table
    const { data: ips, error: ipsErr } = await supabase.from('anti_farming_ips').select('id').limit(1);
    console.log('anti_farming_ips table:', ipsErr ? `ERROR: ${ipsErr.message}` : `OK (found ${(ips||[]).length} rows)`);

    process.exit(0);
})();

// Now test the actual friendships query the transfer API uses
(async () => {
    // Test real user - use a known existing user
    const { data: users } = await supabase.from('profiles').select('id, display_name, diamonds').order('created_at', { ascending: true }).limit(3);
    console.log('\nSample users:', JSON.stringify(users?.map(u => ({ id: u.id, name: u.display_name, diamonds: u.diamonds }))));
    
    if (users && users.length >= 2) {
        const user1 = users[0];
        const user2 = users[1];
        
        // Check friendship between first two users
        const { data: friendships, error: friendErr } = await supabase
            .from('friendships')
            .select('id, status, created_at')
            .or(`and(user_id.eq.${user1.id},friend_id.eq.${user2.id}),and(user_id.eq.${user2.id},friend_id.eq.${user1.id})`)
            .eq('status', 'accepted')
            .limit(1);
        console.log('Friendship check:', friendErr ? `ERROR: ${friendErr.message}` : JSON.stringify(friendships));
        
        // Now simulate a real transfer attempt
        console.log('\nSimulating transfer from', user1.display_name, 'to', user2.display_name);
        const { data: deductTest, error: dtErr } = await supabase.rpc('deduct_diamonds', {
            p_user_id: user1.id,
            p_amount: 0, // zero - shouldn't deduct anything
            p_description: 'Test transfer',
            p_transaction_type: 'diamond_gift_sent',
            p_source: null,
            p_metadata: { recipient_id: user2.id },
            p_reference_id: `test_${Date.now()}`,
            p_cooldown_seconds: 0
        });
        console.log('deduct_diamonds (0 amount):', dtErr ? `ERROR: ${dtErr.message} (${dtErr.code})` : JSON.stringify(deductTest));
    }
    process.exit(0);
})();
