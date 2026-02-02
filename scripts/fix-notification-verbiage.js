/**
 * Apply Notification Verbiage Fixes
 * Run: node scripts/fix-notification-verbiage.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log('🔧 Fixing notification verbiage...\n');

    // 1. Fix friend request notifications with broken text
    const { data: d1, error: e1 } = await supabase
        .from('notifications')
        .update({ message: 'sent you a friend request' })
        .eq('type', 'friend_request')
        .ilike('message', '%accept%')
        .select('id');

    console.log('Fixed "accept" text:', d1?.length || 0, 'notifications');
    if (e1) console.log('  Error:', e1.message);

    // 2. Fix "become friends" text
    const { data: d2, error: e2 } = await supabase
        .from('notifications')
        .update({ message: 'sent you a friend request' })
        .eq('type', 'friend_request')
        .ilike('message', '%become friends%')
        .select('id');

    console.log('Fixed "become friends" text:', d2?.length || 0, 'notifications');
    if (e2) console.log('  Error:', e2.message);

    // 3. Fix notifications where title has full sentence
    const { data: allFriendReqs } = await supabase
        .from('notifications')
        .select('id, title, message')
        .eq('type', 'friend_request');

    let fixedTitles = 0;
    for (const n of (allFriendReqs || [])) {
        if (n.title?.includes(' sent you a friend request')) {
            const newTitle = n.title.replace(' sent you a friend request', '');
            await supabase
                .from('notifications')
                .update({ title: newTitle, message: 'sent you a friend request' })
                .eq('id', n.id);
            fixedTitles++;
        }
    }
    console.log('Fixed title format:', fixedTitles, 'notifications');

    // 4. Check for any friend_accept with wrong text
    const { data: d4, error: e4 } = await supabase
        .from('notifications')
        .update({ message: 'accepted your friend request' })
        .eq('type', 'friend_accept')
        .or('message.ilike.%is now your friend%,message.is.null')
        .select('id');

    console.log('Fixed friend_accept text:', d4?.length || 0, 'notifications');
    if (e4) console.log('  Error:', e4.message);

    console.log('\n✅ Done! Now apply the trigger via Supabase Dashboard SQL Editor:');
    console.log('   File: supabase/migrations/20260125_fix_notification_verbiage.sql');
}

run().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
