/**
 * 🚨 EMERGENCY CLEANUP API
 * Deletes all AI-generated photo posts from horses
 * This endpoint should be called once to clean up violating content
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
      const supabase = getSupabase();

      // Only allow POST with secret
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // BUG #239 FIX: Require real env var — no hardcoded fallback
      const authHeader = req.headers.authorization;
      if (!process.env.CLEANUP_SECRET || authHeader !== `Bearer ${process.env.CLEANUP_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized' });
      }

      


      try {
          // Get all horse profile IDs
          const { data: horses } = await supabase
              .from('content_authors')
              .select('profile_id')
              .not('profile_id', 'is', null);

          const horseIds = (horses || []).map(h => h.profile_id);

          // Delete photo posts
          const { data: deletedPosts, error: postError } = await supabase
              .from('social_posts')
              .delete()
              .in('author_id', horseIds)
              .eq('content_type', 'photo')
              .select('id');

          if (postError) {
              console.warn('Post delete error:', postError);
          }

          // Delete image stories
          const { data: deletedStories, error: storyError } = await supabase
              .from('stories')
              .delete()
              .in('author_id', horseIds)
              .eq('media_type', 'image')
              .select('id');

          if (storyError) {
              console.warn('Story delete error:', storyError);
          }

          const result = {
              success: true,
              deleted_posts: deletedPosts?.length || 0,
              deleted_stories: deletedStories?.length || 0,
              timestamp: new Date().toISOString()
          };

          return res.status(200).json(result);

      } catch (error) {
          console.warn('Cleanup error:', error);
          return res.status(500).json({ success: false, error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
