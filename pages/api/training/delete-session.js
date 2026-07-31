import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * POST /api/training/delete-session
 * Deletes a specific training session record by ID.
 * Used by nodelocking profile management.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.write)) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard — only accepts a sessionId
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 5120) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }


      const { sessionId } = req.body;
      if (!sessionId) {
          return res.status(400).json({ success: false, error: 'sessionId required' });
      }

      try {
          // Only allow deletion of records owned by the authenticated user
          const { error: delErr } = await getSupabase()
              .from('training_sessions')
              .delete()
              .eq('id', sessionId)
              .eq('user_id', user.id);

          if (delErr) {
              console.warn('[DeleteSession] Delete failed:', delErr.message);
              return res.status(400).json({ success: false, error: 'Delete failed' });
          }

          return res.status(200).json({ success: true });
      } catch (err) {
          console.warn('[DeleteSession] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
