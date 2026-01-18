/**
 * News Hub API - Get News Articles
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const { category, search, limit = 20, offset = 0, featured } = req.query;

            let query = supabase
                .from('poker_news')
                .select('*')
                .eq('is_published', true)
                .order('published_at', { ascending: false });

            if (category && category !== 'all') {
                query = query.eq('category', category);
            }

            if (search) {
                query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
            }

            if (featured === 'true') {
                query = query.eq('is_featured', true);
            }

            query = query.range(offset, offset + parseInt(limit) - 1);

            const { data, error } = await query;

            if (error) throw error;

            return res.status(200).json({ success: true, data });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    // POST - Increment view count
    if (req.method === 'POST') {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ success: false, error: 'Missing article ID' });

            const { error } = await supabase.rpc('increment_news_views', { news_id: id });

            if (error) throw error;

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ success: false, error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
