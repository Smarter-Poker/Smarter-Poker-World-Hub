/* ═══════════════════════════════════════════════════════════════════════════
   SESSION LIST API - List Active Sessions
   GET /api/auth/sessions/list
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
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Get authenticated user from session
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({ error: 'Not authenticated' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (userError || !user) {
              return res.status(401).json({ error: 'Invalid session' });
          }

          // Get all sessions for this user
          const { data: sessions, error: sessionsError } = await getSupabase()
              .from('user_sessions')
              .select('*')
              .eq('user_id', user.id)
              .order('last_active', { ascending: false });

          if (sessionsError) {
              console.warn('Error fetching sessions:', sessionsError);
              return res.status(500).json({ error: 'Failed to fetch sessions' });
          }

          return res.status(200).json({
              sessions: sessions || []
          });

      } catch (error) {
          console.warn('Session list error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
