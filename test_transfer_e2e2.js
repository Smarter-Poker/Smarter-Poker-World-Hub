const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Get Dan Bekavac directly by known ID from earlier test  
    const danId = '47965354-0e56-43ef-931c-ddaab82af765';
    const johnId = '1ed711e3-33bb-40e5-ac06-7d3e67fe3484';
    
    // Check emailVerifiedGate behavior
    const { data: danAuth, error: danAuthErr } = await supabase.auth.admin.getUserById(danId);
    console.log('getUserById (Dan):', danAuthErr ? `ERROR: ${danAuthErr.message} [${danAuthErr.status}]` : `email_confirmed_at: ${danAuth?.user?.email_confirmed_at}`);
    
    // Check friends list for Dan
    const { data: f1 } = await supabase.from('friendships').select('friend_id').eq('user_id', danId).eq('status', 'accepted').limit(10);
    const { data: f2 } = await supabase.from('friendships').select('user_id').eq('friend_id', danId).eq('status', 'accepted').limit(10);
    
    const friends = [...(f1?.map(r => r.friend_id) || []), ...(f2?.map(r => r.user_id) || [])];
    console.log('\nDan total friends count:', friends.length);
    console.log('Friend IDs sample:', friends.slice(0, 3));
    
    // Check if friendship between Dan and John exists
    const { data: danJohnFriendship } = await supabase
        .from('friendships')
        .select('id, status')
        .or(`and(user_id.eq.${danId},friend_id.eq.${johnId}),and(user_id.eq.${johnId},friend_id.eq.${danId})`)
        .eq('status', 'accepted')
        .limit(1);
    console.log('\nDan-John friendship:', JSON.stringify(danJohnFriendship));
    
    // Verify transfer RPC call with real amounts
    const { data: deductData, error: deductErr } = await supabase.rpc('deduct_diamonds', {
        p_user_id: danId,
        p_amount: 10,
        p_description: `Sent 10 diamonds to John [${johnId}]`,
        p_transaction_type: 'diamond_gift_sent',
        p_source: null,
        p_metadata: { recipient_id: johnId },
        p_reference_id: `transfer_deduct_TEST_${Date.now()}`,
        p_cooldown_seconds: 60
    });
    console.log('\ndeduct_diamonds (10 to John):', deductErr ? `ERROR: ${deductErr.message}` : JSON.stringify(deductData));
    
    // Rollback immediately if deduct succeeded
    if (deductData?.success) {
        const { error: refundErr } = await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: danId,
            p_amount: 10,
            p_type: 'diamond_gift_refund',
            p_description: 'Test refund',
            p_reference_id: `transfer_refund_TEST_${Date.now()}`,
        });
        console.log('Refund:', refundErr ? `ERROR: ${refundErr.message}` : 'OK');
    }
    
    process.exit(0);
})();
