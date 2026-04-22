import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { invalidateFeedCache } from './feed';


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
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // PERF-FIX: Local HMAC JWT validation — eliminates ~1.5s GoTrue network round-trip
    const { user } = await getServerUserWithFallback(req, getSupabase());
    if (!user) return res.status(401).json({ error: 'Auth required' });


    try {
      const { notificationId } = req.body || {};

      if (notificationId) {
        // Mark single notification
        await getSupabase()
          .from('notifications')
          .update({ read: true })
          .eq('id', notificationId)
          .eq('user_id', user.id);
      } else {
        // Mark all unread
        await getSupabase()
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false);
      }

      // Invalidate server-side feed cache so next fetch reflects updated read state
      invalidateFeedCache(user.id);

      return res.json({ success: true });

    } catch (err) {
      console.warn('[mark-read]', err);
      return res.status(500).json({ error: 'Failed to mark notifications' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
