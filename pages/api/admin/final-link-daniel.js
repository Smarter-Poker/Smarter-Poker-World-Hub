/**
 * 🔗 FINAL LINK - DELETE OLD, TRANSFER TO DANIEL
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const SYSTEM_ACCOUNT_UUID = '00000000-0000-0000-0000-000000000001';
    const DANIEL_UUID = '47965354-0e56-43ef-931c-ddaa882af765';

    try {
        // Step 1: Transfer all content FIRST
        console.log('🔗 Step 1: Transferring content ownership...');

        const reelsResult = await supabase.from('social_reels')
            .update({ author_id: DANIEL_UUID })
            .eq('author_id', SYSTEM_ACCOUNT_UUID);
        console.log('Reels:', reelsResult.error?.message || 'OK');

        const postsResult = await supabase.from('social_posts')
            .update({ author_id: DANIEL_UUID })
            .eq('author_id', SYSTEM_ACCOUNT_UUID);
        console.log('Posts:', postsResult.error?.message || 'OK');

        const streamsResult = await supabase.from('live_streams')
            .update({ broadcaster_id: DANIEL_UUID })
            .eq('broadcaster_id', SYSTEM_ACCOUNT_UUID);
        console.log('Streams:', streamsResult.error?.message || 'OK');

        // Step 2: Delete old system account to free up username
        console.log('🔗 Step 2: Removing old system account...');
        const deleteResult = await supabase
            .from('profiles')
            .delete()
            .eq('id', SYSTEM_ACCOUNT_UUID);
        console.log('Delete:', deleteResult.error?.message || 'OK');

        // Step 3: Update Daniel to SmarterPokerOfficial
        console.log('🔗 Step 3: Upgrading Daniel to SmarterPokerOfficial...');
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
            return res.status(500).json({
                error: 'Failed to upgrade Daniel profile',
                details: updateError.message
            });
        }

        console.log('✅ SUCCESS!');

        return res.status(200).json({
            success: true,
            message: '🎉 Daniel is now SmarterPokerOfficial!',
            profile: updated
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
