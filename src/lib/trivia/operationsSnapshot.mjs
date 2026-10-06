/**
 * Pure Phase 11 operations snapshot policy.
 *
 * Database reads live in the admin API. Keeping interpretation here gives the
 * dashboard and focused contracts one vocabulary for health and SLO breaches,
 * while guaranteeing that quarantine evidence is reduced to counts before it
 * can cross the API boundary.
 */

import {
    isFreeLegacyFallbackEnabled,
    isShadowSelectorEnabled,
    isSoloEngineV3Enabled,
} from './phase3Engine.mjs';
import {
    areTriviaPvpHorsesReleased,
    isTriviaPvpReleased,
} from './pvpReleaseControl.mjs';
import {
    areTriviaTournamentHorsesReleased,
    areTriviaTournamentsReleased,
} from './tournamentReleaseControl.mjs';

export const TRIVIA_OPERATIONS_SLOS = Object.freeze({
    pvpFallbackP95Ms: 45_000,
    settlementP95Ms: 10_000,
    upcomingTournamentInstances: 7,
});

export const TRIVIA_OPERATIONS_CONTRACT = 'trivia-operations/1';

export const TRIVIA_COMPETITIVE_CUTOVER_GATES = Object.freeze([
    'pvp_public',
    'pvp_horses',
    'tournament_public',
    'tournament_horses',
    'tournament_scheduler',
]);

export const TRIVIA_OPERATOR_ROLES = Object.freeze([
    'observer',
    'question_curator',
    'engine_operator',
    'settlement_operator',
    'supervisor',
]);

export const TRIVIA_OPERATOR_CAPABILITIES = Object.freeze([
    'snapshot',
    'support_lookup',
    'incident_note',
    'question_quarantine',
    'question_release',
    'pvp_recover',
    'pvp_switch',
    'tournament_cancel',
    'tournament_recover',
    'settlement_control',
]);

