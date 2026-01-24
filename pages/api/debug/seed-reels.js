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

// Sample poker YouTube Shorts
const SAMPLE_REELS = [
    { youtube_id: 'KpF-1SQtPfE', title: 'INSANE River Bluff at WSOP', channel: 'PokerGO', views: 1250000 },
    { youtube_id: 'Jrz6GJT_Vsk', title: 'Phil Hellmuth LOSES IT', channel: 'Doug Polk', views: 890000 },
    { youtube_id: 'qPHy_gXPqJE', title: 'When You Flop the NUTS', channel: 'Brad Owen', views: 654000 },
    { youtube_id: 'B-8WMXRZ0p4', title: 'Pocket Aces vs Kings - $100K Pot', channel: 'Hustler Casino', views: 2100000 },
    { youtube_id: '6fBj0LI6O4g', title: 'GTO Play That SHOCKED Everyone', channel: 'Jonathan Little', views: 432000 },
    { youtube_id: 'mC7EuZS6VXk', title: 'HUGE Cooler at High Stakes', channel: 'PokerStars', views: 780000 },
    { youtube_id: 'TYz8RWbB1Xo', title: 'When Amateurs Outplay Pros', channel: 'Rampage Poker', views: 560000 },
    { youtube_id: 'pvd5yYvJrKw', title: 'The BIGGEST Bluff in Poker History', channel: 'PokerGO', views: 3200000 },
    { youtube_id: 'C9mV9vqvBYg', title: 'How to Read Your Opponents', channel: 'Upswing Poker', views: 420000 },
    { youtube_id: 'x_HkBwCJVA0', title: 'Tournament Strategy Secrets', channel: 'Daniel Negreanu', views: 670000 }
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

        // Get existing reels to avoid duplicates
        const { data: existingReels } = await supabase
            .from('social_reels')
            .select('video_url');

        const existingUrls = new Set(existingReels?.map(r => r.video_url) || []);

        // Seed reels
        const results = [];
        for (const reel of SAMPLE_REELS) {
            const video_url = `https://www.youtube.com/shorts/${reel.youtube_id}`;

            if (existingUrls.has(video_url)) {
                results.push({ youtube_id: reel.youtube_id, status: 'skipped', reason: 'exists' });
                continue;
            }

            const { data, error } = await supabase
                .from('social_reels')
                .insert({
                    author_id: SYSTEM_UUID,
                    video_url,
                    caption: `🎬 ${reel.title}\n\n📺 From: ${reel.channel}\n#poker #pokershorts`,
                    thumbnail_url: `https://i.ytimg.com/vi/${reel.youtube_id}/oar2.jpg`,
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
            reels_seeded: results.filter(r => r.status === 'created').length,
            reels_skipped: results.filter(r => r.status === 'skipped').length,
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
