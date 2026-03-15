/**
 * Delete ALL news articles and start fresh
 */
import { createClient } from '../../../src/lib/supabaseServerClient';

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  try {
      let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

      // Delete ALL articles - start fresh
      const { data, error } = await getSupabase()
          .from('poker_news')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (neq non-existent id)
          .select('id');

      if (error) {
          return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({
          success: true,
          deleted: data?.length || 0,
          message: 'Deleted ALL articles. Run /api/cron/news-scraper to repopulate.'
      });

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
