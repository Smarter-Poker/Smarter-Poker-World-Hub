/**
 * Videos API - Get Poker Videos
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

        if (error) throw error;

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}
