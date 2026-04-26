/**
 * Check for duplicate video_ids in posted_clips
 * GET /api/admin/check-duplicates
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
    // BUG #167 FIX: Block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Check for duplicate video_ids
          const { data: allClips, error } = await getSupabase()
              .from('posted_clips')
              .select('video_id, posted_by, posted_at, clip_source')
              .order('video_id');

          if (error) {
              return res.status(500).json({ error: 'Failed to query', details: error });
          }

          // Find duplicates
          const videoIdCounts = {};
          const duplicates = [];

          allClips.forEach(clip => {
              if (!videoIdCounts[clip.video_id]) {
                  videoIdCounts[clip.video_id] = [];
              }
              videoIdCounts[clip.video_id].push(clip);
          });

          Object.keys(videoIdCounts || {}).forEach(videoId => {
              if (videoIdCounts[videoId].length > 1) {
                  duplicates.push({
                      video_id: videoId,
                      count: videoIdCounts[videoId].length,
                      instances: videoIdCounts[videoId]
                  });
              }
          });

          // Check for null posted_by
          const nullPostedBy = allClips.filter(c => !c.posted_by);

          return res.status(200).json({
              success: true,
              total_clips: allClips.length,
              duplicate_video_ids: duplicates,
              clips_with_null_posted_by: nullPostedBy.length,
              null_examples: nullPostedBy.slice(0, 10)
          });

      } catch (error) {
          return res.status(500).json({ error: error.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
