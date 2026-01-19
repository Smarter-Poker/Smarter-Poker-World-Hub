/**
 * Videos API - Get Poker Videos
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Fallback data when DB unavailable
const FALLBACK_VIDEOS = [
    { id: 1, title: "WSOP 2025 Main Event Preview", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80", duration: "12:34", views: 45000 },
    { id: 2, title: "GTO Strategy Breakdown", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1596451190630-186aff535bf2?w=400&q=80", duration: "8:22", views: 32000 },
    { id: 3, title: "Top 10 Poker Hands", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=400&q=80", duration: "15:45", views: 28000 },
    { id: 4, title: "Live Cash Game Session", youtube_id: "dQw4w9WgXcQ", thumbnail_url: "https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80", duration: "45:12", views: 18000 }
];

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { limit = 10, featured } = req.query;

        let query = supabase
            .from('poker_videos')
            .select('*')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(parseInt(limit));

        if (featured === 'true') {
            query = query.eq('is_featured', true);
        }

        const { data, error } = await query;

        if (error || !data?.length) {
            return res.status(200).json({ success: true, data: FALLBACK_VIDEOS.slice(0, parseInt(limit)) });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(200).json({ success: true, data: FALLBACK_VIDEOS });
    }
}
