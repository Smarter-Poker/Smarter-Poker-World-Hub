import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/assistant/stats
 * Returns user's assistant stats (sessions reviewed, leaks found, etc.)
 *
 * Contract: { success: true, stats: { sessionsReviewed, handsAnalyzed, leaksFound,
 *            resolvedLeaks, sandboxSessions, avgEvLoss }, isDemo: boolean }
 * isDemo is true whenever the numbers are NOT the caller's real data (no auth,
 * no data yet, or a query failure) — consumers must surface it.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

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
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read || LIMITS.write)) return;

    // Per-user training stats — private cache only, 60s browser TTL
    res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');

    // JWT Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(200).json({ success: true, stats: getDefaultStats(), isDemo: true });
    }

    const token = authHeader.replace('Bearer ', '');
    const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    if (authErr || !authUser) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = authUser.id;

    try {
      // Try to get real stats
      const { data: stats, error } = await getSupabase()
        .from('user_assistant_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !stats) {
        // Count sandbox sessions
        const { count: sandboxCount } = await getSupabase()
          .from('sandbox_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        // Count real analyzed hands: sandbox_results rows belonging to this
        // user's sessions. Falls back to the session count if the results
        // table is missing or the joined count fails.
        let handsAnalyzed = sandboxCount || 0;
        try {
          const { count: resultsCount, error: resultsError } = await getSupabase()
            .from('sandbox_results')
            .select('id, sandbox_sessions!inner(user_id)', { count: 'exact', head: true })
            .eq('sandbox_sessions.user_id', userId);
          if (!resultsError && typeof resultsCount === 'number') {
            handsAnalyzed = resultsCount;
          }
        } catch (resultsErr) {
          console.warn('Sandbox results count error:', resultsErr?.message || resultsErr);
        }

        const { activeLeaks, resolvedLeaks, avgEvLoss } = await getLeakStats(userId);

        return res.status(200).json({
          success: true,
          stats: {
            sessionsReviewed: sandboxCount || 0,
            handsAnalyzed,
            leaksFound: activeLeaks,
            resolvedLeaks,
            sandboxSessions: sandboxCount || 0,
            avgEvLoss
          },
          isDemo: !sandboxCount
        });
      }

      // `total_sessions_reviewed` has no writer anywhere in the app, so reading
      // it straight off the row pins the tile at 0 forever. Derive it from a
      // live count on sandbox_sessions — exactly how the no-row branch above
      // does it — and only fall back to the column if the count is unavailable.
      let sessionsReviewed = stats.total_sessions_reviewed || 0;
      try {
        const { count: sandboxCount, error: countError } = await getSupabase()
          .from('sandbox_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (!countError && typeof sandboxCount === 'number') sessionsReviewed = sandboxCount;
      } catch (countErr) {
        console.warn('Sandbox session count error:', countErr?.message || countErr);
      }

      // Real stats row: prefer a stored avg_ev_loss column, otherwise compute
      // the aggregate from user_leaks (never a hardcoded placeholder).
      let avgEvLoss = 0;
      if (typeof stats.avg_ev_loss === 'number' && Number.isFinite(stats.avg_ev_loss)) {
        avgEvLoss = stats.avg_ev_loss;
      } else if ((stats.active_leaks_count || 0) > 0) {
        const leakStats = await getLeakStats(userId);
        avgEvLoss = leakStats.avgEvLoss;
      }

      return res.status(200).json({
        success: true,
        stats: {
          sessionsReviewed,
          handsAnalyzed: stats.total_hands_analyzed || 0,
          leaksFound: stats.active_leaks_count || 0,
          resolvedLeaks: stats.resolved_leaks_count || 0,
          sandboxSessions: stats.sandbox_sessions_count || 0,
          avgEvLoss
        },
        isDemo: false
      });

    } catch (error) {
      console.warn('Stats error:', error);
      return res.status(200).json({
        success: true,
        stats: getDefaultStats(),
        isDemo: true
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Aggregate leak counts and average EV loss from user_leaks.
 * Uses head-count queries so counts never truncate at a row limit.
 * Defensive: returns zeros if the table is missing or queries fail.
 */
async function getLeakStats(userId) {
  const out = { activeLeaks: 0, resolvedLeaks: 0, avgEvLoss: 0 };
  try {
    const [activeRes, resolvedRes, evRes] = await Promise.all([
      getSupabase()
        .from('user_leaks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('status', 'resolved'),
      getSupabase()
        .from('user_leaks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'resolved'),
      getSupabase()
        .from('user_leaks')
        .select('avg_ev_loss_bb')
        .eq('user_id', userId)
        .neq('status', 'resolved')
        .limit(1000),
    ]);

    out.activeLeaks = activeRes?.count || 0;
    out.resolvedLeaks = resolvedRes?.count || 0;

    // avg_ev_loss_bb is stored as a positive loss magnitude (BB/100);
    // the API convention reports EV loss as a negative number.
    const evValues = (evRes?.data || [])
      .map(l => Math.abs(Number(l?.avg_ev_loss_bb)))
      .filter(v => Number.isFinite(v) && v > 0);
    if (evValues.length > 0) {
      const mean = evValues.reduce((sum, v) => sum + v, 0) / evValues.length;
      out.avgEvLoss = -Number(mean.toFixed(2));
    }
  } catch (leakErr) {
    console.warn('Leak stats error:', leakErr?.message || leakErr);
  }
  return out;
}

function getDefaultStats() {
  // No-auth / error path: all zeros. Never fabricate non-zero stats —
  // consumers read isDemo:true alongside this and show a sign-in state.
  return {
    sessionsReviewed: 0,
    handsAnalyzed: 0,
    leaksFound: 0,
    resolvedLeaks: 0,
    sandboxSessions: 0,
    avgEvLoss: 0
  };
}
