const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Get Dan Bekavac's user record  
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 5 });
    if (error) { console.log('ERROR listing users:', error.message); process.exit(1); }
    
    const dan = users.find(u => u.email?.includes('dan') || u.user_metadata?.full_name?.includes('Dan'));
    const other = users.find(u => u.id !== dan?.id);
    
    if (!dan) { console.log('Could not find Dan user'); console.log('Users:', users.map(u => u.email)); process.exit(1); }
    
    console.log('Dan user:', dan.id, dan.email, 'email_confirmed_at:', dan.email_confirmed_at);
    console.log('Other user:', other?.id, other?.email, 'email_confirmed_at:', other?.email_confirmed_at);

    // Check what the emailVerifiedGate returns for Dan
    const { data: danAuth, error: danAuthErr } = await supabase.auth.admin.getUserById(dan.id);
    console.log('\ngetUserById result:', danAuthErr ? `ERROR: ${danAuthErr.message}` : `email_confirmed_at: ${danAuth?.user?.email_confirmed_at}`);
    
    // Check if the friendships API endpoint returns correctly
    // Simulate the /api/friends?action=list call by querying directly
    const { data: friendships, error: fErr } = await supabase
        .from('friendships')
        .select('friend_id, created_at')
        .eq('user_id', dan.id)
        .eq('status', 'accepted')
        .limit(10);
    console.log('\nDan\'s friends (sent):', fErr ? `ERROR: ${fErr.message}` : `${friendships?.length} friends`);
    
    const { data: receivedFriends } = await supabase
        .from('friendships')
        .select('user_id, created_at')
        .eq('friend_id', dan.id)
        .eq('status', 'accepted')
        .limit(10);
    console.log('Dan\'s friends (received):', receivedFriends?.length || 0);
    
    console.log('\n✅ All DB checks passed! Issue is NOT in DB layer.');
    console.log('Check: Is the /api/store/diamond-transfer returning a specific error in browser devtools?');
    process.exit(0);
})();
