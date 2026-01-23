/**
 * Reels API - Get Poker Reels from Social Feed
 * Pulls from social_reels table (same as social media feed)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback data when DB unavailable
const FALLBACK_REELS = [
    { id: 1, caption: "INSANE River Bluff at WSOP", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 1250000 },
    { id: 2, caption: "Phil Hellmuth LOSES IT", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 890000 },
    { id: 3, caption: "When You Flop the NUTS", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 654000 },
    { id: 4, caption: "Pocket Aces vs Kings - $100K Pot", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 2100000 },
    { id: 5, caption: "GTO Play That SHOCKED Everyone", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 432000 },
    { id: 6, caption: "HUGE Cooler at High Stakes", video_url: "https://www.youtube.com/shorts/dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", view_count: 780000 }
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { limit = 20, featured, sort = 'recent' } = req.query;

        // First fetch reels without join to avoid schema cache issues
        let query = supabase
            .from('social_reels')
            .select('*')
            .eq('is_public', true);

        // Sorting options
        if (sort === 'popular') {
            query = query.order('view_count', { ascending: false });
        } else if (sort === 'random') {
            query = query.order('created_at', { ascending: false });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        query = query.limit(parseInt(limit));

        const { data, error } = await query;

        if (error) {
            console.error('Reels API error:', error.message);
            return res.status(200).json({ success: true, data: FALLBACK_REELS.slice(0, parseInt(limit)) });
        }

        if (!data?.length) {
            return res.status(200).json({ success: true, data: FALLBACK_REELS.slice(0, parseInt(limit)) });
        }

        // Fetch profiles separately to avoid schema cache join errors
        const authorIds = [...new Set(data.map(r => r.author_id).filter(Boolean))];
        let profilesMap = {};

        if (authorIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', authorIds);

            if (profiles) {
                profilesMap = profiles.reduce((acc, p) => {
                    acc[p.id] = p;
                    return acc;
                }, {});
            }
        }

        // Transform data to include author info and extract title from caption
        let result = data.map(reel => {
            const profile = profilesMap[reel.author_id];
            return {
                ...reel,
                title: reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Reel',
                channel_name: profile?.full_name || profile?.username || 'Smarter.Poker',
                profiles: profile,
                author: profile
            };
        });

        // Shuffle if random sort requested
        if (sort === 'random') {
            result = result.sort(() => Math.random() - 0.5);
        }

        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('Reels API exception:', error.message);
        return res.status(200).json({ success: true, data: FALLBACK_REELS });
    }
}
