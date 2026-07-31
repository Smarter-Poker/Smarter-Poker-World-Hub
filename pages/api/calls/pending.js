import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
// API to get pending calls for a user
// GET /api/calls/pending?userId=xxx

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }
      // Presence polling is high-frequency — use read limit
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      /* removed duplicate authUser */
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = authUser.id; // From JWT, NOT query param

      try {
          // Clean up expired calls first
          const { error: err_pending_calls_kghzp } = await getSupabase()
            .from('pending_calls')
            .delete()
              .lt('expires_at', new Date().toISOString());
          if (err_pending_calls_kghzp) console.warn('[Supabase] Silent mutation failed in pending_calls:', err_pending_calls_kghzp.message);

          // Get pending calls for this user
          const { data: calls, error } = await getSupabase()
              .from('pending_calls')
              .select('*')
              .eq('callee_id', userId)
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(1);

          if (error) {
              console.warn('[calls/pending] Error:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          // Return the most recent pending call
          const pendingCall = calls?.[0] || null;

          return res.json({
              success: true,
              pendingCall: pendingCall ? {
                  id: pendingCall.id,
                  callerId: pendingCall.caller_id,
                  callerName: pendingCall.caller_name,
                  callerAvatar: pendingCall.caller_avatar,
                  callType: pendingCall.call_type,
                  roomName: pendingCall.room_name,
                  createdAt: pendingCall.created_at,
              } : null
          });
      } catch (e) {
          console.warn('[calls/pending] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
