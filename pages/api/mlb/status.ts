import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMlbSupabase } from '../../../utils/supabase/mlb';

interface DashboardData {
  pipeline_runs?: Array<{
    step?: string;
    stage?: string;
    run_ts?: string;
    status?: string;
    duration_sec?: number | string;
    rows_written?: number | string;
    notes?: string;
  }>;
  health?: Record<string, any>;
  tier_dist?: Record<string, any>;
  server_now?: string;
  today?: string;
  agg_as_of?: string;
  slate?: Record<string, any>;
  accuracy?: Record<string, any>;
  sources?: any[];
  alerts?: any[];
  table_counts?: Record<string, number>;
}

const STAGE_ORDER = ['predict', 'push', 'grade', 'grade_props', 'track', 'alert', 'export'];

const CORS_ORIGIN = process.env.VERCEL_ENV === 'production' ? 'https://smarter.poker' : '*';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const mainDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user: localUser } } = await mainDb.auth.getUser(token || '');
    if (!localUser) return res.status(401).json({ ok: false, error: 'Auth required' });

    const { data: profile } = await mainDb
      .from('profiles')
      .select('is_admin')
      .eq('id', localUser.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return res.status(403).json({ ok: false, error: 'Admin only' });
    }

    const mlbDb = getMlbSupabase();

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Database Timeout')), 8000);
    });

    const rpcPromise = mlbDb.rpc('get_status_dashboard').maybeSingle();

    let data, rpcError;
    try {
      const result = await Promise.race([rpcPromise, timeoutPromise]) as { data: any; error: any };
      data = result?.data;
      rpcError = result?.error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (rpcError) throw rpcError;

    const d = (data || {}) as DashboardData;

    const pipelineRuns = Array.isArray(d.pipeline_runs) ? d.pipeline_runs : [];
    const latestRuns: Record<string, any> = {};
    for (const run of pipelineRuns) {
      const stage = run?.stage || run?.step;
      if (stage && !latestRuns[stage]) {
        latestRuns[stage] = {
          step: run?.step ?? stage,
          stage,
          run_ts: run?.run_ts ?? null,
          status: run?.status ?? 'unknown',
          duration_sec: run?.duration_sec != null ? Number(run.duration_sec) : null,
          rows_written: run?.rows_written != null ? Number(run.rows_written) : null,
          notes: run?.notes ?? null,
        };
      }
    }

    const presentStages = Object.keys(latestRuns);
    const stages = presentStages.sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a);
      const ib = STAGE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    let okCount = 0;
    let errorCount = 0;
    let pendingCount = 0;
    for (const stage of stages) {
      const s = String(latestRuns[stage]?.status || '').toLowerCase();
      if (s === 'success' || s === 'ok' || s === 'done' || s === 'partial') okCount += 1;
      else if (['error', 'failed', 'timeout', 'critical'].includes(s)) errorCount += 1;
      else if (['pending', 'running', 'started', 'in_progress'].includes(s)) pendingCount += 1;
    }
    const pipelineHasError = errorCount > 0;

    const rawHealth = d.health && typeof d.health === 'object' ? d.health : {};
    const health = {
      minutes_since_refresh:
        rawHealth.minutes_since_refresh ??
        (rawHealth.hours_stale != null ? (rawHealth.hours_stale * 60) : null),
      last_refresh: rawHealth.last_refresh ?? rawHealth.latest_as_of ?? null,
      is_stale: rawHealth.is_stale ?? true,
      slate_as_of: rawHealth.slate_as_of ?? rawHealth.latest_as_of ?? null,
      games_in_run: rawHealth.games_in_run ?? null,
      games_in_slate: rawHealth.games_in_slate ?? rawHealth.games_in_run ?? null,
      total_live_recs: rawHealth.total_live_recs ?? null,
      unmodeled_games: rawHealth.unmodeled_games ?? null,
      incoherent_runlines_with_bet: rawHealth.incoherent_runlines_with_bet ?? null,
    };
    const isSystemFresh = !!health.last_refresh && !health.is_stale && !pipelineHasError;

    const rawTierDist = d.tier_dist && typeof d.tier_dist === 'object' ? d.tier_dist : {};
    const tierDist = Object.fromEntries(
      Object.entries(rawTierDist).map(([k, v]) => [String(k).toUpperCase(), v])
    );

    res.setHeader('Cache-Control', 'private, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      ok: true,
      serverNow: d.server_now ?? null,
      today: d.today ?? null,
      aggAsOf: d.agg_as_of ?? null,
      isSystemFresh,
      pipeline: {
        okCount,
        errorCount,
        pendingCount,
        total: stages.length,
        hasError: pipelineHasError,
      },
      health,
      slate: d.slate && typeof d.slate === 'object' ? d.slate : {},
      accuracy: d.accuracy && typeof d.accuracy === 'object' ? d.accuracy : {},
      tierDist,
      sources: Array.isArray(d.sources) ? d.sources : [],
      alerts: Array.isArray(d.alerts) ? d.alerts : [],
      tableCounts: d.table_counts && typeof d.table_counts === 'object' ? d.table_counts : {},
      stages,
      latestRuns,
    });
  } catch (err: any) {
    console.error('Error fetching MLB status data:', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: false,
      error: err && err.message ? String(err.message) : 'Failed to load status data',
      serverNow: new Date().toISOString(),
    });
  }
}
