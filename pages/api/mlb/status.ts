import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { NextApiRequest, NextApiResponse } from 'next';

// Canonical pipeline stage order (engine run sequence). Used to render runs in a
// sensible order regardless of the order rows come back from the database.
const STAGE_ORDER = [
    'predict', 'push', 'grade', 'grade_props', 'track', 'alert', 'export'
];

const CORS_ORIGIN = process.env.VERCEL_ENV === 'production'
    ? 'https://smarter.poker'
    : '*';  // allow any origin in dev/preview

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
};

async function edgeHandler(req: Request) {
    if (req.method !== 'GET' && req.method !== 'OPTIONS' && req.method !== 'HEAD') {
        return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: JSON_HEADERS
        });
    }

    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': CORS_ORIGIN,
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
            }
        });
    }

    return handleRequest();
}

async function handleRequest() {
    try {
        const mlbDb = getMlbSupabase();

        // Single hardened RPC returns the full status dashboard payload:
        // server_now, today, health, slate, accuracy, tier_dist, sources,
        // alerts, table_counts, pipeline_runs (newest-first), agg_as_of.
        const { data, error: rpcError } = await mlbDb.rpc('get_status_dashboard');

        if (rpcError) throw rpcError;

        const d: any = (Array.isArray(data) ? data[0] : data) || {};

        // Build "latest run per stage" from the newest-first pipeline_runs feed.
        const pipelineRuns: any[] = Array.isArray(d.pipeline_runs) ? d.pipeline_runs : [];
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
                    notes: run?.notes ?? null
                };
            }
        }

        // Order stages: canonical order first, then any unknown stages alphabetically.
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
        for (const stage of stages) {
            const s = String(latestRuns[stage]?.status || '').toLowerCase();
            // 'partial' counts as ok — engine writes it for incremental loads.
            if (s === 'success' || s === 'ok' || s === 'done' || s === 'partial') okCount += 1;
            else if (s === 'error' || s === 'failed') errorCount += 1;
        }
        const pipelineHasError = errorCount > 0;

        const rawHealth = (d.health && typeof d.health === 'object') ? d.health : {};
        const health = {
            minutes_since_refresh: rawHealth.hours_stale != null ? Math.round(rawHealth.hours_stale * 60) : null,
            last_refresh: rawHealth.latest_as_of ?? null,
            is_stale: rawHealth.is_stale ?? true,
            slate_as_of: rawHealth.latest_as_of ?? null,
            games_in_run: rawHealth.games_in_run ?? null,
            games_in_slate: rawHealth.games_in_run ?? null,
            total_live_recs: rawHealth.total_live_recs ?? null,
            unmodeled_games: rawHealth.unmodeled_games ?? null,
            incoherent_runlines_with_bet: rawHealth.incoherent_runlines_with_bet ?? null
        };
        // isSystemFresh requires we actually have health data (last_refresh present).
        // An empty health object {} means v_model_health returned no rows — that is NOT fresh.
        const isSystemFresh = !!health.last_refresh && !health.is_stale && !pipelineHasError;

        const rawTierDist = (d.tier_dist && typeof d.tier_dist === 'object') ? d.tier_dist : {};
        const tierDist = Object.fromEntries(
            Object.entries(rawTierDist).map(([k, v]) => [String(k).toUpperCase(), v])
        );

        return new Response(JSON.stringify({
            ok: true,
            serverNow: d.server_now ?? null,
            today: d.today ?? null,
            aggAsOf: d.agg_as_of ?? null,
            isSystemFresh,
            pipeline: {
                okCount,
                errorCount,
                total: stages.length,
                hasError: pipelineHasError
            },
            health,
            slate: (d.slate && typeof d.slate === 'object') ? d.slate : {},
            accuracy: (d.accuracy && typeof d.accuracy === 'object') ? d.accuracy : {},
            tierDist,
            sources: Array.isArray(d.sources) ? d.sources : [],
            alerts: Array.isArray(d.alerts) ? d.alerts : [],
            tableCounts: (d.table_counts && typeof d.table_counts === 'object') ? d.table_counts : {},
            stages,
            latestRuns
        }), {
            status: 200,
            headers: {
                ...JSON_HEADERS,
                // Short edge cache: keep a live status view fresh but shield the DB
                // from abuse. Was 60/300 which could serve a 5-min-stale status page.
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
            }
        });
    } catch (err: any) {
        // Surface a safe, specific error instead of an opaque 500 so the UI can
        // tell the user which subsystem failed and offer a retry. Returned as 200
        // (no-store) so the client renders the message rather than throwing.
        console.error('Error fetching MLB status data:', err);
        return new Response(JSON.stringify({
            ok: false,
            error: (err && err.message) ? String(err.message) : 'Failed to load status data',
            serverNow: new Date().toISOString()
        }), {
            status: 200,
            headers: {
                ...JSON_HEADERS,
                'Cache-Control': 'no-store'
            }
        });
    }
}

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
    return edgeHandler(req);
}
