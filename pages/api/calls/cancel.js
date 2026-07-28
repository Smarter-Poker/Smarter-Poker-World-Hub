// API to cancel/delete a pending call
// DELETE /api/calls/cancel

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
      if (req.method !== 'DELETE' && req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      // Require JWT auth
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      /* removed duplicate authUser */
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const authenticatedUserId = authUser.id;
      const { callId, callerId, calleeId } = req.body;

      try {
          let query = getSupabase().from('pending_calls').delete();

          if (callId) {
              // SECURITY: Only allow canceling a call if the authenticated user is the caller OR callee
              query = query.eq('id', callId).or(`caller_id.eq.${authenticatedUserId},callee_id.eq.${authenticatedUserId}`);
          } else if (callerId && calleeId) {
              // SECURITY: Verify the authenticated user is one of the parties
              if (callerId !== authenticatedUserId && calleeId !== authenticatedUserId) {
                  return res.status(403).json({ success: false, error: 'Not authorized to cancel this call' });
              }
              query = query.eq('caller_id', callerId).eq('callee_id', calleeId);
          } else {
              return res.status(400).json({ success: false, error: 'Missing callId or callerId+calleeId' });
          }

          const { error } = await query;

          if (error) {
              console.warn('[calls/cancel] Error:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          return res.json({ success: true });
      } catch (e) {
          console.warn('[calls/cancel] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
