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
      if (req.method !== 'POST' && req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Verify Vercel Cron Secret if triggered by cron
      const authHeader = req.headers.authorization;
      if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
          return res.status(401).json({ error: 'Unauthorized cron request' });
      }

      try {
          const now = new Date().toISOString();

          // Delete all expired passes from premium_feature_access
          const { data, error } = await supabase
              .from('premium_feature_access')
              .delete()
              .lt('expires_at', now);

          if (error) {
              throw error;
          }

          return res.status(200).json({
              success: true,
              message: 'Cleaned up expired premium feature passes',
              timestamp: now
          });
      } catch (err) {
          console.error('[Cron Cleanup] Error deleting expired passes:', err);
          return res.status(500).json({ error: err.message });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
