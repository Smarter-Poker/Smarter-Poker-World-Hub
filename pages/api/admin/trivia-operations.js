/**
 * GET/POST /api/admin/trivia-operations
 *
 * The browser supplies only its bearer token, a stable retry key and bounded
 * action input. The server verifies the session, derives the operator id, asks
 * the database for named Trivia capabilities, and delegates every mutation to
 * the Phase 11 exact-once authority RPC. Service credentials and raw evidence
 * never enter the browser bundle.
 */

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import {
    buildTriviaOperationsSnapshot,
    normalizeOperatorContext,
    parseOperationsActionRequest,
    parseSupportLookupRequest,
    TRIVIA_OPERATIONS_CONTRACT,
    triviaOperationsControls,
} from '../../../src/lib/trivia/operationsSnapshot.mjs';

const TOURNAMENT_METRIC_COLUMNS = [
    'tournament_id', 'schedule_kind', 'scheduled_local_date', 'start_time',
    'lifecycle_state', 'terminal_reason', 'horse_target', 'horse_population_mode',
    'horses_entered', 'humans_entered', 'population_outcome', 'start_delay_seconds',
    'settlement_latency_seconds', 'event_duration_seconds', 'max_round_seconds',
    'no_shows', 'stuck_rounds', 'gross_entry_total', 'horse_funding_total',
    'human_payout_total', 'horse_payout_total', 'settlement_state', 'escrow_balance',
].join(',');

let cachedClient = null;
function serviceClient() {
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) return null;
    if (!cachedClient) cachedClient = createClient(url, key, { auth: { persistSession: false } });
    return cachedClient;
}

function safeSourceError(error) {
    if (!error) return null;
    const code = typeof error.code === 'string' ? error.code : 'read_failed';
    return `${code}: ${String(error.message || 'source read failed').slice(0, 160)}`;
}

async function requireTriviaOperator(req, res, client) {
    if (!req.headers?.authorization?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'authorization_required' });
        return null;
    }
    const { user, error } = await getServerUserWithFallback(req, client);
    if (error || !user?.id) {
        res.status(401).json({ success: false, error: 'invalid_session' });
        return null;
    }
    const { data, error: contextError } = await client.rpc('trivia_operator_context_v1', {
        p_operator_id: user.id,
    });
    if (contextError) {
        console.warn('[trivia-operations] operator context unavailable:', contextError.code || 'read_failed');
        res.status(503).json({ success: false, error: 'operator_context_unavailable' });
        return null;
    }
    const context = normalizeOperatorContext(data);
    if (!context.allowed) {
        res.status(403).json({ success: false, error: 'trivia_operator_required' });
        return null;
    }
    return { user, context };
}

function statusForAction(item) {
    if (item?.success) return 200;
    if (item?.outcome === 'standby') return 409;
    const error = item?.result?.error || item?.error;
    if (error === 'operator_capability_required') return 403;
    if (error === 'idempotency_conflict') return 409;
    if (error === 'unsupported_action') return 422;
    if (error === 'scheduler_busy' || error === 'action_failed') return 503;
    if (String(error || '').startsWith('invalid_') || error === 'target_required' || error === 'reason_required') return 400;
    return 409;
}

function actionDto(data) {
    return {
        receiptId: data?.receipt_id || null,
        replayed: data?.replayed === true,
        action: data?.action || null,
        outcome: data?.outcome || null,
        result: data?.result && typeof data.result === 'object' ? data.result : {},
    };
}

