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
import { readLeakStatsAggregate } from '../../../src/lib/personal-assistant/leakStats';

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
      // The aggregate row is a projection, not the source of truth. Sandbox
      // session counters used to drift because cached analyses skipped writes
      // and concurrent read-modify-write increments could overwrite each other.
      // Always count the owned session rows and active leaks live; retain the
      // stored hand total only for Club Arena scans, whose unique-hand count is
      // deliberately persisted by the deterministic audit endpoint.
      const [storedRes, sandboxRes, leakStats] = await Promise.all([
        getSupabase()
          .from('user_assistant_stats')
          .select('sandbox_sessions_count, total_sessions_reviewed, total_hands_analyzed')
          .eq('user_id', userId)
          .maybeSingle(),
        getSupabase()
          .from('sandbox_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        getLeakStats(userId),
      ]);

      const stored = storedRes?.data || null;
      const failedSources = [];
      if (storedRes?.error) failedSources.push('user_assistant_stats');
      if (sandboxRes?.error) failedSources.push('sandbox_sessions');
      const storedSandboxCount = stored && Number.isFinite(Number(stored.sandbox_sessions_count ?? stored.total_sessions_reviewed))
        ? Number(stored.sandbox_sessions_count ?? stored.total_sessions_reviewed)
        : null;
      const sandboxCount = !sandboxRes?.error && typeof sandboxRes?.count === 'number'
        ? sandboxRes.count
        : storedSandboxCount;
      const storedHands = stored && Number.isFinite(Number(stored.total_hands_analyzed))
        ? Number(stored.total_hands_analyzed)
        : null;
      const handsAnalyzed = storedHands;

      return res.status(200).json({
        success: true,
        stats: {
          sessionsReviewed: sandboxCount,
          handsAnalyzed,
          leaksFound: leakStats.activeLeaks,
          resolvedLeaks: leakStats.resolvedLeaks,
          sandboxSessions: sandboxCount,
          avgEvLoss: leakStats.avgEvLoss,
        },
        isDemo: false,
        partial: failedSources.length > 0,
        failedSources,
        dataSources: {
          sandboxSessions: sandboxRes?.error
            ? (storedSandboxCount === null ? 'unavailable' : 'stored_fallback')
            : 'live_count',
          handsAnalyzed: handsAnalyzed === null
            ? 'unavailable'
            : 'deterministic_audit_total',
          leaks: 'live_aggregate',
        },
      });

    } catch (error) {
      console.warn('Stats error:', error);
      return res.status(503).json({
        success: false,
        error: 'Assistant statistics are temporarily unavailable.',
        isDemo: false,
        unavailable: true,
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Aggregate leak counts across both leak stores and measured EV loss from
 * user_leaks. A failed authoritative read must never masquerade as a genuine
 * zero with isDemo:false.
 * Uses head-count queries so counts never truncate at a row limit.
 * Fails closed when the authoritative aggregate is unavailable.
 */
async function getLeakStats(userId) {
  const { data, error } = await readLeakStatsAggregate(getSupabase(), userId);
  if (error) {
    console.warn('Leak stats error:', error?.message || error);
    throw error;
  }
  return {
    activeLeaks: data.activeLeaks,
    resolvedLeaks: data.resolvedLeaks,
    // avg_ev_loss_bb is a positive loss magnitude; the public stats contract
    // reports loss as negative and includes only explicitly measured rows.
    avgEvLoss: data.avgEvLoss > 0 ? -data.avgEvLoss : 0,
  };
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
