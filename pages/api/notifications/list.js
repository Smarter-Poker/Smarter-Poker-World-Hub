/**
 * GET /api/notifications/list — Fetch user's social notifications (service role, bypasses RLS)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser, getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Auth: try local HMAC first (fast, no network), fall back to GoTrue
      // if SUPABASE_JWT_SECRET is not configured in the environment.
      const supabase = getSupabase();
      const { user: serverUser } = await getServerUserWithFallback(req, supabase);
      if (!serverUser) {
          return res.status(401).json({ success: false, error: 'Auth required' });
      }
      const userId = serverUser.id;
      // Private cache: browser can reuse within 10s, revalidate for 30s.
      // User-specific data — never shared via CDN (private directive).
      res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');

      try {
          const limit = parseInt(req.query.limit || '50');
          // Only filter types if caller explicitly passes ?blocked=type1,type2
          // Default: show ALL notification types (matches header badge count)
          const blockedParam = req.query.blocked;
          const blockedTypes = blockedParam ? blockedParam.split(',').filter(Boolean) : [];

          // Fetch notifications
          let query = getSupabase()
              .from('notifications')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(limit);

          if (blockedTypes.length > 0) {
              query = query.not('type', 'in', `(${blockedTypes.join(',')})`);
          }

          const { data, error } = await query;

          if (error) {
              console.error('[Notifications List] Error:', error);
              return res.status(200).json({ success: true, notifications: [] });
          }

          return res.status(200).json({
              success: true,
              notifications: data || [],
              count: (data || []).length
          });

      } catch (err) {
          console.error('[Notifications List] Error:', err);
          return res.status(200).json({ success: true, notifications: [] });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
