/**
 * GET /api/training/weekly-stats
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregated training dashboard payload for the redesigned /hub/training page.
 *
 * Returns:
 *   {
 *     success: true,
 *     stats: {
 *       hands_this_week, correct_this_week, total_this_week,
 *       accuracy_this_week_pct, ev_saved_this_week_bb,
 *       hands_last_week, accuracy_last_week_pct, ev_saved_last_week_bb,
 *       current_streak_days, personal_best_streak_days,
 *       rolling_accuracy_pct, rolling_correct, rolling_total,
 *       current_grade, next_grade, delta_correct_to_next,
 *       computed_at
 *     }
 *   }
 *
 * Auth: JWT required (mirrors get-sessions.js / aggregate-report.js).
 * Cache: private, 30s fresh + 60s SWR (stats update at end of every drill).
 *
 * Source RPC: public.rpc_training_weekly_stats(uuid) — see
 * supabase/migrations/20260507120000_training_dashboard_rpcs.sql
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

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
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'Auth required' });
    }

    const supabase = getSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authErr || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');

    const { data, error } = await supabase.rpc('rpc_training_weekly_stats', {
      p_user_id: user.id,
    });

    if (error) {
      reportApiError(error, { route: 'training/weekly-stats', userId: user.id });
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, stats: data });
  } catch (err) {
    reportApiError(err, { route: 'training/weekly-stats' });
    return res.status(500).json({ success: false, error: err.message });
  }
}
