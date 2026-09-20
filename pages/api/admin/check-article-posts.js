// Check article posts metadata structure
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

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
          // Find posts with content_type = 'article' or 'link'
          const { data: articlePosts, error } = await getSupabase()
              .from('social_posts')
              .select('*')
              .or('content_type.eq.article,content_type.eq.link,content_type.eq.shared')
              .limit(10);

          if (error) {
              return res.status(500).json({ error: error.message });
          }

          // Also look for posts with link-like content
          const { data: allPosts } = await getSupabase()
              .from('social_posts')
              .select('*')
              .limit(20);

          // Find posts that might have link metadata
          const postsWithMetadata = allPosts?.filter(p => p.metadata && Object.keys(p.metadata || {}).length > 0) || [];

          res.status(200).json({
              articlePostsCount: articlePosts?.length || 0,
              articlePosts: articlePosts?.map(p => ({
                  id: p.id,
                  content: p.content?.substring(0, 100),
                  content_type: p.content_type,
                  media_urls: p.media_urls,
                  metadata: p.metadata
              })),
              postsWithMetadata: postsWithMetadata.map(p => ({
                  id: p.id,
                  content: p.content?.substring(0, 50),
                  content_type: p.content_type,
                  metadata: p.metadata
              })),
              distinctContentTypes: [...new Set(allPosts?.map(p => p.content_type) || [])]
          });
      } catch (e) {
          res.status(500).json({ error: e.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
