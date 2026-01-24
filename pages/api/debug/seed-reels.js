/**
 * DEBUG: Seed reels for testing
 * Creates sample YouTube Shorts reels in social_reels table
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_KEY = SERVICE_ROLE_KEY || ANON_KEY;
const USING_SERVICE_ROLE = !!SERVICE_ROLE_KEY;

// REAL poker YouTube videos with verified thumbnails
const SAMPLE_REELS = [
    { youtube_id: '1TgwTjq2y_A', title: 'Epic Poker Showdown', channel: 'Poker.org', views: 1250000 },
    { youtube_id: 'x6rI6GhKQUY', title: 'High Stakes River Bluff', channel: 'Poker.org', views: 890000 },
    { youtube_id: 'fjFslQizb14', title: 'All-In With Pocket Aces', channel: 'Poker.org', views: 654000 },
    { youtube_id: 'MURTLr5w-GI', title: 'Tournament Final Table Action', channel: 'Poker.org', views: 2100000 },
    { youtube_id: 'XtPhm4V5Fk8', title: 'GTO Strategy In Action', channel: 'Poker.org', views: 432000 },
    { youtube_id: 'DqL1Qqij34k', title: 'Incredible Poker Read', channel: 'Poker.org', views: 780000 },
    { youtube_id: 'Hbaop9jqmfo', title: 'Cash Game Cooler', channel: 'Poker.org', views: 560000 },
    { youtube_id: '18ytnD3_S_I', title: 'Professional Poker Tips', channel: 'Poker.org', views: 3200000 },
    { youtube_id: 'Jjdet6EYshs', title: 'Hero Call at WSOP', channel: 'Poker.org', views: 420000 },
    { youtube_id: '4SIYm_SLY_k', title: 'Million Dollar Pot', channel: 'Poker.org', views: 670000 }
];

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

export default async function handler(req, res) {
    try {
        // Check env vars
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Missing Supabase environment variables',
                has_url: !!SUPABASE_URL,
                has_service_role_key: !!SERVICE_ROLE_KEY,
                has_anon_key: !!ANON_KEY
            });
        }

        // Warn if not using service role key (RLS will block inserts)
        if (!USING_SERVICE_ROLE) {
            return res.status(500).json({
                success: false,
                error: 'SUPABASE_SERVICE_ROLE_KEY not set - RLS will block inserts. Please add this env var in Vercel.',
                using_key: 'anon_key',
                hint: 'Go to Vercel > Project Settings > Environment Variables and add SUPABASE_SERVICE_ROLE_KEY'
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        // Check/create system account
        let { data: systemAccount, error: accountError } = await supabase
            .from('profiles')
            .select('id, username')
            .eq('id', SYSTEM_UUID)
            .maybeSingle();

        if (!systemAccount) {
            // Try to create system account
            const { data: newAccount, error: createError } = await supabase
                .from('profiles')
                .upsert({
                    id: SYSTEM_UUID,
                    username: 'smarter.poker',
                    full_name: 'Smarter.Poker',
                    email: 'system@smarter.poker',
                    xp_total: 999999,
                    skill_tier: 'System'
                }, { onConflict: 'id' })
                .select()
                .single();

            if (createError) {
                return res.status(500).json({
                    success: false,
                    error: `Failed to create system account: ${createError.message}`,
                    details: createError
                });
            }
            systemAccount = newAccount;
        }

        // Delete ALL existing reels first (clear fake data)
        const { error: deleteError, count: deletedCount } = await supabase
            .from('social_reels')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

        // Seed reels with REAL video IDs
        const results = [];
        for (const reel of SAMPLE_REELS) {
            // Use standard YouTube watch URL format (works for all videos)
            const video_url = `https://www.youtube.com/watch?v=${reel.youtube_id}`;
            // Use hqdefault.jpg - works for ALL YouTube videos, always exists
            const thumbnail_url = `https://img.youtube.com/vi/${reel.youtube_id}/hqdefault.jpg`;

            const { data, error } = await supabase
                .from('social_reels')
                .insert({
                    author_id: SYSTEM_UUID,
                    video_url,
                    caption: `🎬 ${reel.title}\n\n📺 From: ${reel.channel}\n#poker #pokershorts`,
                    thumbnail_url,
                    view_count: reel.views,
                    is_public: true
                })
                .select('id')
                .single();

            if (error) {
                results.push({ youtube_id: reel.youtube_id, status: 'error', error: error.message });
            } else {
                results.push({ youtube_id: reel.youtube_id, status: 'created', id: data?.id });
            }
        }

        // Verify reels count
        const { count } = await supabase
            .from('social_reels')
            .select('*', { count: 'exact', head: true })
            .eq('is_public', true);

        return res.status(200).json({
            success: true,
            system_account: systemAccount?.username,
            reels_deleted: deletedCount || 'all',
            reels_seeded: results.filter(r => r.status === 'created').length,
            reels_errors: results.filter(r => r.status === 'error').length,
            total_public_reels: count,
            details: results
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}
// Trigger redeploy 1769213891
