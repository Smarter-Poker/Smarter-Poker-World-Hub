/**
 * GET /api/sandbox/coach-accuracy
 * Returns coach mode accuracy stats for the authenticated user.
 * Reads from sandbox_coach_accuracy view.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';
import { availabilityFailure } from '../../../../src/lib/personal-assistant/persistenceContract';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
        }
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
      if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // leaks.js refetches this after every coach-result event, so a grinding
      // session hammers it — same limiter as every other sandbox surface.
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const { user: authUser, status: authStatus } = await getServerUserWithFallback(req, supabase);
          if (authStatus === 503) {
              return res.status(503).json({ success: false, error: 'Session verification unavailable' });
          }
          if (authUser) userId = authUser.id;

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

          const readError = summaryRes?.error || leaksRes?.error;
          if (readError) {
              console.warn('[coach-accuracy] Read error:', readError.message);
              return res.status(readError.code === '42P01' ? 503 : 500).json(availabilityFailure(
                  'Coach accuracy is temporarily unavailable.',
              ));
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
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
