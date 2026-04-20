/**
 * VIP Status Check API
 * GET /api/vip/check-status
 * Server-side bridge for VIP verification using service role
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
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
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // ═══════════════════════════════════════════════════════════════════
          // HARDENED: March 7, 2026 — JWT ONLY. Query param fallback REMOVED
          // to prevent IDOR (any user could check any other user's VIP status).
          // The global fetch interceptor in _app.js auto-injects JWT on all
          // /api/ calls, so the "auth race condition" fallback is no longer needed.
          // ═══════════════════════════════════════════════════════════════════
          const token = req.headers.authorization?.replace('Bearer ', '');
          if (!token) {
              return res.status(401).json({ isVip: false, error: 'Authentication required' });
          }
          const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
          if (authErr || !user) {
              return res.status(401).json({ isVip: false, error: 'Invalid token' });
          }
          const userId = user.id;

          // Query profiles for VIP status
          const { data: profile, error } = await getSupabase()
              .from('profiles')
              .select('is_vip, diamonds')
              .eq('id', userId)
              .maybeSingle();

          if (error || !profile) {
              return res.status(200).json({
                  isVip: false,
                  diamonds: 0
              });
          }

          const isVip = profile.is_vip === true;

          return res.status(200).json({
              isVip,
              diamonds: profile.diamonds || 0
          });

      } catch (err) {
          console.error('[VIP Check] Error:', err);
          return res.status(500).json({ isVip: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) {}
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
