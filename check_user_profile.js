const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Check Dan Bekavac profile
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', '47965354-0e56-43ef-931c-ddaab82af765')
        .single();
    if (error) {
        console.error('Error fetching Dan profile:', error);
    } else {
        console.log('Dan Profile:', {
            id: profile.id,
            display_name: profile.display_name,
            username: profile.username,
            created_at: profile.created_at,
            diamonds: profile.diamonds,
            is_farming_flagged: profile.is_farming_flagged
        });
    }

    // Check if there are other friends or test users
    const { data: friendsList, error: friendsErr } = await supabase
        .from('friendships')
        .select('*')
        .or('user_id.eq.47965354-0e56-43ef-931c-ddaab82af765,friend_id.eq.47965354-0e56-43ef-931c-ddaab82af765')
        .eq('status', 'accepted')
        .limit(5);
    console.log('Accepted friendships for Dan:', friendsList);

    process.exit(0);
})();
