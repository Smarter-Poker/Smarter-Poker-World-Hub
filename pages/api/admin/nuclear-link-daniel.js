/**
 * 🔗 NUCLEAR LINK - HANDLE ALL FK CONSTRAINTS
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';
    const DANIEL_UUID = '47965354-0e56-43ef-931c-ddaa882af765';
    const logs = [];

    try {
        // Step 1: Delete all friendships referencing system account
        logs.push('Step 1: Deleting friendships...');
        await supabase.from('friendships').delete().eq('user_id', SYSTEM_UUID);
        await supabase.from('friendships').delete().eq('friend_id', SYSTEM_UUID);
        logs.push('✓ Friendships deleted');

        // Step 2: Delete notifications
        logs.push('Step 2: Deleting notifications...');
        await supabase.from('notifications').delete().eq('user_id', SYSTEM_UUID);
        await supabase.from('notifications').delete().eq('actor_id', SYSTEM_UUID);
        logs.push('✓ Notifications deleted');

        // Step 3: Delete likes/comments
        logs.push('Step 3: Deleting social interactions...');
        await supabase.from('social_likes').delete().eq('user_id', SYSTEM_UUID);
        await supabase.from('social_comments').delete().eq('author_id', SYSTEM_UUID);
        logs.push('✓ Interactions deleted');

        // Step 4: Delete posts (can't transfer due to FK)
        logs.push('Step 4: Deleting posts...');
        await supabase.from('social_posts').delete().eq('author_id', SYSTEM_UUID);
        logs.push('✓ Posts deleted');

        // Step 5: Transfer reels
        logs.push('Step 5: Transferring reels...');
        await supabase.from('social_reels').update({ author_id: DANIEL_UUID }).eq('author_id', SYSTEM_UUID);
        logs.push('✓ Reels transferred');

        // Step 6: Transfer streams
        logs.push('Step 6: Transferring streams...');
        await supabase.from('live_streams').update({ broadcaster_id: DANIEL_UUID }).eq('broadcaster_id', SYSTEM_UUID);
        logs.push('✓ Streams transferred');

        // Step 7: Delete followers
        logs.push('Step 7: Deleting followers...');
        await supabase.from('followers').delete().eq('follower_id', SYSTEM_UUID);
        await supabase.from('followers').delete().eq('following_id', SYSTEM_UUID);
        logs.push('✓ Followers deleted');

        // Step 8: Delete old system account
        logs.push('Step 8: Deleting old system account...');
        const del = await supabase.from('profiles').delete().eq('id', SYSTEM_UUID);
        logs.push(del.error ? `✗ Delete failed: ${del.error.message}` : '✓ System account deleted');

        // Step 9: Update Daniel to SmarterPokerOfficial
        logs.push('Step 9: Upgrading Daniel...');
        const { data: updated, error: updateError } = await supabase
            .from('profiles')
            .update({
                username: 'SmarterPokerOfficial',
                full_name: 'Smarter Poker Official',
                role: 'god'
            })
            .eq('id', DANIEL_UUID)
            .select()
            .single();

        if (updateError) {
            logs.push(`✗ Upgrade failed: ${updateError.message}`);
            return res.status(500).json({ logs, error: updateError.message });
        }
        logs.push('✅ SUCCESS! Daniel is now SmarterPokerOfficial!');

        return res.status(200).json({
            success: true,
            logs,
            profile: updated
        });

    } catch (error) {
        logs.push(`❌ Error: ${error.message}`);
        return res.status(500).json({ logs, error: error.message });
    }
}
