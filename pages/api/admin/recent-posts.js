// Admin endpoint to check recent posts for link metadata
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
          // Get last 5 posts
          const { data: posts, error } = await getSupabase()
              .from('social_posts')
              .select('id, content_type, content, media_urls, link_url, link_title, link_image, created_at')
              .order('created_at', { ascending: false })
              .limit(10);

          if (error) throw error;

          return res.status(200).json({
              posts: posts.map(p => ({
                  id: p.id,
                  content_type: p.content_type,
                  content: p.content?.substring(0, 50),
                  media_urls: p.media_urls,
                  link_url: p.link_url,
                  link_title: p.link_title,
                  link_image: p.link_image,  // Return actual URL for debugging
                  created_at: p.created_at
              }))
          });
      } catch (error) {
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
