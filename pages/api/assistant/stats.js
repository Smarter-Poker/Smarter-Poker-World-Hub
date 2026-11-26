import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * GET /api/assistant/stats
 * Returns user's assistant stats (sessions reviewed, leaks found, etc.)
 *
 * Contract: { success: true, stats: { sessionsReviewed, handsAnalyzed, leaksFound,
 *            resolvedLeaks, sandboxSessions, avgEvLoss }, isDemo: boolean }
 * isDemo is true whenever the numbers are NOT the caller's real data (no auth,
 * no data yet, or a query failure) · consumers must surface it.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { readLeakStatsAggregate } from '../../../src/lib/personal-assistant/leakStats';

let _supabase = null;
export function _setSupabaseForTesting(client) {
    _supabase = client;
}

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

/**
 * Canonical Postflop Aggression Factor (AF) = (bets + raises) / calls.
 * Checks and folds are excluded from the denominator.
 * Returns explicit { value: null, available: false, reason } when calls === 0,
 * total postflop bet/raise/call actions === 0, or inputs are non-finite/negative,
 * never emitting NaN, Infinity, or a fabricated 0 when 0 calls occurred.
 */
export function computeAggressionFactor(betRaiseActions, callActions) {
    const parseCount = (v) => {
        if (v === null || v === undefined || typeof v === 'boolean') return null;
        if (typeof v === 'string' && v.trim() === '') return null;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const betsAndRaises = parseCount(betRaiseActions);
    const calls = parseCount(callActions);
    if (betsAndRaises === null || calls === null) {
        return {
            value: null,
            available: false,
            reason: 'unmeasured',
            betsAndRaises,
            calls,
            totalActions: null,
        };
    }
    const totalActions = betsAndRaises + calls;
    if (totalActions === 0) {
        return {
            value: null,
            available: false,
            reason: 'zero_sample',
            betsAndRaises: 0,
            calls: 0,
            totalActions: 0,
        };
    }
    if (calls === 0) {
        return {
            value: null,
            available: false,
            reason: 'zero_calls',
            betsAndRaises,
            calls: 0,
            totalActions,
        };
    }
    return {
        value: +(betsAndRaises / calls).toFixed(2),
        available: true,
        reason: null,
        betsAndRaises,
        calls,
        totalActions,
    };
}

async function readClubArenaFormatCounts(supabase, userId) {
    try {
        const cashQuery = supabase
            .from('ca_hand_facts')
            .select('hand_id', { count: 'exact', head: true })
            .eq('user_id', userId);
        const mttQuery = supabase
            .from('ca_hand_facts')
            .select('hand_id', { count: 'exact', head: true })
            .eq('user_id', userId);
        if (typeof cashQuery?.is !== 'function' || typeof mttQuery?.not !== 'function') {
            return { cashHands: null, tournamentHands: null };
        }
        const [cashRes, mttRes] = await Promise.all([
            cashQuery.is('tournament_id', null),
            mttQuery.not('tournament_id', 'is', null),
        ]);
        const cashHands = !cashRes?.error && typeof cashRes?.count === 'number' ? cashRes.count : null;
        const tournamentHands = !mttRes?.error && typeof mttRes?.count === 'number' ? mttRes.count : null;
        return { cashHands, tournamentHands };
    } catch (_) {
        return { cashHands: null, tournamentHands: null };
    }
}

async function readClubArenaAggressionFactor(supabase, userId) {
    try {
        let query = supabase
            .from('ca_hand_facts')
            .select('af_bet_raise_actions, af_call_actions')
            .eq('user_id', userId);
        if (typeof query?.order === 'function') {
            query = query.order('played_at', { ascending: false });
        }
        if (typeof query?.limit === 'function') {
            query = query.limit(2000);
        }
        const res = await query;
        if (res?.error || !Array.isArray(res?.data) || res.data.length === 0) {
            return computeAggressionFactor(null, null);
        }
        let betRaiseTotal = 0;
        let callTotal = 0;
        let seenAny = false;
        for (const row of res.data) {
            if (!row || typeof row !== 'object') continue;
            const br = Number(row.af_bet_raise_actions);
            const c = Number(row.af_call_actions);
            if (row.af_bet_raise_actions !== null && row.af_bet_raise_actions !== undefined && Number.isFinite(br) && br >= 0) {
                betRaiseTotal += br;
                seenAny = true;
            }
            if (row.af_call_actions !== null && row.af_call_actions !== undefined && Number.isFinite(c) && c >= 0) {
                callTotal += c;
                seenAny = true;
            }
        }
        if (!seenAny) {
            return computeAggressionFactor(null, null);
        }
        return computeAggressionFactor(betRaiseTotal, callTotal);
    } catch (_) {
        return computeAggressionFactor(null, null);
    }
}

export default async function handler(req, res) {
  try {
    // Per-user training stats · never cache across auth state transitions or mutations
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.read || LIMITS.write)) return;

    // JWT Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(200).json({ success: true, stats: getDefaultStats(), isDemo: true });
    }

    const { user: authUser, error: authErr, status: authStatus } = await getServerUserWithFallback(req, getSupabase());
    if (authErr || !authUser) {
      return res.status(authStatus || 401).json({ success: false, error: authStatus === 503 ? 'Session verification unavailable' : 'Invalid token' });
    }

    const userId = authUser.id;

    try {
      // The aggregate row is a projection, not the source of truth. Sandbox
      // session counters used to drift because cached analyses skipped writes
      // and concurrent read-modify-write increments could overwrite each other.
      // Always count the owned session rows and active leaks live; retain the
      // stored hand total only for Club Arena scans, whose unique-hand count is
      // deliberately persisted by the deterministic audit endpoint.
      const [storedRes, sandboxRes, leakStats, clubHandsRes, formatCounts, aggressionFactor] = await Promise.all([
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
        getSupabase()
          .from('ca_hand_facts')
          .select('hand_id', { count: 'exact', head: true })
          .eq('user_id', userId),
        readClubArenaFormatCounts(getSupabase(), userId),
        readClubArenaAggressionFactor(getSupabase(), userId),
      ]);

      const stored = storedRes?.data || null;
      const failedSources = [];
      if (storedRes?.error) failedSources.push('user_assistant_stats');
      if (sandboxRes?.error) failedSources.push('sandbox_sessions');
      if (clubHandsRes?.error && clubHandsRes.error.code !== '42P01') failedSources.push('ca_hand_facts');
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
      const availableClubArenaHands = !clubHandsRes?.error && typeof clubHandsRes?.count === 'number'
        ? clubHandsRes.count
        : null;
      const cashHands = formatCounts?.cashHands ?? null;
      const tournamentHands = formatCounts?.tournamentHands ?? null;
      const formatScope = cashHands !== null && tournamentHands !== null
        ? (cashHands > 0 && tournamentHands > 0
            ? 'cash_and_tournament'
            : (tournamentHands > 0 ? 'tournament_only' : (cashHands > 0 ? 'cash_only' : 'no_hands')))
        : 'combined_or_unavailable';

      return res.status(200).json({
        success: true,
        stats: {
          sessionsReviewed: sandboxCount,
          handsAnalyzed,
          availableClubArenaHands,
          cashHands,
          tournamentHands,
          formatBreakdown: {
            cashHands,
            tournamentHands,
            scope: formatScope,
          },
          aggressionFactor,
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
            : (stored ? 'deterministic_audit_total' : 'not_yet_audited'),
          availableClubArenaHands: availableClubArenaHands === null ? 'unavailable' : 'live_count',
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
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
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
  // No-auth / error path: all zeros. Never fabricate non-zero stats ·
  // consumers read isDemo:true alongside this and show a sign-in state.
  return {
    sessionsReviewed: 0,
    handsAnalyzed: 0,
    leaksFound: 0,
    resolvedLeaks: 0,
    sandboxSessions: 0,
    avgEvLoss: 0,
    aggressionFactor: computeAggressionFactor(null, null),
  };
}