export const TRIVIA_OPERATOR_ACTIONS = Object.freeze({
    question_quarantine: Object.freeze({ capability: 'question_quarantine', targetRequired: true, payloadKeys: ['reasonCode'] }),
    question_release: Object.freeze({ capability: 'question_release', targetRequired: true, payloadKeys: [] }),
    pvp_recover: Object.freeze({ capability: 'pvp_recover', targetRequired: false, payloadKeys: ['limit'] }),
    pvp_joins_set: Object.freeze({ capability: 'pvp_switch', targetRequired: false, payloadKeys: ['enabled'] }),
    pvp_horses_set: Object.freeze({ capability: 'pvp_switch', targetRequired: false, payloadKeys: ['enabled'] }),
    tournament_cancel: Object.freeze({ capability: 'tournament_cancel', targetRequired: true, payloadKeys: [] }),
    tournament_recover_settlement: Object.freeze({ capability: 'tournament_recover', targetRequired: true, payloadKeys: [] }),
    incident_note: Object.freeze({ capability: 'incident_note', targetRequired: false, payloadKeys: ['incidentKey', 'note', 'severity', 'status'] }),
    payout_hold: Object.freeze({ capability: 'settlement_control', targetRequired: true, payloadKeys: [] }),
    payout_release: Object.freeze({ capability: 'settlement_control', targetRequired: true, payloadKeys: [] }),
    round_recover: Object.freeze({ capability: 'tournament_recover', targetRequired: true, payloadKeys: [] }),
    match_recover: Object.freeze({ capability: 'tournament_recover', targetRequired: true, payloadKeys: [] }),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY_RE = /^[A-Za-z0-9_.:@-]{8,128}$/;
const REASON_CODE_RE = /^[a-z0-9_]{3,64}$/;
const INCIDENT_KEY_RE = /^[A-Za-z0-9_.:@-]{3,120}$/;
const PROHIBITED_AUTHORITY_FIELDS = new Set([
    'operatorId', 'userId', 'role', 'roles', 'capability', 'capabilities',
    'amount', 'diamonds', 'unlocked', 'outcome', 'receiptId', 'settledDiamonds',
]);

function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function invalid(error) {
    return { ok: false, error };
}

export function normalizeOperatorContext(value) {
    const roles = Array.isArray(value?.roles)
        ? value.roles.filter((role) => TRIVIA_OPERATOR_ROLES.includes(role))
        : [];
    const capabilities = Array.isArray(value?.capabilities)
        ? value.capabilities.filter((capability) => TRIVIA_OPERATOR_CAPABILITIES.includes(capability))
        : [];
    return {
        allowed: value?.allowed === true && roles.length > 0 && capabilities.includes('snapshot'),
        roles: [...new Set(roles)],
        capabilities: [...new Set(capabilities)],
    };
}

export function parseOperationsActionRequest(body) {
    if (!plainObject(body)) return invalid('invalid_request');
    if (JSON.stringify(body).length > 4096) return invalid('request_too_large');
    const allowedTop = new Set(['requestKey', 'action', 'reason', 'targetId', 'payload']);
    if (Object.keys(body).some((key) => !allowedTop.has(key) || PROHIBITED_AUTHORITY_FIELDS.has(key))) {
        return invalid('unknown_or_authority_field');
    }

    const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const targetId = body.targetId == null ? null : String(body.targetId).trim();
    const payload = body.payload == null ? {} : body.payload;
    const definition = TRIVIA_OPERATOR_ACTIONS[action];
    if (!REQUEST_KEY_RE.test(requestKey)) return invalid('invalid_request_key');
    if (!definition) return invalid('invalid_action');
    if (reason.length < 8 || reason.length > 500) return invalid('invalid_reason');
    if (definition.targetRequired && !UUID_RE.test(targetId || '')) return invalid('invalid_target');
    if (!definition.targetRequired && targetId !== null && !UUID_RE.test(targetId)) return invalid('invalid_target');
    if (!plainObject(payload)) return invalid('invalid_payload');
    if (Object.keys(payload).some((key) => !definition.payloadKeys.includes(key) || PROHIBITED_AUTHORITY_FIELDS.has(key))) {
        return invalid('invalid_payload_field');
    }

    if (action === 'question_quarantine' && !REASON_CODE_RE.test(String(payload.reasonCode || ''))) {
        return invalid('invalid_reason_code');
    }
    if ((action === 'pvp_joins_set' || action === 'pvp_horses_set') && typeof payload.enabled !== 'boolean') {
        return invalid('enabled_required');
    }
    if (action === 'pvp_recover' && payload.limit !== undefined) {
        const limit = Number(payload.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return invalid('invalid_limit');
    }
    if (action === 'incident_note') {
        const incidentKey = String(payload.incidentKey || '').trim();
        const note = String(payload.note || '').trim();
        if (!INCIDENT_KEY_RE.test(incidentKey) || note.length < 8 || note.length > 2000) {
            return invalid('invalid_incident_note');
        }
        if (payload.severity !== undefined && !['info', 'warning', 'critical'].includes(payload.severity)) {
            return invalid('invalid_incident_severity');
        }
        if (payload.status !== undefined && !['open', 'monitoring', 'resolved'].includes(payload.status)) {
            return invalid('invalid_incident_status');
        }
    }

    return {
        ok: true,
        value: { requestKey, action, reason, targetId, payload: { ...payload } },
    };
}

export function parseSupportLookupRequest(query) {
    const kind = typeof query?.kind === 'string' ? query.kind.trim() : '';
    const targetId = typeof query?.targetId === 'string' ? query.targetId.trim() : '';
    if (!['user', 'pvp_match', 'tournament', 'question'].includes(kind) || !UUID_RE.test(targetId)) {
        return invalid('invalid_support_lookup');
    }
    return { ok: true, value: { kind, targetId } };
}

export function triviaOperationsControls(env = {}) {
    return {
        solo_engine_v3: isSoloEngineV3Enabled(env),
        free_legacy_fallback: isFreeLegacyFallbackEnabled(env),
        shadow_selector: isShadowSelectorEnabled(env),
        pvp_routes_and_engine: isTriviaPvpReleased(env),
        pvp_horses: areTriviaPvpHorsesReleased(env),
        tournament_routes_and_engine: areTriviaTournamentsReleased(env),
        tournament_horses: areTriviaTournamentHorsesReleased(env),
    };
}

const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

function issue(code, severity, summary) {
    return { code, severity, summary };
}

export function normalizeCompetitiveCutoverStatus(value) {
    const rawGates = plainObject(value?.gates) ? value.gates : {};
    const gates = {};
    let complete = true;
    for (const key of TRIVIA_COMPETITIVE_CUTOVER_GATES) {
        const raw = plainObject(rawGates[key]) ? rawGates[key] : null;
        const version = Number(raw?.version);
        if (!raw || !Number.isInteger(version) || version < 1) complete = false;
        gates[key] = {
            enabled: raw?.enabled === true,
            version: Number.isInteger(version) && version >= 1 ? version : null,
            certificate_id: typeof raw?.certificate_id === 'string' ? raw.certificate_id : null,
            created_at: typeof raw?.created_at === 'string' ? raw.created_at : null,
        };
    }
    return {
        available: complete,
        version: Number.isInteger(Number(value?.version)) ? Number(value.version) : null,
        gates,
        named_test_wallet_count: finite(value?.named_test_wallet_count)
            ? Number(value.named_test_wallet_count)
            : null,
        ledger_clean: value?.ledger_clean === true,
        treasury: plainObject(value?.treasury) ? {
            account: typeof value.treasury.account === 'string' ? value.treasury.account : null,
            balance: finite(value.treasury.balance) ? Number(value.treasury.balance) : null,
            floor: finite(value.treasury.floor) ? Number(value.treasury.floor) : null,
            available: finite(value.treasury.available) ? Number(value.treasury.available) : null,
        } : null,
        recovery_status: normalizePvpRecoveryStatus(value?.recovery_status),
    };
}

function normalizePvpRecoveryStatus(value) {
    if (!plainObject(value)) return null;
    const count = (field) => {
        const parsed = Number(value[field]);
        return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    };
    return {
        run_id: typeof value.run_id === 'string' ? value.run_id : null,
        outcome: ['owner', 'standby'].includes(value.outcome) ? value.outcome : null,
        started_at: typeof value.started_at === 'string' ? value.started_at : null,
        finished_at: typeof value.finished_at === 'string' ? value.finished_at : null,
        healthy: value.healthy === true,
        success: value.success === true,
        tickets_expired: count('tickets_expired'),
        matches_scanned: count('matches_scanned'),
        settled: count('settled'),
        pending: count('pending'),
        failed: count('failed'),
    };
}

function summarizeQuarantine(rows) {
    const counts = {};
    for (const row of Array.isArray(rows) ? rows : []) {
        const entity = typeof row?.entity_type === 'string' ? row.entity_type : 'unknown';
        const reason = typeof row?.reason_code === 'string' ? row.reason_code : 'unknown';
        const key = `${entity}:${reason}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    return {
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        by_reason: counts,
    };
}

function summarizeQuestionQuarantine(rows) {
    const byReason = {};
    const bySource = {};
    for (const row of Array.isArray(rows) ? rows : []) {
        const reason = typeof row?.reason_code === 'string' ? row.reason_code : 'unknown';
        const source = typeof row?.source === 'string' ? row.source : 'unknown';
        byReason[reason] = (byReason[reason] || 0) + 1;
        bySource[source] = (bySource[source] || 0) + 1;
    }
    return {
        active: Object.values(byReason).reduce((sum, count) => sum + count, 0),
        by_reason: byReason,
        by_source: bySource,
    };
}

function schedulerState(lease, runs, nowMs) {
    const recentRuns = Array.isArray(runs) ? runs : [];
    const expiresMs = lease?.expires_at ? Date.parse(lease.expires_at) : Number.NaN;
    const leaseActive = Boolean(lease?.holder_id)
        && !lease?.released_at
        && Number.isFinite(expiresMs)
        && expiresMs > nowMs;
    const unfinishedOwners = recentRuns.filter((run) => run?.outcome === 'owner' && !run?.finished_at);
    return {
        lease: lease || null,
        recent_runs: recentRuns,
        active_owner_observed: leaseActive,
        unfinished_owner_runs: unfinishedOwners.length,
    };
}

function summarizeTournamentActivity(roundRows, matchupRows) {
    const rounds = { pending: 0, open: 0, closed: 0 };
    const matchups = { pending: 0, ready: 0, resolved: 0 };
    for (const row of Array.isArray(roundRows) ? roundRows : []) {
        if (Object.hasOwn(rounds, row?.status)) rounds[row.status] += 1;
    }
    for (const row of Array.isArray(matchupRows) ? matchupRows : []) {
        if (Object.hasOwn(matchups, row?.status)) matchups[row.status] += 1;
    }
    return { rounds, matchups };
}

/**
 * Build the browser-safe read-only control-room payload.
 *
 * `sourceErrors` must already contain sanitized source names/messages. Raw
 * Supabase errors, answer material, profile data and quarantine snapshots are
 * deliberately outside this contract.
 */
export function buildTriviaOperationsSnapshot(input = {}) {
    const generatedAt = input.generatedAt || new Date().toISOString();
    const generatedMs = Date.parse(generatedAt);
    const nowMs = Number.isFinite(generatedMs) ? generatedMs : Date.now();
    const controls = input.controls || triviaOperationsControls({});
    const sourceErrors = input.sourceErrors && typeof input.sourceErrors === 'object'
        ? input.sourceErrors
        : {};
    const pvp = input.pvpMetrics || null;
    const tournament = input.tournamentHealth || null;
    const question = input.questionHealth || null;
    const scheduler = schedulerState(input.schedulerLease, input.schedulerRuns, nowMs);
    const authority = normalizeOperatorContext(input.operatorContext);
    const operationsHealth = input.operationsHealth || null;
    const cutoverStatusProvided = Object.hasOwn(input, 'cutoverStatus');
    const cutoverStatus = normalizeCompetitiveCutoverStatus(input.cutoverStatus);
    const issues = [];

    for (const source of Object.keys(sourceErrors).sort()) {
        issues.push(issue(
            `source_unavailable:${source}`,
            'critical',
            `${source.replaceAll('_', ' ')} could not be read`,
        ));
    }

    if (question?.healthy === false) {
        issues.push(issue('question_domain_unhealthy', 'critical', 'Question serving health has active conditions'));
    }
    if (tournament?.healthy === false) {
        issues.push(issue('tournament_domain_unhealthy', 'critical', 'Nightly tournament health has active alerts'));
    }

    const horseBeforeDeadline = pvp?.fallback?.horse_before_deadline;
    if (finite(horseBeforeDeadline) && Number(horseBeforeDeadline) > 0) {
        issues.push(issue('pvp_horse_before_deadline', 'critical', 'A horse match occurred before its fallback deadline'));
    }
    const fallbackP95 = pvp?.join_to_match_ms?.horse_p95;
    if (finite(fallbackP95) && Number(fallbackP95) > TRIVIA_OPERATIONS_SLOS.pvpFallbackP95Ms) {
        issues.push(issue('pvp_fallback_p95_slow', 'warning', 'PvP horse fallback p95 exceeds 45 seconds'));
    }
    const settlementP95 = pvp?.settlement_latency_ms?.p95;
    if (finite(settlementP95) && Number(settlementP95) >= TRIVIA_OPERATIONS_SLOS.settlementP95Ms) {
        issues.push(issue('pvp_settlement_p95_slow', 'critical', 'PvP settlement p95 is not below 10 seconds'));
    }
    const openSettlements = pvp?.ledger_variance?.terminal_matches_with_open_settlement;
    const escrowVariance = pvp?.ledger_variance?.terminal_escrow_abs_total;
    if ((finite(openSettlements) && Number(openSettlements) > 0)
        || (finite(escrowVariance) && Number(escrowVariance) !== 0)) {
        issues.push(issue('pvp_terminal_ledger_variance', 'critical', 'Terminal PvP escrow is not fully reconciled'));
    }
    const settlementFailures = pvp?.matches?.settlement_failures;
    if (finite(settlementFailures) && Number(settlementFailures) > 0) {
        issues.push(issue('pvp_settlement_failures', 'critical', 'PvP settlement failures occurred in the selected window'));
    }

    const activeAlerts = Array.isArray(input.activeAlerts) ? input.activeAlerts : [];
    if (activeAlerts.length > 0) {
        issues.push(issue('question_alert_episodes_active', 'warning', `${activeAlerts.length} question alert episode(s) are active`));
    }

    if (controls.tournament_routes_and_engine && !scheduler.active_owner_observed) {
        issues.push(issue('scheduler_owner_absent', 'critical', 'Tournaments are released without an observed active scheduler lease'));
    }
    if (scheduler.unfinished_owner_runs > 1) {
        issues.push(issue('scheduler_duplicate_owner_runs', 'critical', 'More than one scheduler owner run is unfinished'));
    }
    if (cutoverStatusProvided && !cutoverStatus.available) {
        issues.push(issue('competitive_cutover_status_unavailable', 'critical', 'Durable competitive cutover certificates could not be read'));
    }
    if (cutoverStatus.available) {
        const gates = cutoverStatus.gates;
        // Phase 5 database switches may be on during the named-wallet canary
        // stage; the Phase 12 admission triggers still refuse every unnamed
        // player. Only a public edge release signal must match a certificate.
        const pvpPublicSignal = controls.pvp_routes_and_engine;
        const pvpHorseSignal = controls.pvp_horses;
        if (pvpPublicSignal && !gates.pvp_public.enabled) {
            issues.push(issue('cutover_pvp_public_mismatch', 'critical', 'PvP public routes are on while the durable public certificate is off'));
        }
        if (pvpHorseSignal && !gates.pvp_horses.enabled) {
            issues.push(issue('cutover_pvp_horses_mismatch', 'critical', 'PvP public horse fallback is on while the durable horse certificate is off'));
        }
        if (controls.tournament_routes_and_engine && !gates.tournament_public.enabled) {
            issues.push(issue('cutover_tournament_public_mismatch', 'critical', 'Tournament routes are on while the durable public certificate is off'));
        }
        if (controls.tournament_horses && !gates.tournament_horses.enabled) {
            issues.push(issue('cutover_tournament_horses_mismatch', 'critical', 'Tournament horses are on while the durable horse certificate is off'));
        }
        if (controls.tournament_routes_and_engine && !gates.tournament_scheduler.enabled) {
            issues.push(issue('cutover_tournament_scheduler_mismatch', 'critical', 'Tournament routes are on while the durable scheduler certificate is off'));
        }
        if (gates.pvp_horses.enabled && !gates.pvp_public.enabled) {
            issues.push(issue('cutover_pvp_horse_parent_disabled', 'critical', 'The PvP horse certificate is on while its public parent certificate is off'));
        }
        if (gates.tournament_horses.enabled && !gates.tournament_public.enabled) {
            issues.push(issue('cutover_tournament_horse_parent_disabled', 'critical', 'The tournament horse certificate is on while its public parent certificate is off'));
        }
        if (!cutoverStatus.ledger_clean) {
            issues.push(issue('cutover_ledger_unhealthy', 'critical', 'The Phase 12 competitive ledger readiness check is not clean'));
        }
        if (cutoverStatus.recovery_status?.healthy === false) {
            issues.push(issue('cutover_pvp_recovery_unhealthy', 'critical', 'The latest fenced PvP recovery run is unhealthy'));
        }
    }
    for (const condition of Array.isArray(operationsHealth?.conditions) ? operationsHealth.conditions : []) {
        if (!condition?.code) continue;
        issues.push(issue(
            condition.code,
            ['critical', 'warning', 'info'].includes(condition.severity) ? condition.severity : 'warning',
            typeof condition.summary === 'string' ? condition.summary : condition.code.replaceAll('_', ' '),
        ));
    }

    return {
        contract: TRIVIA_OPERATIONS_CONTRACT,
        version: 1,
        success: Object.keys(sourceErrors).length === 0,
        healthy: issues.length === 0,
        read_only: false,
        generated_at: generatedAt,
        window: input.window || null,
        slos: TRIVIA_OPERATIONS_SLOS,
        controls,
        cutover_status: cutoverStatus,
        authority,
        available_actions: Object.entries(TRIVIA_OPERATOR_ACTIONS)
            .filter(([, action]) => authority.capabilities.includes(action.capability))
            .map(([action]) => action),
        issues,
        question_health: question,
        question_quarantine: summarizeQuestionQuarantine(input.questionQuarantineRows),
        pvp_metrics: pvp,
        pvp_config: input.pvpConfig || null,
        tournament_health: tournament,
        tournaments: {
            upcoming: Array.isArray(input.upcomingTournaments) ? input.upcomingTournaments : [],
            active: Array.isArray(input.activeTournaments) ? input.activeTournaments : [],
            recent_terminal: Array.isArray(input.recentTournaments) ? input.recentTournaments : [],
            activity: summarizeTournamentActivity(input.tournamentRounds, input.tournamentMatchups),
        },
        scheduler,
        active_alerts: activeAlerts,
        operations_health: operationsHealth,
        operator_events: Array.isArray(input.operatorEvents) ? input.operatorEvents : [],
        support_lookup: input.supportLookup || null,
        historical_quarantine: summarizeQuarantine(input.quarantineRows),
        source_errors: sourceErrors,
    };
}
