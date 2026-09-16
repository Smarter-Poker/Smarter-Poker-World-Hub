/**
 * GET /api/memory/dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Aggregated dashboard payload for the redesigned /hub/memory-games
 * (preflop charts) landing surface.
 *
 * Returns:
 *   {
 *     success: true,
 *     stats: {
 *       sessions_this_week, avg_accuracy_this_week_pct, diamonds_earned_this_week,
 *       sessions_last_week, avg_accuracy_last_week_pct,
 *       rolling_30d_sessions, rolling_accuracy_pct,
 *       current_grade, next_grade,
 *       current_streak_days, longest_streak_days, total_days_played,
 *       per_mode_best:    [ { game_mode, best_score, best_accuracy, has_perfect, last_played } ],
 *       per_level_mastery:[ { level, best_score, best_accuracy, attempts, last_played, mastered } ],
 *       mastered_levels_count,
 *       daily_challenge:  { id, level, game_mode, scenario_id, target_accuracy, target_time, diamond_reward, bonus_reward } | null,
 *       daily_challenge_completed,
 *       computed_at
 *     }
 *   }
 *
 * Auth: JWT required (mirrors /api/training/weekly-stats and /api/training/get-sessions).
 * Cache: private 30s + 60s SWR (stats update at end of every drill).
 *
 * Source RPC: public.rpc_memory_dashboard(uuid) — see
 * supabase/migrations/20260507180000_memory_dashboard_rpc.sql
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

    const { data, error } = await supabase.rpc('rpc_memory_dashboard', {
      p_user_id: user.id,
    });

    if (error) {
      reportApiError(error, { route: 'memory/dashboard', userId: user.id });
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, stats: data });
  } catch (err) {
    reportApiError(err, { route: 'memory/dashboard' });
    return res.status(500).json({ success: false, error: err.message });
  }
}
