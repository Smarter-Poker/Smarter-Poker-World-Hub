/**
 * CRON: CLEANUP EXPIRED PREMIUM FEATURE PASSES
 * Deletes rows in premium_feature_access where expires_at is in the past.
 * Can be called via cron job or Vercel cron.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

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
      // Only allow GET or POST
      if (req.method !== 'GET' && req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const now = new Date().toISOString();

          // Delete all expired passes
          const { data, error, count } = await getSupabase()
              .from('premium_feature_access')
              .delete({ count: 'exact' })
              .lt('expires_at', now);

          if (error) {
              console.error('[CRON] Failed to cleanup expired passes:', error.message);
              return res.status(500).json({ success: false, error: error.message });
          }

          console.log(`[CRON] Premium feature pass cleanup complete. Removed ${count || 0} expired passes.`);
          return res.status(200).json({ success: true, removedCount: count || 0 });

      } catch (err) {
          console.error('[CRON] Error during expired pass cleanup:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