async function getSnapshot(req, res, client, operator) {
    const generatedAt = new Date().toISOString();
    const since = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
    const upcomingStates = ['scheduled', 'registration', 'held', 'live', 'settling'];
    const activeStates = ['registration', 'held', 'live', 'settling'];
    const terminalStates = ['settled', 'cancelled'];
    let lookup = null;
    if (req.query?.lookupKind !== undefined || req.query?.lookupId !== undefined) {
        const parsedLookup = parseSupportLookupRequest({
            kind: req.query.lookupKind,
            targetId: req.query.lookupId,
        });
        if (!parsedLookup.ok) return res.status(400).json({ success: false, error: parsedLookup.error });
        lookup = parsedLookup.value;
    }

    const reads = [
        client.rpc('trivia_question_health_v1', { p_record: false }),
        client.rpc('trivia_pvp_metrics_v2', { p_since: since }),
        client.rpc('trivia_tournament_health_v1'),
        client.rpc('trivia_operations_health_v1', { p_operator_id: operator.user.id, p_record: true }),
        client.rpc('trivia_competitive_cutover_status_v1'),
        client.rpc('trivia_operator_recent_events_v1', { p_operator_id: operator.user.id, p_limit: 50 }),
        client.from('trivia_tournament_metrics_v1').select(TOURNAMENT_METRIC_COLUMNS)
            .eq('schedule_kind', 'public_nightly').in('lifecycle_state', upcomingStates)
            .gte('start_time', generatedAt).order('start_time', { ascending: true }).limit(7),
        client.from('trivia_tournament_metrics_v1').select(TOURNAMENT_METRIC_COLUMNS)
            .in('lifecycle_state', activeStates).order('start_time', { ascending: true }).limit(16),
        client.from('trivia_tournament_metrics_v1').select(TOURNAMENT_METRIC_COLUMNS)
            .in('lifecycle_state', terminalStates).order('start_time', { ascending: false }).limit(16),
        client.from('trivia_tournament_bracket_rounds')
            .select('tournament_id,round_number,status,matchup_count,resolved_count,opens_at,deadline_at')
            .in('status', ['pending', 'open']).order('opens_at', { ascending: true }).limit(100),
        client.from('trivia_tournament_matchups').select('tournament_id,round_number,status')
            .in('status', ['pending', 'ready']).limit(1000),
        client.from('trivia_tournament_scheduler_leases')
            .select('job_identity,holder_id,fencing_token,acquired_at,renewed_at,expires_at,released_at,takeovers')
            .eq('job_identity', 'openclaw:trivia-nightly-tournament').maybeSingle(),
        client.from('trivia_tournament_scheduler_runs')
            .select('run_id,job_identity,holder_id,outcome,fencing_token,started_at,finished_at,ticks,alerts,healthy')
            .eq('job_identity', 'openclaw:trivia-nightly-tournament')
            .order('started_at', { ascending: false }).limit(12),
        client.from('trivia_ops_alert_state')
            .select('alertname,severity,episode_key,firing_since,last_seen_at,last_summary')
            .is('resolved_at', null).order('firing_since', { ascending: true }).limit(100),
        client.from('competitive_quarantine').select('entity_type,reason_code').limit(1000),
        client.from('trivia_question_quarantine').select('reason_code,source')
            .is('released_at', null).limit(5000),
        client.from('trivia_pvp_engine_config')
            .select('joins_enabled,horses_enabled,lease_seconds,heartbeat_seconds,dead_ticket_grace_seconds,max_search_seconds,horse_concurrency_ceiling,dealing_seconds,result_visible_seconds,updated_at')
            .eq('id', 1).maybeSingle(),
    ];
    if (lookup) {
        reads.push(lookup.kind === 'settlement'
            ? client.rpc('trivia_settlement_payout_control_status_v1', {
                p_operator_id: operator.user.id,
                p_settlement_id: lookup.targetId,
            })
            : client.rpc('trivia_operator_support_lookup_v1', {
                p_operator_id: operator.user.id,
                p_kind: lookup.kind,
                p_target_id: lookup.targetId,
            }));
    }

    const [
        questionHealthResult, pvpMetricsResult, tournamentHealthResult,
        operationsHealthResult, cutoverStatusResult, operatorEventsResult, upcomingResult, activeResult,
        recentResult, tournamentRoundsResult, tournamentMatchupsResult,
        schedulerLeaseResult, schedulerRunsResult, alertsResult, quarantineResult,
        questionQuarantineResult, pvpConfigResult, supportLookupResult,
    ] = await Promise.all(reads);

    const namedResults = {
        question_health: questionHealthResult,
        pvp_metrics: pvpMetricsResult,
        tournament_health: tournamentHealthResult,
        operations_health: operationsHealthResult,
        competitive_cutover_status: cutoverStatusResult,
        operator_events: operatorEventsResult,
        upcoming_tournaments: upcomingResult,
        active_tournaments: activeResult,
        recent_tournaments: recentResult,
        tournament_rounds: tournamentRoundsResult,
        tournament_matchups: tournamentMatchupsResult,
        scheduler_lease: schedulerLeaseResult,
        scheduler_runs: schedulerRunsResult,
        alert_state: alertsResult,
        historical_quarantine: quarantineResult,
        question_quarantine: questionQuarantineResult,
        pvp_config: pvpConfigResult,
    };
    if (lookup) namedResults.support_lookup = supportLookupResult;
    const sourceErrors = {};
    for (const [name, result] of Object.entries(namedResults)) {
        const message = safeSourceError(result?.error);
        if (message) sourceErrors[name] = message;
    }

    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt,
        window: { since, hours: 24 },
        controls: triviaOperationsControls(process.env),
        operatorContext: operator.context,
        questionHealth: questionHealthResult.data || null,
        pvpMetrics: pvpMetricsResult.data || null,
        tournamentHealth: tournamentHealthResult.data || null,
        operationsHealth: operationsHealthResult.data || null,
        cutoverStatus: cutoverStatusResult.data || null,
        operatorEvents: operatorEventsResult.data || [],
        supportLookup: supportLookupResult?.data || null,
        upcomingTournaments: upcomingResult.data || [],
        activeTournaments: activeResult.data || [],
        recentTournaments: recentResult.data || [],
        tournamentRounds: tournamentRoundsResult.data || [],
        tournamentMatchups: tournamentMatchupsResult.data || [],
        schedulerLease: schedulerLeaseResult.data || null,
        schedulerRuns: schedulerRunsResult.data || [],
        activeAlerts: alertsResult.data || [],
        quarantineRows: quarantineResult.data || [],
        questionQuarantineRows: questionQuarantineResult.data || [],
        pvpConfig: pvpConfigResult.data || null,
        sourceErrors,
    });
    return res.status(snapshot.healthy ? 200 : 503).json(snapshot);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'POST' ? LIMITS.write : LIMITS.read)) return;

    const client = serviceClient();
    if (!client) return res.status(503).json({ success: false, error: 'server_misconfigured' });
    const operator = await requireTriviaOperator(req, res, client);
    if (!operator) return;

    try {
        if (req.method === 'POST') {
            const parsed = parseOperationsActionRequest(req.body);
            if (!parsed.ok) {
                const status = parsed.error === 'request_too_large' ? 413 : 400;
                return res.status(status).json({ success: false, error: parsed.error });
            }
            const action = parsed.value;
            const { data, error } = await client.rpc('trivia_operator_execute_v1', {
                p_operator_id: operator.user.id,
                p_request_key: action.requestKey,
                p_action: action.action,
                p_reason: action.reason,
                p_target_id: action.targetId,
                p_payload: action.payload,
            });
            if (error) {
                console.warn('[trivia-operations] action RPC failed:', error.code || 'rpc_failed');
                return res.status(503).json({ success: false, error: 'action_authority_unavailable' });
            }
            const item = actionDto(data);
            return res.status(statusForAction({ ...data, result: item.result })).json({
                success: data?.success === true,
                contract: TRIVIA_OPERATIONS_CONTRACT,
                version: 1,
                item,
            });
        }
        return await getSnapshot(req, res, client, operator);
    } catch (error) {
        console.warn('[trivia-operations] request failed:', error?.message || error);
        try { reportApiError(error, { route: '/api/admin/trivia-operations' }); } catch (_) {}
        return res.status(500).json({ success: false, error: 'operations_request_failed' });
    }
}
