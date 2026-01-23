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

        let query = supabase
            .from('social_reels')
            .select(`
                id,
                video_url,
                caption,
                thumbnail_url,
                duration_seconds,
                view_count,
                like_count,
                created_at,
                author_id,
                profiles!social_reels_author_id_fkey (
                    username,
                    full_name,
                    avatar_url
                )
            `)
            .eq('is_public', true);

        // Sorting options
        if (sort === 'popular') {
            query = query.order('view_count', { ascending: false });
        } else if (sort === 'random') {
            // For random, we'll fetch more and shuffle client-side
            query = query.order('created_at', { ascending: false });
        } else {
            // Default: recent
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

        // Transform data to include author info and extract title from caption
        let result = data.map(reel => ({
            ...reel,
            title: reel.caption?.split('\n')[0]?.replace(/^🎬\s*/, '') || 'Poker Reel',
            channel_name: reel.profiles?.full_name || reel.profiles?.username || 'Smarter.Poker',
            author: reel.profiles
        }));

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
