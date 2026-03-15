/**
 * Show what images are actually stored in the database
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

      const { data: articles } = await getSupabase()
          .from('poker_news')
          .select('id, title, image_url, source_name, source_url')
          .order('published_at', { ascending: false })
          .limit(10);

      const summary = (articles || []).map(a => ({
          title: a.title?.substring(0, 50),
          source: a.source_name,
          image: a.image_url?.substring(0, 80),
          isDefault: a.image_url?.includes('unsplash') || a.image_url?.includes('pexels') || a.image_url?.includes('googleusercontent'),
          sourceUrl: a.source_url?.substring(0, 60)
      }));

      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ articles: summary });

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
