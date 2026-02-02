/**
 * 🔧 NUCLEAR UUID FIX - Delete FKs then recreate
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const OLD_UUID = '47965354-0e56-43ef-931c-ddaab82af765';
    const AUTH_UUID = '47965354-0e56-43ef-931c-ddaa882af765';
    const logs = [];

    try {
        // Step 1: Get original profile data FIRST
        logs.push('Step 1: Getting original KingFish profile...');
        const { data: original } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', OLD_UUID)
            .single();

        if (!original) {
            return res.status(404).json({ error: 'Original KingFish profile not found', logs });
        }
        logs.push(`✓ Found: ${original.username}`);

        // Step 2: DELETE all FK references (can't update, so delete)
        logs.push('Step 2: Deleting FK references...');

        await supabase.from('friendships').delete().eq('user_id', OLD_UUID);
        await supabase.from('friendships').delete().eq('friend_id', OLD_UUID);
        logs.push('✓ friendships');

        await supabase.from('followers').delete().eq('follower_id', OLD_UUID);
        await supabase.from('followers').delete().eq('following_id', OLD_UUID);
        logs.push('✓ followers');

        await supabase.from('social_posts').delete().eq('author_id', OLD_UUID);
        logs.push('✓ social_posts');

        await supabase.from('notifications').delete().eq('user_id', OLD_UUID);
        await supabase.from('notifications').delete().eq('actor_id', OLD_UUID);
        logs.push('✓ notifications');

        await supabase.from('social_interactions').delete().eq('user_id', OLD_UUID);
        logs.push('✓ social_interactions');

        await supabase.from('social_comments').delete().eq('author_id', OLD_UUID);
        logs.push('✓ social_comments');

        await supabase.from('social_likes').delete().eq('user_id', OLD_UUID);
        logs.push('✓ social_likes');

        await supabase.from('social_reels').delete().eq('author_id', OLD_UUID);
        logs.push('✓ social_reels');

        await supabase.from('live_streams').delete().eq('broadcaster_id', OLD_UUID);
        logs.push('✓ live_streams');

        await supabase.from('mentions').delete().eq('mentioned_user_id', OLD_UUID);
        await supabase.from('mentions').delete().eq('mentioned_by_id', OLD_UUID);
        logs.push('✓ mentions');

        // Step 3: Delete any profiles with AUTH_UUID
        logs.push('Step 3: Removing duplicate profiles...');
        await supabase.from('profiles').delete().eq('id', AUTH_UUID);
        logs.push('✓ duplicates removed');

        // Step 4: Delete old profile
        logs.push('Step 4: Deleting old UUID profile...');
        const { error: deleteError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', OLD_UUID);

        if (deleteError) {
            logs.push(`✗ Delete failed: ${deleteError.message}`);
            return res.status(500).json({ error: deleteError.message, logs });
        }
        logs.push('✓ old profile deleted');

        // Step 5: Create correct profile
        logs.push('Step 5: Creating profile with correct UUID...');
        const { data: fixed, error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: AUTH_UUID,
                username: original.username,
                full_name: original.full_name,
                email: original.email,
                phone: original.phone,
                city: original.city,
                state: original.state,
                country: original.country,
                bio: original.bio,
                diamonds: 454545,
                xp_total: 700010,
                total_xp: 700010,
                skill_tier: 'Legend',
                access_tier: 'Full_Access',
                role: 'god',
                email_verified: true,
                is_vip: true,
                streak_count: 55,
                avatar_url: original.avatar_url,
                hendon_url: original.hendon_url,
                hendon_total_cashes: original.hendon_total_cashes,
                hendon_total_earnings: original.hendon_total_earnings,
                hendon_best_finish: original.hendon_best_finish,
                hendon_biggest_cash: original.hendon_biggest_cash,
                hendon_last_scraped: original.hendon_last_scraped,
                home_casino: original.home_casino,
                favorite_game: original.favorite_game,
                favorite_hand: original.favorite_hand,
                birth_year: original.birth_year,
                player_number: original.player_number,
                display_name_preference: original.display_name_preference,
                twitter: original.twitter,
                instagram: original.instagram,
                website: original.website
            })
            .select()
            .single();

        if (insertError) {
            logs.push(`✗ Insert failed: ${insertError.message}`);
            return res.status(500).json({ error: insertError.message, logs });
        }
        logs.push('✅ FIXED!');

        return res.status(200).json({
            success: true,
            logs,
            profile: {
                id: fixed.id,
                username: fixed.username,
                diamonds: fixed.diamonds,
                xp_total: fixed.xp_total,
                role: fixed.role,
                is_vip: fixed.is_vip
            }
        });

    } catch (error) {
        logs.push(`❌ Error: ${error.message}`);
        return res.status(500).json({ error: error.message, logs });
    }
}
