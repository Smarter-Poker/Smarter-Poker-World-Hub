/**
 * Videos API - Get Poker Videos
 * Auto-scraped from YouTube poker channels every 2 hours
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback data when DB unavailable
const FALLBACK_VIDEOS = [
    { id: 1, title: "WSOP 2025 Main Event Preview", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80", duration: "12:34", views: 45000, channel: "PokerGO" },
    { id: 2, title: "GTO Strategy Breakdown", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=400&q=80", duration: "8:22", views: 32000, channel: "Jonathan Little" },
    { id: 3, title: "Top 10 Poker Hands", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80", duration: "15:45", views: 28000, channel: "Doug Polk Poker" },
    { id: 4, title: "Live Cash Game Session", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80", duration: "45:12", views: 18000, channel: "Upswing Poker" },
    { id: 5, title: "Phil Hellmuth Best Moments", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=400&q=80", duration: "22:18", views: 125000, channel: "Poker Clips" },
    { id: 6, title: "How to Play Pocket Aces", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400&q=80", duration: "18:45", views: 67000, channel: "Daniel Negreanu" },
    { id: 7, title: "Tournament Strategy Guide", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1609743522653-52354461eb27?w=400&q=80", duration: "35:20", views: 89000, channel: "Jonathan Little" },
    { id: 8, title: "Online Poker Tips 2025", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1517232115160-ff93364542dd?w=400&q=80", duration: "14:55", views: 42000, channel: "Upswing Poker" }
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { limit = 20, featured, channel } = req.query;

        let query = supabase
            .from('poker_videos')
            .select('*')
            .order('scraped_at', { ascending: false })
            .order('published_at', { ascending: false })
            .limit(parseInt(limit));

        // Filter by channel if specified
        if (channel) {
            query = query.ilike('channel', `%${channel}%`);
        }

        // Filter featured videos if specified
        if (featured === 'true') {
            query = query.eq('is_featured', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Videos API error:', error.message);
            return res.status(200).json({ success: true, data: FALLBACK_VIDEOS.slice(0, parseInt(limit)) });
        }

        if (!data?.length) {
            return res.status(200).json({ success: true, data: FALLBACK_VIDEOS.slice(0, parseInt(limit)) });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Videos API exception:', error.message);
        return res.status(200).json({ success: true, data: FALLBACK_VIDEOS });
    }
}
