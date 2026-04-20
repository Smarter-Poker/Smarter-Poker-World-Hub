/**
 * Check posted_clips table for duplicates
 * GET /api/admin/check-posted-clips
 */
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
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Check table schema
          const { data: schema, error: schemaError } = await getSupabase()
              .from('posted_clips')
              .select('*')
              .limit(1);

          if (schemaError) {
              return res.status(500).json({ error: 'Failed to query table', details: schemaError });
          }

          // Get total count
          const { count, error: countError } = await getSupabase()
              .from('posted_clips')
              .select('*', { count: 'exact', head: true });

          // Check for duplicate video_ids
          const { data: duplicates, error: dupError } = await getSupabase()
              .rpc('check_duplicate_clips');

          // Get recent clips
          const { data: recent, error: recentError } = await getSupabase()
              .from('posted_clips')
              .select('video_id, posted_by, posted_at, clip_source')
              .order('posted_at', { ascending: false })
              .limit(50);

          return res.status(200).json({
              success: true,
              total_clips: count,
              schema_columns: schema && schema.length > 0 ? Object.keys(schema[0]) : [],
              recent_clips: recent || [],
              duplicates: duplicates || [],
              errors: {
                  schema: schemaError,
                  count: countError,
                  duplicates: dupError,
                  recent: recentError
              }
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
