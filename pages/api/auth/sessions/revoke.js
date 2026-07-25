/* ═══════════════════════════════════════════════════════════════════════════
   SESSION REVOKE API - Revoke a Specific Session
   POST /api/auth/sessions/revoke
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

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
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  try {
      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const { sessionId } = req.body;

          if (!sessionId) {
              return res.status(400).json({ error: 'Session ID required' });
          }

          // Get authenticated user from session
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({ error: 'Not authenticated' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { data: authData, error: userError } = await getSupabase().auth.getUser(token);
          const user = authData?.user;

          if (userError || !user) {
              return res.status(401).json({ error: 'Invalid session' });
          }

          // Delete the session (RLS ensures user can only delete their own)
          const { error: deleteError } = await getSupabase()
              .from('user_sessions')
              .delete()
              .eq('id', sessionId)
              .eq('user_id', user.id); // Double-check ownership

          if (deleteError) {
              console.warn('Error revoking session:', deleteError);
              return res.status(500).json({ error: 'Failed to revoke session' });
          }

          // Honesty: this removes the device from the tracked list only.
          // Supabase does not expose per-device token revocation here, so
          // the other device's tokens remain valid until expiry. Do NOT tell
          // the user their session was "revoked" — that's a false security
          // promise (the exact wording a phished user relies on).
          return res.status(200).json({
              success: true,
              tokensInvalidated: false,
              message: 'Device removed from your session list. Its sign-in remains valid until it expires — change your password to force sign-out everywhere.'
          });

      } catch (error) {
          console.warn('Session revoke error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
