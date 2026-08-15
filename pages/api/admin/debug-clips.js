/**
 * Debug endpoint to check clip tables
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
          // Check poker_clips
          const { data: pokerClips, error: pokerError } = await getSupabase()
              .from('poker_clips')
              .select('id, title, source_url')
              .limit(5);

          // Check sports_clips
          const { data: sportsClips, error: sportsError } = await getSupabase()
              .from('sports_clips')
              .select('id, title, source_url, video_id')
              .limit(5);

          // Count both tables
          const { count: pokerCount } = await getSupabase()
              .from('poker_clips')
              .select('*', { count: 'exact', head: true });

          const { count: sportsCount } = await getSupabase()
              .from('sports_clips')
              .select('*', { count: 'exact', head: true });

          // 2026-08-15 CHECK 13: poker_clips has no is_active column — the
          // filtered count 42703'd on every call. All rows are live.
          const activePokerCount = pokerCount;

          return res.status(200).json({
              poker_clips: {
                  total: pokerCount,
                  active: activePokerCount,
                  sample: pokerClips,
                  error: pokerError?.message
              },
              sports_clips: {
                  total: sportsCount,
                  sample: sportsClips,
                  error: sportsError?.message
              }
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
