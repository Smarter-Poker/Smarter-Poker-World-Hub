import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { invalidateFeedCache } from './feed';
import { invalidateUnreadCache } from './unread-count';


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
      const { notificationId, ids } = req.body || {};

      if (ids && Array.isArray(ids) && ids.length > 0) {
        // BUG-32 FIX: Batch mark specific IDs as read (sent by social-media dropdown).
        // Previous code had no 'ids' path — fell through to mark ALL, incorrectly
        // clearing every notification when the user just opened the dropdown briefly.
        // Validate: each id must be a valid UUID and belong to the requesting user.
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const safeIds = ids.filter(id => typeof id === 'string' && uuidRe.test(id)).slice(0, 200);
        if (safeIds.length > 0) {
          // BUG-33 FIX: Also sync is_read=true so legacy queries stay consistent
          await getSupabase()
            .from('notifications')
            .update({ read: true, is_read: true })
            .in('id', safeIds)
            .eq('user_id', user.id);  // user_id guard prevents marking other users' notifications
        }
      } else if (notificationId) {
        // Mark single notification — also sync is_read (BUG-33 FIX)
        await getSupabase()
          .from('notifications')
          .update({ read: true, is_read: true })
          .eq('id', notificationId)
          .eq('user_id', user.id);
      } else {
        // Mark ALL unread — catch rows where EITHER flag indicates unread
        await getSupabase()
          .from('notifications')
          .update({ read: true, is_read: true })
          .eq('user_id', user.id)
          .or('read.eq.false,read.is.null,is_read.eq.false,is_read.is.null');
      }

      // Invalidate server-side feed cache so next fetch reflects updated read state
      invalidateFeedCache(user.id);
      invalidateUnreadCache(user.id);

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
