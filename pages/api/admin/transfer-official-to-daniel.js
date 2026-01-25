/**
 * 🔗 TRANSFER OFFICIAL CONTENT TO DANIEL
 * Gives Daniel god role and transfers all system account content to him
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
        console.log('🔗 Step 1: Upgrading Daniel profile to SmarterPokerOfficial...');

        // Update Daniel's profile with Official branding
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
                error: 'Failed to update Daniel profile',
                details: updateError.message
            });
        }

        console.log('✅ Daniel is now SmarterPokerOfficial');

        // Transfer all content from old system account to Daniel
        console.log('🔗 Step 2: Transferring content ownership...');

        const reelsResult = await supabase.from('social_reels')
            .update({ author_id: DANIEL_UUID })
            .eq('author_id', SYSTEM_ACCOUNT_UUID);
        console.log('Reels transfer:', reelsResult.error?.message || 'SUCCESS');

        const postsResult = await supabase.from('social_posts')
            .update({ author_id: DANIEL_UUID })
            .eq('author_id', SYSTEM_ACCOUNT_UUID);
        console.log('Posts transfer:', postsResult.error?.message || 'SUCCESS');

        const streamsResult = await supabase.from('live_streams')
            .update({ broadcaster_id: DANIEL_UUID })
            .eq('broadcaster_id', SYSTEM_ACCOUNT_UUID);
        console.log('Streams transfer:', streamsResult.error?.message || 'SUCCESS');

        // Delete old system profile
        console.log('🔗 Step 3: Removing old system account...');
        const deleteResult = await supabase
            .from('profiles')
            .delete()
            .eq('id', SYSTEM_ACCOUNT_UUID);
        console.log('Delete old account:', deleteResult.error?.message || 'SUCCESS');

        // Verify
        const { data: verification } = await supabase
            .from('profiles')
            .select('id, username, full_name, role')
            .eq('id', DANIEL_UUID)
            .single();

        return res.status(200).json({
            success: true,
            message: '🎉 Daniel is now SmarterPokerOfficial!',
            profile: verification,
            transfers: {
                reels: !reelsResult.error,
                posts: !postsResult.error,
                streams: !streamsResult.error
            }
        });

    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
