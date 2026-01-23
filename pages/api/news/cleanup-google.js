/**
 * Delete ALL news articles and start fresh
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Delete ALL articles - start fresh
    const { data, error } = await supabase
        .from('poker_news')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (neq non-existent id)
        .select('id');

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
        success: true,
        deleted: data?.length || 0,
        message: 'Deleted ALL articles. Run /api/cron/news-scraper to repopulate.'
    });
}
