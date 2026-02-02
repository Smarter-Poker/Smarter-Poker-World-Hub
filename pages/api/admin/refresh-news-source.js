/**
 * Clear old news articles from a specific source to force fresh import
 * Usage: GET /api/admin/refresh-news-source?source=Poker.org
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
    const { source } = req.query;

    if (!source) {
        return res.status(400).json({ error: 'source parameter required (e.g., Poker.org, WSOP)' });
    }

    try {
        // Delete old articles from this source
        const { data: deleted, error: deleteError } = await supabase
            .from('poker_news')
            .delete()
            .eq('source_name', source)
            .select('id');

        if (deleteError) {
            return res.status(500).json({ error: deleteError.message });
        }

        const deletedCount = deleted?.length || 0;
        console.log(`Deleted ${deletedCount} old articles from ${source}`);

        return res.status(200).json({
            success: true,
            source,
            deletedCount,
            message: `Deleted ${deletedCount} articles from ${source}. Run /api/cron/news-scraper to import fresh ones.`
        });

    } catch (error) {
        console.error('Refresh error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
