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
    schedulerLivenessWindowMs: 180_000,
    treasuryWarningLevel: 6_000,
    fillWindowBeforeStartSeconds: 2_700,
    reconcileBeforeStartSeconds: 120,
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
    treasury_replenish_from_rake: Object.freeze({
        capability: 'settlement_control',
        roleRequired: 'supervisor',
        targetRequired: false,
        payloadKeys: ['replenishAmount'],
    }),
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
    if (action === 'treasury_replenish_from_rake') {
        const replenishAmount = Number(payload.replenishAmount);
        if (!Number.isInteger(replenishAmount) || replenishAmount < 1 || replenishAmount > 1_000_000) {
            return invalid('invalid_amount');
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
    if (!['user', 'pvp_match', 'tournament', 'question', 'settlement'].includes(kind) || !UUID_RE.test(targetId)) {
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
    const ownerRuns = recentRuns.filter((run) => run?.outcome === 'owner');
    const unfinishedOwners = ownerRuns.filter((run) => !run?.finished_at);
    let lastOwnerRunAt = null;
    let lastOwnerFinishedMs = Number.NaN;
    for (const run of ownerRuns) {
        const finishedMs = run?.finished_at ? Date.parse(run.finished_at) : Number.NaN;
        if (Number.isFinite(finishedMs) && (!Number.isFinite(lastOwnerFinishedMs) || finishedMs > lastOwnerFinishedMs)) {
            lastOwnerFinishedMs = finishedMs;
            lastOwnerRunAt = run.finished_at;
        }
    }
    const recentOwnerRunObserved = Number.isFinite(lastOwnerFinishedMs)
        && lastOwnerFinishedMs >= nowMs - TRIVIA_OPERATIONS_SLOS.schedulerLivenessWindowMs
        && lastOwnerFinishedMs <= nowMs + 60_000;
    return {
        lease: lease || null,
        recent_runs: recentRuns,
        active_owner_observed: leaseActive || recentOwnerRunObserved,
        last_owner_run_at: lastOwnerRunAt,
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

function chicagoLocalDate(ms) {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date(ms));
        const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        if (byType.year && byType.month && byType.day) {
            return `${byType.year}-${byType.month}-${byType.day}`;
        }
    } catch (_error) {
        // Fallback below if ICU timezone data is unavailable.
    }
    return new Date(ms).toISOString().slice(0, 10);
}

function normalizeLedgerSwitch(switchRow, ledgerHealth) {
    if (plainObject(switchRow)) {
        return {
            key: typeof switchRow.key === 'string' ? switchRow.key : 'solo_journal',
            enabled: switchRow.enabled === true,
            reason: typeof switchRow.reason === 'string' ? switchRow.reason : null,
            updated_at: typeof switchRow.updated_at === 'string' ? switchRow.updated_at : null,
        };
    }
    const fallbackEnabled = typeof ledgerHealth?.metrics?.solo_journal_switch === 'boolean'
        ? ledgerHealth.metrics.solo_journal_switch
        : null;
    return {
        key: 'solo_journal',
        enabled: fallbackEnabled,
        reason: null,
        updated_at: null,
    };
}

function normalizeLedgerHealth(value) {
    if (!plainObject(value)) return null;
    const metrics = plainObject(value.metrics) ? value.metrics : {};
    const findings = plainObject(value.findings) ? value.findings : {};
    return {
        healthy: value.healthy === true,
        exception_count: finite(value.exception_count) ? Number(value.exception_count) : null,
        solo_journal_switch: typeof metrics.solo_journal_switch === 'boolean' ? metrics.solo_journal_switch : null,
        treasury_balance: finite(metrics.treasury_balance) ? Number(metrics.treasury_balance) : null,
        treasury_floor: finite(metrics.treasury_floor) ? Number(metrics.treasury_floor) : null,
        treasury_below_warning: metrics.treasury_below_warning === true,
        open_settlements: finite(metrics.open_settlements) ? Number(metrics.open_settlements) : null,
        journals_total: finite(metrics.journals_total) ? Number(metrics.journals_total) : null,
        findings: {
            ledger_imbalance_global: finite(findings.ledger_imbalance_global) ? Number(findings.ledger_imbalance_global) : null,
            account_balance_drift: finite(findings.account_balance_drift) ? Number(findings.account_balance_drift) : null,
            nonzero_terminal_escrow: finite(findings.nonzero_terminal_escrow) ? Number(findings.nonzero_terminal_escrow) : null,
            settlement_unexplained_variance: finite(findings.settlement_unexplained_variance) ? Number(findings.settlement_unexplained_variance) : null,
            treasury_below_floor: findings.treasury_below_floor === true,
        },
    };
}

function normalizeRakeAccount(row, accountCode) {
    const balance = finite(row?.balance) ? Number(row.balance) : 0;
    const minBalance = finite(row?.min_balance) ? Number(row.min_balance) : 0;
    const state = typeof row?.state === 'string' ? row.state : (row ? 'unknown' : 'unopened');
    const available = state === 'open' ? Math.max(0, balance - minBalance) : 0;
    return {
        account_code: accountCode,
        balance,
        min_balance: minBalance,
        available,
        state,
    };
}

function buildTreasuryEconomics({ ledgerAccounts, ledgerConfig, ledgerHealth, cutoverStatus, pvp }) {
    const accountsByCode = new Map(
        (Array.isArray(ledgerAccounts) ? ledgerAccounts : [])
            .filter((row) => typeof row?.account_code === 'string')
            .map((row) => [row.account_code, row]),
    );
    const configByKey = new Map(
        (Array.isArray(ledgerConfig) ? ledgerConfig : [])
            .filter((row) => typeof row?.key === 'string')
            .map((row) => [row.key, Number(row.value)]),
    );

    const treasuryRow = accountsByCode.get('treasury:trivia') || null;
    const treasuryBalance = finite(treasuryRow?.balance)
        ? Number(treasuryRow.balance)
        : (finite(cutoverStatus?.treasury?.balance)
            ? Number(cutoverStatus.treasury.balance)
            : (finite(ledgerHealth?.treasury_balance) ? Number(ledgerHealth.treasury_balance) : null));
    const treasuryFloor = finite(configByKey.get('treasury_floor'))
        ? Number(configByKey.get('treasury_floor'))
        : (finite(cutoverStatus?.treasury?.floor)
            ? Number(cutoverStatus.treasury.floor)
            : (finite(ledgerHealth?.treasury_floor) ? Number(ledgerHealth.treasury_floor) : 0));
    const warningLevel = finite(configByKey.get('treasury_warning_level'))
        ? Number(configByKey.get('treasury_warning_level'))
        : TRIVIA_OPERATIONS_SLOS.treasuryWarningLevel;
    const belowWarning = treasuryBalance !== null && treasuryBalance < warningLevel;
    const headroomAboveWarning = treasuryBalance !== null ? treasuryBalance - warningLevel : null;

    const tournamentRake = normalizeRakeAccount(accountsByCode.get('house:rake:tournament') || null, 'house:rake:tournament');
    const pvpRake = normalizeRakeAccount(accountsByCode.get('house:rake:pvp') || null, 'house:rake:pvp');

    const humanMatches = finite(pvp?.tickets?.matched_human) ? Number(pvp.tickets.matched_human) : null;
    const horseMatches = finite(pvp?.tickets?.matched_horse) ? Number(pvp.tickets.matched_horse) : null;
    const totalMatches = humanMatches !== null && horseMatches !== null ? humanMatches + horseMatches : null;
    const humanSharePct = totalMatches && totalMatches > 0
        ? Math.round((humanMatches / totalMatches) * 1000) / 10
        : null;
    const horseSharePct = totalMatches && totalMatches > 0
        ? Math.round((horseMatches / totalMatches) * 1000) / 10
        : null;

    return {
        treasury_balance: treasuryBalance,
        treasury_floor: treasuryFloor,
        treasury_warning_level: warningLevel,
        treasury_below_warning: belowWarning,
        treasury_headroom_above_warning: headroomAboveWarning,
        rake_accounts: {
            tournament: tournamentRake,
            pvp: pvpRake,
            total_available: tournamentRake.available + pvpRake.available,
        },
        pvp_24h_mix: {
            human_matches: humanMatches,
            horse_matches: horseMatches,
            total_matches: totalMatches,
            human_share_pct: humanSharePct,
            horse_share_pct: horseSharePct,
        },
    };
}

function buildTonightFillMonitor({ upcomingTournaments, activeTournaments, recentTournaments, nowMs }) {
    const todayCT = chicagoLocalDate(nowMs);
    const pool = [
        ...(Array.isArray(activeTournaments) ? activeTournaments : []),
        ...(Array.isArray(upcomingTournaments) ? upcomingTournaments : []),
        ...(Array.isArray(recentTournaments) ? recentTournaments : []),
    ].filter((row) => plainObject(row) && row.schedule_kind === 'public_nightly');

    const tonight = pool.find((row) => row.scheduled_local_date === todayCT)
        || (Array.isArray(upcomingTournaments) ? upcomingTournaments : []).find(
            (row) => plainObject(row) && row.schedule_kind === 'public_nightly',
        )
        || null;

    if (!tonight) return null;

    const startMs = tonight.start_time ? Date.parse(tonight.start_time) : Number.NaN;
    const fillStartMs = Number.isFinite(startMs)
        ? startMs - (TRIVIA_OPERATIONS_SLOS.fillWindowBeforeStartSeconds * 1000)
        : Number.NaN;
    const reconcileMs = Number.isFinite(startMs)
        ? startMs - (TRIVIA_OPERATIONS_SLOS.reconcileBeforeStartSeconds * 1000)
        : Number.NaN;
    const horsesEntered = finite(tonight.horses_entered) ? Number(tonight.horses_entered) : 0;
    const horseTarget = finite(tonight.horse_target) ? Number(tonight.horse_target) : 0;
    const humansEntered = finite(tonight.humans_entered) ? Number(tonight.humans_entered) : 0;
    const secondsUntil = (targetMs) => (Number.isFinite(targetMs) ? Math.max(0, Math.ceil((targetMs - nowMs) / 1000)) : null);

    return {
        tournament_id: typeof tonight.tournament_id === 'string' ? tonight.tournament_id : null,
        scheduled_local_date: typeof tonight.scheduled_local_date === 'string' ? tonight.scheduled_local_date : null,
        lifecycle_state: typeof tonight.lifecycle_state === 'string' ? tonight.lifecycle_state : null,
        horse_population_mode: typeof tonight.horse_population_mode === 'string' ? tonight.horse_population_mode : null,
        population_outcome: typeof tonight.population_outcome === 'string' ? tonight.population_outcome : null,
        horses_entered: horsesEntered,
        horse_target: horseTarget,
        horses_remaining: Math.max(0, horseTarget - horsesEntered),
        fill_pct: horseTarget > 0 ? Math.min(100, Math.round((horsesEntered / horseTarget) * 100)) : 0,
        humans_entered: humansEntered,
        fill_starts_at: Number.isFinite(fillStartMs) ? new Date(fillStartMs).toISOString() : null,
        reconcile_at: Number.isFinite(reconcileMs) ? new Date(reconcileMs).toISOString() : null,
        starts_at: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
        seconds_to_fill_start: secondsUntil(fillStartMs),
        seconds_to_reconcile: secondsUntil(reconcileMs),
        seconds_to_start: secondsUntil(startMs),
    };
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
    const ledgerHealth = normalizeLedgerHealth(input.ledgerHealth);
    const soloJournalSwitch = normalizeLedgerSwitch(input.soloJournalSwitch, input.ledgerHealth);
    const treasuryEconomics = buildTreasuryEconomics({
        ledgerAccounts: input.ledgerAccounts,
        ledgerConfig: input.ledgerConfig,
        ledgerHealth,
        cutoverStatus,
        pvp,
    });
    const tonightFillMonitor = buildTonightFillMonitor({
        upcomingTournaments: input.upcomingTournaments,
        activeTournaments: input.activeTournaments,
        recentTournaments: input.recentTournaments,
        nowMs,
    });
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

    if (ledgerHealth?.healthy === false) {
        issues.push(issue('ledger_health_unhealthy', 'critical', 'Trivia double-entry ledger health has active exceptions'));
    }
    if (Array.isArray(input.ledgerAccounts) && treasuryEconomics.treasury_below_warning) {
        issues.push(issue('treasury_below_warning_level', 'warning', 'Treasury balance is below the configured warning threshold'));
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
        db_switches: {
            solo_journal: soloJournalSwitch,
        },
        cutover_status: cutoverStatus,
        ledger_health: ledgerHealth,
        treasury_economics: treasuryEconomics,
        tonight_fill_monitor: tonightFillMonitor,
        authority,
        available_actions: Object.entries(TRIVIA_OPERATOR_ACTIONS)
            .filter(([, action]) => (
                authority.capabilities.includes(action.capability)
                && (!action.roleRequired || authority.roles.includes(action.roleRequired))
            ))
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
