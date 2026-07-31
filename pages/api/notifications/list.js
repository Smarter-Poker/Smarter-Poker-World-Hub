import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/notifications/list — Fetch user's social notifications (service role, bypasses RLS)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser, getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
          const limit = parseInt(req.query.limit || '50', 10);
          // BUG-31 FIX: Validate ?blocked= param against allowlist to prevent PostgREST injection.
          // Previously: blockedTypes were passed unsanitized into .not('type', 'in', '(type1,type2)')
          // A malicious value like "like),user_id.eq.(select..." could leak other users' notifications.
          const VALID_NOTIFICATION_TYPES = new Set([
              'like', 'comment', 'mention', 'reply', 'friend_request', 'friend_accept', 'friend_accepted',
              'new_follow', 'home_group_friend_joined', 'home_group_announcement', 'home_game_new',
              'home_game_update', 'home_game_invite', 'venue_claim_approved', 'venue_claim_rejected',
              'system', 'achievement', 'bonus', 'tournament', 'training', 'trivia', 'live',
              'poker_news', 'poker_hand', 'daily_challenge', 'diamond', 'vip',
          ]);
          const blockedParam = req.query.blocked;
          const blockedTypes = blockedParam
              ? blockedParam.split(',').map(t => t.trim()).filter(t => VALID_NOTIFICATION_TYPES.has(t))
              : [];

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
              console.warn('[Notifications List] Error:', error);
              return res.status(200).json({ success: true, notifications: [] });
          }

          return res.status(200).json({
              success: true,
              notifications: data || [],
              count: (data || []).length
          });

      } catch (err) {
          console.warn('[Notifications List] Error:', err);
          return res.status(200).json({ success: true, notifications: [] });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
