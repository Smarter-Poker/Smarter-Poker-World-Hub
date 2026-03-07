/**
 * News Hub API - Get News Articles
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method === 'GET') {
        try {
            const { category, search, limit = 20, offset = 0, featured } = req.query;

            let query = supabase
                .from('poker_news')
                .select('*')
                .eq('is_published', true)
                .order('published_at', { ascending: false })
                    .limit(100);

            if (category && category !== 'all') {
                query = query.eq('category', category)
                    .limit(100);
            }

            if (search) {
                // BUG #270 FIX: Sanitize search input to prevent PostgREST filter injection.
                // Characters like commas, parentheses, and dots could break/modify the filter.
                const sanitized = search.replace(/[,().]/g, ' ').trim();
                if (sanitized) {
                    query = query.or(`title.ilike.%${sanitized}%,content.ilike.%${sanitized}%`);
                }
            }

            if (featured === 'true') {
                query = query.eq('is_featured', true);
            }

            query = query.range(offset, offset + parseInt(limit) - 1);

            const { data, error } = await query;

            if (error) throw error;

            res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
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

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
