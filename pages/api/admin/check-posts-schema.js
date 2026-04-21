// Check social_posts table schema and sample data
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      try {
          // Fetch sample posts with all fields
          const { data: posts, error } = await getSupabase()
              .from('social_posts')
              .select('*')
              .limit(5);

          if (error) {
              return res.status(500).json({ error: error.message });
          }

          // Get all column names from a sample post
          const columns = posts && posts[0] ? Object.keys(posts[0]) : [];

          // Find posts that might have link/article data
          const postsWithLinks = posts?.filter(p =>
              p.link_url || p.shared_url || p.article_url ||
              p.embed_url || p.og_url || p.content?.includes('http')
          ) || [];

          res.status(200).json({
              schema: {
                  columns: columns,
                  columnCount: columns.length
              },
              samplePosts: posts?.map(p => ({
                  id: p.id,
                  content: p.content?.substring(0, 100),
                  content_type: p.content_type,
                  media_urls: p.media_urls,
                  hasLinkFields: !!(p.link_url || p.shared_url || p.article_url || p.embed_url),
                  allFields: Object.entries(p).filter(([k, v]) => v != null).map(([k, v]) => k)
              })),
              postsWithLinksCount: postsWithLinks.length
          });
      } catch (e) {
          res.status(500).json({ error: e.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
