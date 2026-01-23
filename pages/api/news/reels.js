/**
 * Reels API - Get Poker Shorts/Reels
 * Auto-scraped from YouTube poker channels
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback data when DB unavailable
const FALLBACK_REELS = [
    { id: 1, title: "INSANE River Bluff at WSOP", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "PokerGO", view_count: 1250000 },
    { id: 2, title: "Phil Hellmuth LOSES IT", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "Poker Clips", view_count: 890000 },
    { id: 3, title: "When You Flop the NUTS", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "Doug Polk Poker", view_count: 654000 },
    { id: 4, title: "Pocket Aces vs Kings - $100K Pot", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "Hustler Casino Live", view_count: 2100000 },
    { id: 5, title: "GTO Play That SHOCKED Everyone", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "Upswing Poker", view_count: 432000 },
    { id: 6, title: "HUGE Cooler at High Stakes", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/oar2.jpg", channel_name: "PokerStars", view_count: 780000 }
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { limit = 20, channel, featured, sort = 'recent' } = req.query;

        let query = supabase
            .from('poker_reels')
            .select('*');

        // Sorting options
        if (sort === 'popular') {
            query = query.order('view_count', { ascending: false });
        } else if (sort === 'random') {
            // For random, we'll fetch more and shuffle client-side
            query = query.order('scraped_at', { ascending: false });
        } else {
            // Default: recent
            query = query.order('scraped_at', { ascending: false });
        }

        // Filter by channel if specified
        if (channel) {
            query = query.ilike('channel_name', `%${channel}%`);
        }

        // Filter featured reels if specified
        if (featured === 'true') {
            query = query.eq('is_featured', true);
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

        // Shuffle if random sort requested
        let result = data;
        if (sort === 'random') {
            result = data.sort(() => Math.random() - 0.5);
        }

        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error('Reels API exception:', error.message);
        return res.status(200).json({ success: true, data: FALLBACK_REELS });
    }
}
