/**
 * Delete all articles with Google images (they don't have real thumbnails)
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Delete articles from Google News sources (by source_name)
    const { data, error } = await supabase
        .from('poker_news')
        .delete()
        .ilike('source_name', '%Google News%')
        .select('id');

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
        success: true,
        deleted: data?.length || 0,
        message: 'Deleted all Google News articles. Run the scraper to repopulate with direct RSS sources.'
    });
}
