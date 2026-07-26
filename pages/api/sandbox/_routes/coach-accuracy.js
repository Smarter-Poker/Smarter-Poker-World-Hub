/**
 * GET /api/sandbox/coach-accuracy
 * Returns coach mode accuracy stats for the authenticated user.
 * Reads from sandbox_coach_accuracy view.
 */
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

const EMPTY_ACCURACY = {
    total_hands: 0,
    correct_count: 0,
    incorrect_count: 0,
    accuracy_pct: null,
    avg_leak_ev: null,
};

export default async function handler(req, res) {
  try {
      // leaks.js refetches this after every coach-result event, so a grinding
      // session hammers it — same limiter as every other sandbox surface.
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          if (!userId) {
              return res.status(401).json({ success: false, error: 'Authentication required' });
          }

          const [summaryRes, leaksRes] = await Promise.all([
              // Accuracy summary
              supabase
                  .from('sandbox_coach_accuracy')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle(),
              // Top leak spots — most common wrong picks
              supabase
                  .from('sandbox_coach_results')
                  .select('street, board, user_pick, gto_action, ev_delta')
                  .eq('user_id', userId)
                  .eq('is_correct', false)
                  .order('ev_delta', { ascending: true })
                  .limit(5),
          ]);

          if (summaryRes?.error) {
              console.warn('[coach-accuracy] View error:', summaryRes.error.message);
          }
          if (leaksRes?.error) {
              console.warn('[coach-accuracy] Leaks query error:', leaksRes.error.message);
          }

          return res.status(200).json({
              success: true,
              accuracy: summaryRes?.data || EMPTY_ACCURACY,
              topLeaks: leaksRes?.data || [],
          });
      } catch (err) {
          console.warn('[coach-accuracy] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
