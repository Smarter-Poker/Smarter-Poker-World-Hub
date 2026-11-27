/**
 * /admin/trivia-operations: authoritative Trivia operations room.
 *
 * Browser navigation renders a shell; the data API verifies the token from the
 * existing local session against named database grants. The browser can ask
 * for bounded actions, but identity, capability, execution and receipts remain
 * server-owned. No service-role data access is present in the browser bundle.
 */

import { useEffect, useRef, useState } from 'react';
import consoleStyles from '../../src/components/admin/OperatorAdminSurface.module.css';

export async function getServerSideProps() {
    return { props: {} };
}

function readLocalAccessToken() {
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
    } catch (_error) {
        return null;
    }
}

async function refreshOperatorAccessToken() {
    try {
        const { supabase } = await import('../../src/lib/supabase');
        const { data } = await supabase.auth.refreshSession();
        return data?.session?.access_token || null;
    } catch (_error) {
        return null;
    }
}

async function fetchWithTokenRefresh(urlOrRequest, init = {}, initialToken = null) {
    let token = initialToken || readLocalAccessToken();
    if (!token) {
        token = await refreshOperatorAccessToken();
    }
    if (!token) {
        return { response: { status: 401, ok: false }, token: null };
    }
    const execute = typeof urlOrRequest === 'function'
        ? urlOrRequest
        : (activeToken) => fetch(urlOrRequest, {
            ...init,
            headers: {
                ...(init.headers || {}),
                Authorization: `Bearer ${activeToken}`,
            },
        });
    let response = await execute(token);
    if (response.status === 401) {
        const refreshed = await refreshOperatorAccessToken();
        if (refreshed && refreshed !== token) {
            token = refreshed;
            response = await execute(token);
        }
    }
    return { response, token };
}

function fmt(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
}

function fmtMs(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
    const ms = Number(value);
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function fmtTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

const BURNIN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BURNIN_SLO_LABELS = [
    ['horse_target_exact', 'Horse Fill'],
    ['start_within_60s', 'Start'],
    ['all_charged_in_bracket', 'Bracket'],
    ['within_event_budget', 'Budget'],
    ['settlement_within_slo', 'Settle'],
    ['zero_escrow_and_variance', 'Escrow'],
];

function fmtBurnInDate(isoDate) {
    if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '-';
    const [, monthStr, dayStr] = isoDate.split('-');
    const month = BURNIN_MONTHS[Number.parseInt(monthStr, 10) - 1];
    const day = Number.parseInt(dayStr, 10);
    return month && Number.isFinite(day) ? `${month} ${day}` : isoDate;
}

function fmtSeconds(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
    return `${Number(value)}s`;
}

function burnInTone(status) {
    if (status === 'passed') return { background: '#14532d', border: '1px solid #2d8b60' };
    if (status === 'pending') return { background: '#1e3a5f', border: '1px solid #4b8ec6' };
    return { background: '#7f1d1d', border: '1px solid #c8505c' };
}

function fmtCountdown(targetIso, nowMs) {
    if (!targetIso) return '-';
    const targetMs = Date.parse(targetIso);
    if (!Number.isFinite(targetMs)) return '-';
    const diffSec = Math.ceil((targetMs - nowMs) / 1000);
    if (diffSec <= 0) return 'Reached';
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

async function fetchOperations(initialToken, query = '') {
    const { response, token } = await fetchWithTokenRefresh(
        (token) => fetch(`/api/admin/trivia-operations${query}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        {},
        initialToken,
    );
    const body = typeof response?.json === 'function' ? await response.json().catch(() => ({})) : {};
    return { response, body, token };
}

function requestKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `ops-${crypto.randomUUID()}`;
    }
    return `ops-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function Status({ ok, good = 'Healthy', bad = 'Needs attention' }) {
    return <span style={{ ...S.badge, background: ok ? '#14532d' : '#7f1d1d' }}>{ok ? good : bad}</span>;
}

function Metric({ label, value, detail, span = 1, mono = false, children = null }) {
    return (
        <div
            className={`sd-metric ${consoleStyles.metric}`}
            style={{
                ...S.metric,
                ...(span === 'full' ? { gridColumn: '1 / -1' } : span > 1 ? { gridColumn: `span ${span}` } : null),
            }}
        >
            <div style={S.metricLabel}>{label}</div>
            {children ? children : (
                <div
                    style={{
                        ...S.metricValue,
                        ...(mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' } : null),
                    }}
                >
                    {fmt(value)}
                </div>
            )}
            {detail ? <div style={S.detail}>{detail}</div> : null}
        </div>
    );
}

function Panel({ title, children }) {
    return (
        <section className={`sd-panel ${consoleStyles.panel}`} style={S.panel}>
            <div style={S.panelHead}>
                <h2 style={S.h2}>{title}</h2>
            </div>
            {children}
        </section>
    );
}

function ActionButton({ children, disabled, onClick, danger = false }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            style={{ ...S.button, ...(danger ? S.dangerButton : null), opacity: disabled ? 0.55 : 1 }}
        >
            {children}
        </button>
    );
}

function TournamentTable({ rows, empty }) {
    if (!rows?.length) return <p style={S.muted}>{empty}</p>;
    return (
        <div className={consoleStyles.tableWell} style={S.tableWell} tabIndex={0} role="region" aria-label="Tournament operations">
            <table style={S.table}>
                <thead>
                    <tr>
                        <th style={S.th}>Starts</th>
                        <th style={S.th}>State</th>
                        <th style={S.th}>People</th>
                        <th style={S.th}>Horses</th>
                        <th style={S.th}>Target</th>
                        <th style={S.th}>No-Shows</th>
                        <th style={S.th}>Payouts</th>
                        <th style={S.th}>Settlement</th>
                        <th style={S.th}>Escrow</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.tournament_id}>
                            <td style={S.td}>{fmtTime(row.start_time)}</td>
                            <td style={S.td}>{fmt(row.lifecycle_state)}</td>
                            <td style={S.td}>{fmt(row.humans_entered)}</td>
                            <td style={S.td}>{fmt(row.horses_entered)}</td>
                            <td style={S.td}>{fmt(row.horse_target)}</td>
                            <td style={S.td}>{fmt(row.no_shows)}</td>
                            <td style={S.td}>{fmt(Number(row.human_payout_total || 0) + Number(row.horse_payout_total || 0))}</td>
                            <td style={S.td}>{fmt(row.settlement_state)}</td>
                            <td style={S.td}>{fmt(row.escrow_balance)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function TriviaOperationsPage() {
    const [state, setState] = useState({ loading: true, snapshot: null, error: null });
    const [actionState, setActionState] = useState({
        busy: false,
        item: null,
        error: null,
        pending: null,
        mfaRequired: false,
        mfaStepUpUrl: null,
    });
    const [questionForm, setQuestionForm] = useState({ targetId: '', reasonCode: 'operator_review', reason: '' });
    const [pvpReason, setPvpReason] = useState('');
    const [tournamentForm, setTournamentForm] = useState({ targetId: '', reason: '' });
    const [settlementForm, setSettlementForm] = useState({ targetId: '', reason: '' });
    const [replenishForm, setReplenishForm] = useState({ amount: '', reason: '' });
    const [incidentForm, setIncidentForm] = useState({ incidentKey: '', severity: 'warning', status: 'open', note: '', reason: '' });
    const [signoffForm, setSignoffForm] = useState({ gateKey: 'physical_ios_review', device: '', evidenceRef: '', reason: '' });
    const [lookupForm, setLookupForm] = useState({ kind: 'user', targetId: '' });
    const [lookupState, setLookupState] = useState({ busy: false, result: null, error: null });
    const [clockNowMs, setClockNowMs] = useState(() => Date.now());
    const tokenRef = useRef(null);

    useEffect(() => {
        const timer = setInterval(() => setClockNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const initialToken = readLocalAccessToken();
            if (initialToken) tokenRef.current = initialToken;
            try {
                const { response, body, token: activeToken } = await fetchOperations(initialToken);
                if (activeToken) tokenRef.current = activeToken;
                if (response.status === 401) {
                    window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/trivia-operations'));
                    return;
                }
                if (cancelled) return;
                if (response.status === 403) {
                    setState({ loading: false, snapshot: null, error: 'This page is restricted to Trivia operators.' });
                } else if (!body?.generated_at) {
                    setState({ loading: false, snapshot: null, error: body?.error || `Unable to load operations data (HTTP ${response.status}).` });
                } else {
                    // A 503 still contains the safe partial snapshot. Showing it
                    // with a red state is more useful than hiding every healthy
                    // source because one dependency could not be read.
                    setState({ loading: false, snapshot: body, error: null });
                }
            } catch (error) {
                if (!cancelled) setState({ loading: false, snapshot: null, error: error?.message || 'Unable to load operations data.' });
            }
        })();
        return () => { cancelled = true; };
    }, []);

    function resolveAccessToken() {
        const fresh = readLocalAccessToken();
        if (fresh) tokenRef.current = fresh;
        return tokenRef.current;
    }

    async function refreshSnapshot() {
        const token = resolveAccessToken();
        const { response, body, token: activeToken } = await fetchOperations(token);
        if (activeToken) tokenRef.current = activeToken;
        if (response.status === 401) {
            window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/trivia-operations'));
            return;
        }
        if (body?.generated_at) setState({ loading: false, snapshot: body, error: null });
        else if (response.status !== 503) setState((current) => ({ ...current, error: body?.error || 'Unable to refresh operations data.' }));
    }

    async function executeAction(input, retry = false) {
        const token = resolveAccessToken();
        const operation = retry ? input : { ...input, requestKey: requestKey() };
        setActionState({ busy: true, item: null, error: null, pending: operation, mfaRequired: false, mfaStepUpUrl: null });
        try {
            const { response, token: activeToken } = await fetchWithTokenRefresh(
                '/api/admin/trivia-operations',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(operation),
                },
                token,
            );
            if (activeToken) tokenRef.current = activeToken;
            if (response.status === 401) {
                window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/trivia-operations'));
                return;
            }
            const body = typeof response?.json === 'function' ? await response.json().catch(() => ({})) : {};
            if (response.status === 403 && body?.requiresMfa === true) {
                const needsEnrollment = body?.requiresEnrollment === true;
                setActionState({
                    busy: false,
                    item: null,
                    error: needsEnrollment
                        ? 'MFA Enrollment Required: Enroll An Authenticator Before Executing Operator Writes.'
                        : (body?.error || 'MFA Verification Required Before Executing Operator Writes.'),
                    pending: null,
                    mfaRequired: true,
                    mfaEnrollRequired: needsEnrollment,
                    mfaStepUpUrl: needsEnrollment
                        ? '/auth/mfa?enroll=1&next=%2Fadmin%2Ftrivia-operations'
                        : '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-operations',
                });
                return;
            }
            const item = body?.item || null;
            if (item?.receiptId) {
                setActionState({
                    busy: false,
                    item,
                    error: body.success ? null : item.result?.detail || item.result?.error || 'Action was not completed.',
                    pending: null,
                    mfaRequired: false,
                    mfaStepUpUrl: null,
                });
                try {
                    await refreshSnapshot();
                } catch (_refreshError) {
                    // Preserve the confirmed durable receipt even if the follow-up read fails.
                }
                return;
            }
            const unknownOutcome = response.status >= 500;
            setActionState({
                busy: false,
                item: null,
                error: body?.error || `Action failed (HTTP ${response.status}).`,
                pending: unknownOutcome ? operation : null,
                mfaRequired: false,
                mfaStepUpUrl: null,
            });
        } catch (error) {
            // An unknown transport outcome keeps the exact request key. The
            // retry button replays that durable operation instead of creating
            // a second side effect.
            setActionState({
                busy: false,
                item: null,
                error: error?.message || 'Action response was not received.',
                pending: operation,
                mfaRequired: false,
                mfaStepUpUrl: null,
            });
        }
    }

    async function runLookup() {
        const token = resolveAccessToken();
        setLookupState({ busy: true, result: null, error: null });
        try {
            const query = `?lookupKind=${encodeURIComponent(lookupForm.kind)}&lookupId=${encodeURIComponent(lookupForm.targetId.trim())}`;
            const { response, body, token: activeToken } = await fetchOperations(token, query);
            if (activeToken) tokenRef.current = activeToken;
            if (response.status === 401) {
                window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/trivia-operations'));
                return;
            }
            if (!body?.support_lookup) throw new Error(body?.error || 'Support lookup failed.');
            setLookupState({ busy: false, result: body.support_lookup, error: null });
        } catch (error) {
            setLookupState({ busy: false, result: null, error: error?.message || 'Support lookup failed.' });
        }
    }

    if (state.loading) {
        return <main className={`smarterdesign ${consoleStyles.surface}`} style={S.page}><div className={consoleStyles.state} role="status">Loading Trivia Operations...</div></main>;
    }
    if (state.error) {
        return <main className={`smarterdesign ${consoleStyles.surface}`} style={S.page}><div className={consoleStyles.state} style={S.error} role="alert">{state.error}</div></main>;
    }

    const data = state.snapshot;
    const question = data.question_health?.metrics || {};
    const pvp = data.pvp_metrics || {};
    const scheduler = data.scheduler || {};
    const upcoming = data.tournaments?.upcoming || [];
    const active = data.tournaments?.active || [];
    const capabilities = new Set(data.authority?.capabilities || []);
    const roles = new Set(data.authority?.roles || []);
    const can = (capability) => capabilities.has(capability);
    const isSupervisor = roles.has('supervisor');
    const pvpConfig = data.pvp_config || {};
    const cutoverStatus = data.cutover_status || {};
    const cutoverGates = cutoverStatus.gates || {};
    const treasury = cutoverStatus.treasury || {};
    const recoveryStatus = cutoverStatus.recovery_status || null;
    const soloJournalSwitch = data.db_switches?.solo_journal || null;
    const tonightFill = data.tonight_fill_monitor || null;
    const burnIn = data.burnin_scorecard || null;
    const burnInNights = Array.isArray(burnIn?.nights) ? burnIn.nights : [];
    const legacyObservation = data.legacy_observation || null;
    const launchReadiness = data.launch_readiness || null;
    const launchGates = launchReadiness?.gates || {};
    const operatorMfa = data.operator_mfa || {
        verified: false,
        expiresAt: null,
        reason: 'MFA challenge required',
        stepUpUrl: '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-operations',
    };
    const economics = data.treasury_economics || {};
    const rakeAccounts = economics.rake_accounts || {};
    const pvpMix = economics.pvp_24h_mix || {};
    const integrityReview = data.integrity_review || {};
    const integritySummary = integrityReview.summary || {};
    const flaggedSessions = Array.isArray(integrityReview.flagged_sessions) ? integrityReview.flagged_sessions : [];
    const playerFunnel = data.player_funnel || {};

    return (
        <main className={`smarterdesign ${consoleStyles.surface}`} style={S.page}>
            <header style={S.header}>
                <div>
                    <p style={S.eyebrow}>Restricted Operator Authority</p>
                    <h1 style={S.h1}>Trivia Operations</h1>
                    <p style={S.muted}>Question Supply, PvP Outcomes, Nightly Tournaments, Scheduler Ownership And Reconciliation In One Place.</p>
                </div>
                <div style={S.headerState}>
                    <Status ok={data.healthy} />
                    <span style={S.detail}>Updated {fmtTime(data.generated_at)}</span>
                </div>
            </header>

            {data.issues?.length ? (
                <section style={S.issuePanel} aria-labelledby="trivia-operations-issues">
                    <h2 id="trivia-operations-issues" style={S.h2}>Needs Attention</h2>
                    <ul style={S.list}>
                        {data.issues.map((item) => <li key={item.code}><strong>{item.severity}:</strong> {item.summary}</li>)}
                    </ul>
                </section>
            ) : null}

            {actionState.item || actionState.error || actionState.mfaRequired ? (
                <section
                    style={actionState.item?.outcome === 'succeeded' ? S.resultPanel : (actionState.mfaRequired ? S.mfaPanel : S.issuePanel)}
                    aria-live="polite"
                    data-mfa-stepup-required={actionState.mfaRequired ? 'true' : undefined}
                >
                    <h2 style={S.h2}>
                        {actionState.mfaRequired
                            ? (actionState.mfaEnrollRequired ? 'MFA Enrollment Required' : 'MFA Step-Up Verification Required')
                            : (actionState.item?.outcome === 'succeeded' ? 'Action Recorded' : 'Action Result')}
                    </h2>
                    {actionState.item?.receiptId ? <p style={S.note}>Receipt: <code>{actionState.item.receiptId}</code>{actionState.item.replayed ? ' (replayed)' : ''}</p> : null}
                    {actionState.error ? <p style={S.errorText}>{actionState.error}</p> : null}
                    {actionState.mfaRequired ? (
                        <div style={S.actions}>
                            <a
                                href={actionState.mfaStepUpUrl || '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-operations'}
                                style={S.mfaLink}
                            >
                                {actionState.mfaEnrollRequired ? 'Enroll MFA' : 'Verify MFA Session'}
                            </a>
                        </div>
                    ) : null}
                    {actionState.pending ? (
                        <ActionButton disabled={actionState.busy} onClick={() => executeAction(actionState.pending, true)}>
                            Retry Same Request
                        </ActionButton>
                    ) : null}
                </section>
            ) : null}

            <Panel title="Phase 12 Launch Certification Gateboard">
                <div style={S.burnInHeader}>
                    <span
                        style={{
                            ...S.badge,
                            ...(launchReadiness?.ready_to_unlock_public_card ? burnInTone('passed') : burnInTone('pending')),
                        }}
                    >
                        {`${fmt(launchReadiness?.passed_gates ?? 0)} / ${fmt(launchReadiness?.total_gates ?? 4)} Gates Passed`}
                    </span>
                    <span
                        style={{
                            ...S.badge,
                            ...(launchReadiness?.ready_to_unlock_public_card ? burnInTone('passed') : S.neutralBadge),
                        }}
                    >
                        {launchReadiness?.ready_to_unlock_public_card
                            ? 'Public Hub Card: Ready To Unlock (4/4 Passed)'
                            : 'Public Hub Card: Owner-Only Until 4/4 Gates Pass'}
                    </span>
                </div>
                <div style={S.grid}>
                    <Metric
                        label="7-Night Burn-In"
                        value={launchGates.burnin_7_nights?.passed ? 'PASSED' : (launchGates.burnin_7_nights?.status === 'failed' ? 'FAILED' : 'PENDING')}
                        detail={launchGates.burnin_7_nights?.detail || '0/7 nights certified'}
                    />
                    <Metric
                        label="Operator MFA HTTP Write"
                        value={launchGates.operator_mfa_http_write?.passed ? 'PASSED' : 'PENDING'}
                        detail={launchGates.operator_mfa_http_write?.detail || 'Awaiting live MFA-verified operator write'}
                    />
                    <Metric
                        label="Legacy-Traffic Observation Window"
                        value={launchGates.legacy_observation_window?.passed ? 'PASSED' : (launchGates.legacy_observation_window?.status === 'attention' ? 'ATTENTION' : 'PENDING')}
                        detail={launchGates.legacy_observation_window?.detail || '0 / 72h zero-legacy window'}
                    />
                    <Metric
                        label="Physical iOS/Android & Push Review"
                        value={launchGates.physical_device_human_review?.passed ? 'PASSED' : 'PENDING'}
                        detail={launchGates.physical_device_human_review?.detail || '0/3 physical device sign-offs recorded'}
                    />
                </div>
                <p style={S.note}>Public Hub Card Remains Owner-Only Until All Four Certification Gates Pass. Pending Exit Gates Never Degrade Operations Health.</p>
            </Panel>

            <Panel title="Legacy-Traffic Observation Window">
                <div style={S.burnInHeader}>
                    <span
                        style={{
                            ...S.badge,
                            ...(legacyObservation?.window_satisfied
                                ? burnInTone('passed')
                                : (legacyObservation?.zero_legacy_traffic ? burnInTone('pending') : burnInTone('failed'))),
                        }}
                    >
                        {legacyObservation?.window_satisfied
                            ? '72h Window Satisfied'
                            : (legacyObservation?.zero_legacy_traffic ? 'Zero Legacy Traffic (Observing)' : 'Legacy Traffic Attention')}
                    </span>
                    <span style={{ ...S.badge, ...S.neutralBadge }}>
                        {`${fmt(legacyObservation?.observation_hours ?? 0)} / ${fmt(legacyObservation?.required_observation_hours ?? 72)}h`}
                    </span>
                </div>
                <div style={S.grid}>
                    <Metric label="Solo 7d" value={legacyObservation?.legacy_rows?.solo_7d ?? 0} detail="engine_version IS NULL" />
                    <Metric label="PvP 7d" value={legacyObservation?.legacy_rows?.pvp_7d ?? 0} detail="engine_version IS NULL" />
                    <Metric label="Tournaments 7d" value={legacyObservation?.legacy_rows?.tournaments_7d ?? 0} detail="engine_version IS NULL" />
                    <Metric
                        label="Retired RPC Delta vs Baseline"
                        value={legacyObservation?.total_retired_rpc_delta ?? 0}
                        detail="10 retired/superseded legacy RPCs"
                    />
                    <Metric
                        label="Solo Journal & Ledger"
                        value={(legacyObservation?.solo_journal_enabled && legacyObservation?.ledger_clean && (legacyObservation?.legacy_rows_pending_backfill ?? 0) === 0) ? 'Clean' : 'Attention'}
                        detail={`Pending backfill: ${fmt(legacyObservation?.legacy_rows_pending_backfill ?? 0)}`}
                    />
                    <Metric
                        label="Baseline Recorded"
                        value={legacyObservation?.baseline_recorded_at ? fmtTime(legacyObservation.baseline_recorded_at) : 'Not Recorded'}
                        detail={`${fmt(legacyObservation?.observation_hours ?? 0)} / ${fmt(legacyObservation?.required_observation_hours ?? 72)}h elapsed`}
                    />
                </div>
                <p style={S.note}>Tracks All Five Phase 12 Pre-Deletion Legacy Queries Against The Anchored Baseline Snapshot Before Any Legacy Route Or RPC Retirement.</p>
            </Panel>

            <Panel title="Release controls">
                <div style={S.grid}>
                    {Object.entries(data.controls || {}).map(([name, enabled]) => (
                        <Metric key={name} label={name.replaceAll('_', ' ')} value={enabled} />
                    ))}
                    <Metric
                        label="solo journal (DB switch)"
                        value={soloJournalSwitch ? soloJournalSwitch.enabled : 'Unavailable'}
                        detail={soloJournalSwitch?.updated_at ? `Updated ${fmtTime(soloJournalSwitch.updated_at)}` : undefined}
                    />
                </div>
                <p style={S.note}>These Are Public Deployment Flags Alongside The Authoritative Solo Journal Database Switch. Runtime Engine Switches Remain Separate Canary Controls, And Supported Recovery Actions Require Named Capabilities And Immutable Receipts.</p>
            </Panel>

            <Panel title="Tonight at 8:00 PM CT fill monitor">
                {tonightFill ? (
                    <div style={S.grid}>
                        <Metric label="Scheduled date (CT)" value={tonightFill.scheduled_local_date} />
                        <Metric label="Lifecycle status" value={tonightFill.lifecycle_state} detail={tonightFill.horse_population_mode ? `Population: ${tonightFill.horse_population_mode}` : undefined} />
                        <Metric label="Horses entered vs target" value={`${fmt(tonightFill.horses_entered)} / ${fmt(tonightFill.horse_target)}`} detail={`${fmt(tonightFill.fill_pct)}% filled (${fmt(tonightFill.horses_remaining)} remaining)`} />
                        <Metric label="Humans entered" value={tonightFill.humans_entered} />
                        <Metric label="Countdown to 7:15 PM CT fill" value={fmtCountdown(tonightFill.fill_starts_at, clockNowMs)} detail={fmtTime(tonightFill.fill_starts_at)} />
                        <Metric label="Countdown to 7:58 PM CT reconcile" value={fmtCountdown(tonightFill.reconcile_at, clockNowMs)} detail={fmtTime(tonightFill.reconcile_at)} />
                        <Metric label="Countdown to 8:00 PM CT start" value={fmtCountdown(tonightFill.starts_at, clockNowMs)} detail={fmtTime(tonightFill.starts_at)} />
                    </div>
                ) : (
                    <p style={S.muted}>No Nightly Tournament Instance Was Found For Tonight.</p>
                )}
            </Panel>

            <Panel title="7-Night Launch Burn-In Scorecard">
                <div style={S.burnInHeader}>
                    <span
                        style={{
                            ...S.badge,
                            ...(burnIn?.certified ? burnInTone('passed') : (burnIn?.failed > 0 ? burnInTone('failed') : burnInTone('pending'))),
                        }}
                    >
                        {`${fmt(burnIn?.passed ?? 0)} / ${fmt(burnIn?.total ?? 7)} ${burnIn?.certified ? 'CERTIFIED' : 'IN PROGRESS'}`}
                    </span>
                    <span
                        style={{
                            ...S.badge,
                            ...(burnIn?.ledger_clean === true
                                ? burnInTone('passed')
                                : (burnIn?.ledger_clean === false ? burnInTone('failed') : S.neutralBadge)),
                        }}
                    >
                        {burnIn?.ledger_clean === true
                            ? 'Ledger Clean'
                            : (burnIn?.ledger_clean === false ? 'Ledger Attention' : 'Ledger Unavailable')}
                    </span>
                </div>
                <div style={{ ...S.grid, marginBottom: 16 }}>
                    <Metric
                        label="Scorecard"
                        value={`${fmt(burnIn?.passed ?? 0)} / ${fmt(burnIn?.total ?? 7)}`}
                        detail={burnIn?.certified ? 'Certified' : 'In Progress'}
                    />
                    <Metric
                        label="Launch Window (CT)"
                        value={`${fmtBurnInDate(burnIn?.window?.start_date || '2026-11-24')} to ${fmtBurnInDate(burnIn?.window?.end_date || '2026-11-30')}`}
                        detail={`${burnIn?.window?.start_date || '2026-11-24'} to ${burnIn?.window?.end_date || '2026-11-30'}`}
                    />
                    <Metric
                        label="Passed / Pending / Failed"
                        value={`${fmt(burnIn?.passed ?? 0)} / ${fmt(burnIn?.pending ?? 0)} / ${fmt(burnIn?.failed ?? 0)}`}
                        detail={`Scheduled: ${fmt(burnIn?.scheduled ?? 0)} / ${fmt(burnIn?.total ?? 7)}`}
                    />
                    <Metric
                        label="Ledger Clean"
                        value={burnIn?.ledger_clean === true ? 'Clean' : (burnIn?.ledger_clean === false ? 'Attention' : 'Unavailable')}
                        detail={burnIn?.generated_at ? `Updated ${fmtTime(burnIn.generated_at)}` : 'Read-Only Scorecard'}
                    />
                </div>
                {burnInNights.length ? (
                    <div className={consoleStyles.tableWell} style={S.tableWell} tabIndex={0} role="region" aria-label="7-Night Launch Burn-In Scorecard">
                        <table style={S.table}>
                            <thead>
                                <tr>
                                    <th style={S.th}>Night (CT)</th>
                                    <th style={S.th}>Status</th>
                                    <th style={S.th}>Horse Fill</th>
                                    <th style={S.th}>Humans</th>
                                    <th style={S.th}>Start Delay</th>
                                    <th style={S.th}>Settlement</th>
                                    <th style={S.th}>Escrow / Variance</th>
                                    <th style={S.th}>Phase 12 SLOs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {burnInNights.map((night) => {
                                    const statusText = night.status === 'passed'
                                        ? 'PASSED'
                                        : (night.status === 'pending' ? 'PENDING' : 'FAILED');
                                    return (
                                        <tr key={night.date || night.tournament_id}>
                                            <td style={S.td}>
                                                <div>{fmtBurnInDate(night.date)}</div>
                                                <div style={S.detail}>{night.date || '-'}</div>
                                            </td>
                                            <td style={S.td}>
                                                <span style={{ ...S.compactBadge, ...burnInTone(night.status) }}>
                                                    {statusText}
                                                </span>
                                                <div style={S.detail}>{fmt(night.lifecycle_state)}</div>
                                            </td>
                                            <td style={S.td}>{`${fmt(night.horses_entered)} / ${fmt(night.horse_target)}`}</td>
                                            <td style={S.td}>{fmt(night.humans_entered)}</td>
                                            <td style={S.td}>{fmtSeconds(night.start_delay_seconds)}</td>
                                            <td style={S.td}>{fmtSeconds(night.settlement_latency_seconds)}</td>
                                            <td style={S.td}>{`${fmt(night.escrow_balance)} / ${fmt(night.ledger_variance)}`}</td>
                                            <td style={S.td}>
                                                <div style={S.sloWrap}>
                                                    {BURNIN_SLO_LABELS.map(([key, label]) => {
                                                        const slo = night.slos?.[key] || { passed: false, detail: '' };
                                                        const sloState = night.status === 'pending'
                                                            ? 'pending'
                                                            : (slo.passed ? 'passed' : 'failed');
                                                        const sloMark = sloState === 'pending'
                                                            ? 'PEND'
                                                            : (sloState === 'passed' ? 'PASS' : 'FAIL');
                                                        return (
                                                            <span
                                                                key={key}
                                                                title={slo.detail || label}
                                                                style={{ ...S.sloPill, ...burnInTone(sloState) }}
                                                            >
                                                                {`${label}: ${sloMark}`}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={S.muted}>No Burn-In Scorecard Rows Were Returned.</p>
                )}
                <p style={S.note}>Informational Phase 12 Launch Exit-Gate Scorecard. Pending Nights Never Degrade Operations Health.</p>
            </Panel>

            <Panel title="Unit-economics and treasury headroom">
                <div style={S.grid}>
                    <Metric
                        label="Treasury balance vs warning"
                        value={fmt(economics.treasury_balance)}
                        detail={`Warning threshold: ${fmt(economics.treasury_warning_level)} (${economics.treasury_below_warning ? 'Below warning' : 'Above warning'})`}
                    />
                    <Metric label="Headroom above 6,000 warning" value={economics.treasury_headroom_above_warning} />
                    <Metric label="Tournament rake balance" value={rakeAccounts.tournament?.balance} detail={`Available: ${fmt(rakeAccounts.tournament?.available)}`} />
                    <Metric label="PvP rake balance" value={rakeAccounts.pvp?.balance} detail={`Available: ${fmt(rakeAccounts.pvp?.available)}`} />
                    <Metric label="Total available rake" value={rakeAccounts.total_available} />
                    <Metric
                        label="24h PvP human vs horse mix"
                        value={pvpMix.total_matches ? `${fmt(pvpMix.human_matches)} H / ${fmt(pvpMix.horse_matches)} B` : 'No matches'}
                        detail={pvpMix.total_matches ? `${pvpMix.human_share_pct}% human / ${pvpMix.horse_share_pct}% horse` : 'Last 24 hours'}
                    />
                </div>
                {isSupervisor ? (
                    <div style={{ marginTop: 18 }}>
                        <div style={S.formGrid}>
                            <label style={S.label}>Replenish Amount (Diamonds)
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.max(1, Number(rakeAccounts.total_available || 0))}
                                    style={S.input}
                                    value={replenishForm.amount}
                                    onChange={(event) => setReplenishForm({ ...replenishForm, amount: event.target.value })}
                                    placeholder={`Max ${fmt(rakeAccounts.total_available || 0)}`}
                                />
                            </label>
                            <label style={S.label}>Required Operational Reason
                                <textarea
                                    style={S.textarea}
                                    value={replenishForm.reason}
                                    onChange={(event) => setReplenishForm({ ...replenishForm, reason: event.target.value })}
                                />
                            </label>
                        </div>
                        <div style={S.actions}>
                            <ActionButton
                                disabled={actionState.busy || !(Number(rakeAccounts.total_available || 0) > 0)}
                                onClick={() => executeAction({
                                    action: 'treasury_replenish_from_rake',
                                    reason: replenishForm.reason,
                                    targetId: null,
                                    payload: { replenishAmount: Number.parseInt(replenishForm.amount, 10) },
                                })}
                            >
                                Replenish Treasury From Rake
                            </ActionButton>
                        </div>
                        <p style={S.note}>Posts A Balanced Double-Entry Journal Debiting Accumulated Tournament And PvP Rake Accounts And Crediting The Trivia Treasury With An Immutable Supervisor Receipt.</p>
                    </div>
                ) : (
                    <p style={S.note}>Treasury Replenishment From Rake Requires Supervisor Authority.</p>
                )}
            </Panel>

            <Panel title="Durable database cutover authority">
                <div style={S.grid}>
                    {['pvp_public', 'pvp_horses', 'tournament_public', 'tournament_horses', 'tournament_scheduler'].map((name) => {
                        const gate = cutoverGates[name] || {};
                        const value = gate.version == null
                            ? 'Unavailable'
                            : `${gate.enabled ? 'Certified' : 'Blocked'} v${gate.version}`;
                        return <Metric key={name} label={name.replaceAll('_', ' ')} value={value} detail={gate.certificate_id || undefined} />;
                    })}
                </div>
                <p style={S.note}>Database Certificates Are Authoritative. Environment Flags And Runtime Switches Cannot Bypass A Blocked Gate.</p>
            </Panel>

            <Panel title="Phase 12 financial and recovery readiness">
                <div style={S.grid}>
                    <Metric label="Ledger clean" value={cutoverStatus.available ? cutoverStatus.ledger_clean : 'Unavailable'} />
                    <Metric label="Treasury account" value={treasury.account} />
                    <Metric label="Treasury balance" value={treasury.balance} />
                    <Metric label="Treasury floor" value={treasury.floor} />
                    <Metric label="Treasury available" value={treasury.available} />
                    <Metric label="Latest PvP recovery" value={recoveryStatus ? fmtTime(recoveryStatus.finished_at) : 'No run recorded'} />
                    <Metric label="Recovery outcome" value={recoveryStatus?.outcome || 'No run recorded'} />
                    <Metric label="Recovery healthy" value={recoveryStatus ? recoveryStatus.healthy : 'No run recorded'} />
                    <Metric label="Recovery expired tickets" value={recoveryStatus?.tickets_expired} />
                    <Metric label="Recovery scanned matches" value={recoveryStatus?.matches_scanned} />
                    <Metric label="Recovery settled" value={recoveryStatus?.settled} />
                    <Metric label="Recovery pending" value={recoveryStatus?.pending} />
                    <Metric label="Recovery failed" value={recoveryStatus?.failed} />
                </div>
                <p style={S.note}>The Recovery Projection Is Sanitized By The Phase 12 Status RPC. No Holder Identity, Fencing Token Or Raw Failure Detail Reaches This Page.</p>
            </Panel>

            <Panel title="Operator authority">
                <div style={S.grid}>
                    <Metric label="Named roles" value={(data.authority?.roles || []).join(', ') || 'None'} />
                    <Metric label="Recent receipts" value={data.operator_events?.length || 0} />
                    <Metric label="Durable alert episodes" value={data.operations_health?.activeEpisodes?.length || 0} />
                    <Metric
                        label="Operator MFA Session"
                        value={operatorMfa.verified ? 'Verified' : 'Unverified'}
                        detail={operatorMfa.verified
                            ? (operatorMfa.expiresAt ? `Expires ${fmtTime(operatorMfa.expiresAt)}` : 'Active')
                            : (operatorMfa.reason || 'MFA challenge required')}
                    />
                    <Metric label="Capabilities" span="full">
                        {(data.authority?.capabilities || []).length > 0 ? (
                            <div
                                data-capabilities-pills="true"
                                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}
                            >
                                {(data.authority?.capabilities || []).map((cap) => (
                                    <span
                                        key={cap}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            padding: '3px 9px',
                                            borderRadius: 999,
                                            border: '1px solid rgba(134, 218, 255, 0.32)',
                                            background: 'rgba(134, 218, 255, 0.1)',
                                            color: '#f2f7ff',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            lineHeight: 1.3,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {cap}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div style={S.metricValue}>None</div>
                        )}
                    </Metric>
                </div>
                {!operatorMfa.verified ? (
                    <div style={S.actions}>
                        <a
                            href={operatorMfa.stepUpUrl || '/auth/mfa?stepup=1&next=%2Fadmin%2Ftrivia-operations'}
                            style={S.mfaLink}
                        >
                            Verify MFA Session
                        </a>
                    </div>
                ) : null}
            </Panel>

            {can('question_quarantine') || can('question_release') ? (
                <Panel title="Question quarantine authority">
                    <div style={S.formGrid}>
                        <label style={S.label}>Question Or Quarantine ID
                            <input style={S.input} value={questionForm.targetId} onChange={(event) => setQuestionForm({ ...questionForm, targetId: event.target.value })} placeholder="UUID" />
                        </label>
                        <label style={S.label}>Reason Code
                            <input style={S.input} value={questionForm.reasonCode} onChange={(event) => setQuestionForm({ ...questionForm, reasonCode: event.target.value })} />
                        </label>
                        <label style={{ ...S.label, gridColumn: '1 / -1' }}>Required Operational Reason
                            <textarea style={S.textarea} value={questionForm.reason} onChange={(event) => setQuestionForm({ ...questionForm, reason: event.target.value })} />
                        </label>
                    </div>
                    <div style={S.actions}>
                        {can('question_quarantine') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'question_quarantine', reason: questionForm.reason, targetId: questionForm.targetId.trim(), payload: { reasonCode: questionForm.reasonCode.trim() } })}>Quarantine Question</ActionButton> : null}
                        {can('question_release') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'question_release', reason: questionForm.reason, targetId: questionForm.targetId.trim(), payload: {} })}>Release Quarantine</ActionButton> : null}
                    </div>
                </Panel>
            ) : null}

            {can('pvp_switch') || can('pvp_recover') ? (
                <Panel title="PvP engine authority">
                    <div style={S.grid}>
                        <Metric label="Joins" value={pvpConfig.joins_enabled} />
                        <Metric label="Horse fallback" value={pvpConfig.horses_enabled} />
                    </div>
                    <label style={{ ...S.label, marginTop: 14 }}>Required Operational Reason
                        <textarea style={S.textarea} value={pvpReason} onChange={(event) => setPvpReason(event.target.value)} />
                    </label>
                    <div style={S.actions}>
                        {can('pvp_switch') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'pvp_joins_set', reason: pvpReason, targetId: null, payload: { enabled: !pvpConfig.joins_enabled } })}>{pvpConfig.joins_enabled ? 'Disable joins' : 'Enable joins'}</ActionButton> : null}
                        {can('pvp_switch') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'pvp_horses_set', reason: pvpReason, targetId: null, payload: { enabled: !pvpConfig.horses_enabled } })}>{pvpConfig.horses_enabled ? 'Disable horse fallback' : 'Enable horse fallback'}</ActionButton> : null}
                        {can('pvp_recover') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'pvp_recover', reason: pvpReason, targetId: null, payload: { limit: 100 } })}>Run Bounded PvP Recovery</ActionButton> : null}
                    </div>
                    <p style={S.note}>These Database Switches Are Canary Engine Controls. They Do Not Certify Or Enable The Public PvP Route Flags Above.</p>
                </Panel>
            ) : null}

            {can('tournament_cancel') || can('tournament_recover') ? (
                <Panel title="Tournament authority">
                    <div style={S.formGrid}>
                        <label style={S.label}>Tournament ID
                            <input style={S.input} value={tournamentForm.targetId} onChange={(event) => setTournamentForm({ ...tournamentForm, targetId: event.target.value })} placeholder="UUID" />
                        </label>
                        <label style={S.label}>Required Operational Reason
                            <textarea style={S.textarea} value={tournamentForm.reason} onChange={(event) => setTournamentForm({ ...tournamentForm, reason: event.target.value })} />
                        </label>
                    </div>
                    <div style={S.actions}>
                        {can('tournament_recover') ? <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'tournament_recover_settlement', reason: tournamentForm.reason, targetId: tournamentForm.targetId.trim(), payload: {} })}>Recover Canary/Test Settlement With Engine Fence</ActionButton> : null}
                        {can('tournament_cancel') ? <ActionButton danger disabled={actionState.busy} onClick={() => executeAction({ action: 'tournament_cancel', reason: tournamentForm.reason, targetId: tournamentForm.targetId.trim(), payload: {} })}>Cancel And Refund Tournament</ActionButton> : null}
                    </div>
                    <p style={S.note}>Settlement Recovery Is Limited By The Phase 12 Database Guard To A Settling Canary/Test Tournament And A Named Operator With Recovery Capability. Public Recovery Stays Behind Its Durable Release Authority. Round And Match Recovery Are Not Exposed Because The Existing Engine Has No Target-Safe Recovery RPC.</p>
                </Panel>
            ) : null}

            {can('settlement_control') ? (
                <Panel title="Settlement payout control">
                    <div style={S.formGrid}>
                        <label style={S.label}>Settlement ID
                            <input style={S.input} value={settlementForm.targetId} onChange={(event) => setSettlementForm({ ...settlementForm, targetId: event.target.value })} placeholder="UUID" />
                        </label>
                        <label style={S.label}>Required Operational Reason
                            <textarea style={S.textarea} value={settlementForm.reason} onChange={(event) => setSettlementForm({ ...settlementForm, reason: event.target.value })} />
                        </label>
                    </div>
                    <div style={S.actions}>
                        <ActionButton danger disabled={actionState.busy} onClick={() => executeAction({ action: 'payout_hold', reason: settlementForm.reason, targetId: settlementForm.targetId.trim(), payload: {} })}>Hold Payout</ActionButton>
                        <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'payout_release', reason: settlementForm.reason, targetId: settlementForm.targetId.trim(), payload: {} })}>Release Payout</ActionButton>
                    </div>
                    <p style={S.note}>The Hold Is Enforced Inside The Authoritative Settlement Transaction. It Blocks Payout And Rake Settlement, Never Exact-Entry Cancellation Refunds Or A Valid Zero-Movement Void. Every Hold And Release Uses The Same Settlement ID And Produces An Immutable Receipt.</p>
                </Panel>
            ) : (
                <Panel title="Settlement payout control">
                    <p style={S.note}>Payout Hold Unavailable. This Operator Session Does Not Carry The Named Settlement-Control Capability.</p>
                </Panel>
            )}

            {can('incident_note') && isSupervisor ? (
                <Panel title="Physical Device Human Sign-Off">
                    <p style={S.note}>Supervisor-Only. Records An Immutable Human Sign-Off For A Physical Launch Gate. The MFA HTTP Write Gate Cannot Be Signed By Hand.</p>
                    <div style={S.formGrid}>
                        <label style={S.label}>Gate
                            <select style={S.input} value={signoffForm.gateKey} onChange={(event) => setSignoffForm({ ...signoffForm, gateKey: event.target.value })}>
                                <option value="physical_ios_review">IOS Review</option>
                                <option value="physical_android_review">Android Review</option>
                                <option value="physical_push_receipt">Push Receipt</option>
                            </select>
                        </label>
                        <label style={S.label}>Device And OS
                            <input style={S.input} value={signoffForm.device} onChange={(event) => setSignoffForm({ ...signoffForm, device: event.target.value })} maxLength={120} placeholder="Device Model And OS Version" />
                        </label>
                        <label style={S.label}>Evidence Reference
                            <input style={S.input} value={signoffForm.evidenceRef} onChange={(event) => setSignoffForm({ ...signoffForm, evidenceRef: event.target.value })} maxLength={240} placeholder="Recording, Ticket Or Screenshot Reference" />
                        </label>
                        <label style={S.label}>Notes And Reason
                            <input style={S.input} value={signoffForm.reason} onChange={(event) => setSignoffForm({ ...signoffForm, reason: event.target.value })} placeholder="At Least 12 Characters" />
                        </label>
                    </div>
                    <ActionButton
                        disabled={actionState.busy}
                        onClick={() => executeAction({
                            action: 'launch_gate_signoff',
                            reason: signoffForm.reason,
                            targetId: null,
                            payload: {
                                gateKey: signoffForm.gateKey,
                                device: signoffForm.device.trim(),
                                evidenceRef: signoffForm.evidenceRef.trim(),
                            },
                        })}
                    >
                        Record Physical Sign-Off
                    </ActionButton>
                </Panel>
            ) : null}

            {can('incident_note') ? (
                <Panel title="Immutable incident note">
                    <div style={S.formGrid}>
                        <label style={S.label}>Incident Key
                            <input style={S.input} value={incidentForm.incidentKey} onChange={(event) => setIncidentForm({ ...incidentForm, incidentKey: event.target.value })} />
                        </label>
                        <label style={S.label}>Severity
                            <select style={S.input} value={incidentForm.severity} onChange={(event) => setIncidentForm({ ...incidentForm, severity: event.target.value })}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
                        </label>
                        <label style={S.label}>Status
                            <select style={S.input} value={incidentForm.status} onChange={(event) => setIncidentForm({ ...incidentForm, status: event.target.value })}><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select>
                        </label>
                        <label style={S.label}>Operational Reason
                            <input style={S.input} value={incidentForm.reason} onChange={(event) => setIncidentForm({ ...incidentForm, reason: event.target.value })} />
                        </label>
                        <label style={{ ...S.label, gridColumn: '1 / -1' }}>Incident Note
                            <textarea style={S.textarea} value={incidentForm.note} onChange={(event) => setIncidentForm({ ...incidentForm, note: event.target.value })} />
                        </label>
                    </div>
                    <ActionButton disabled={actionState.busy} onClick={() => executeAction({ action: 'incident_note', reason: incidentForm.reason, targetId: null, payload: { incidentKey: incidentForm.incidentKey.trim(), note: incidentForm.note, severity: incidentForm.severity, status: incidentForm.status } })}>Record Immutable Note</ActionButton>
                </Panel>
            ) : null}

            {can('support_lookup') ? (
                <Panel title="Privacy-safe support lookup">
                    <div style={S.formGrid}>
                        <label style={S.label}>Record Kind
                            <select style={S.input} value={lookupForm.kind} onChange={(event) => setLookupForm({ ...lookupForm, kind: event.target.value })}><option value="user">User</option><option value="pvp_match">PvP Match</option><option value="tournament">Tournament</option><option value="question">Question</option><option value="settlement">Settlement</option></select>
                        </label>
                        <label style={S.label}>Record ID
                            <input style={S.input} value={lookupForm.targetId} onChange={(event) => setLookupForm({ ...lookupForm, targetId: event.target.value })} placeholder="UUID" />
                        </label>
                    </div>
                    <ActionButton disabled={lookupState.busy} onClick={runLookup}>Look Up Safe Projection</ActionButton>
                    {lookupState.error ? <p style={S.errorText}>{lookupState.error}</p> : null}
                    {lookupState.result ? <pre style={S.pre}>{JSON.stringify(lookupState.result, null, 2)}</pre> : null}
                </Panel>
            ) : null}

            <Panel title="Next seven nightly events">
                <TournamentTable rows={upcoming} empty="No future nightly events were returned." />
            </Panel>

            <Panel title="Active tournaments">
                <div style={{ ...S.grid, marginBottom: 16 }}>
                    <Metric label="Open rounds" value={data.tournaments?.activity?.rounds?.open} />
                    <Metric label="Pending rounds" value={data.tournaments?.activity?.rounds?.pending} />
                    <Metric label="Ready matches" value={data.tournaments?.activity?.matchups?.ready} />
                    <Metric label="Pending matches" value={data.tournaments?.activity?.matchups?.pending} />
                </div>
                <TournamentTable rows={active} empty="No tournament is registering, held, live or settling." />
            </Panel>

            <Panel title="Scheduler ownership">
                <div style={S.grid}>
                    <Metric label="Active owner observed" value={scheduler.active_owner_observed} />
                    <Metric label="Last owner run" value={fmtTime(scheduler.last_owner_run_at)} />
                    <Metric label="Recent runs" value={Array.isArray(scheduler.recent_runs) ? scheduler.recent_runs.length : 0} />
                    <Metric label="Current holder" value={scheduler.lease?.holder_id} span={2} mono />
                    <Metric label="Fencing token" value={scheduler.lease?.fencing_token} />
                    <Metric label="Lease expires" value={fmtTime(scheduler.lease?.expires_at)} />
                    <Metric label="Takeovers" value={scheduler.lease?.takeovers} />
                    <Metric label="Unfinished owner runs" value={scheduler.unfinished_owner_runs} />
                </div>
            </Panel>

            <Panel title="PvP outcomes: last 24 hours">
                <div style={S.grid}>
                    <Metric label="Queue joins" value={pvp.tickets?.joined} />
                    <Metric label="Waiting" value={pvp.tickets?.waiting} />
                    <Metric label="Human matches" value={pvp.tickets?.matched_human} />
                    <Metric label="Horse matches" value={pvp.tickets?.matched_horse} />
                    <Metric label="Active matches" value={pvp.matches?.active} />
                    <Metric label="Completed matches" value={pvp.matches?.completed} />
                    <Metric label="Horse fallback p95" value={fmtMs(pvp.join_to_match_ms?.horse_p95)} detail="Goal: at most 45s" />
                    <Metric label="Settlement p95" value={fmtMs(pvp.settlement_latency_ms?.p95)} detail="Goal: under 10s" />
                    <Metric label="Early horse matches" value={pvp.fallback?.horse_before_deadline} />
                    <Metric label="Settlement failures" value={pvp.matches?.settlement_failures} />
                    <Metric label="Open terminal settlements" value={pvp.ledger_variance?.terminal_matches_with_open_settlement} />
                    <Metric label="Terminal escrow variance" value={pvp.ledger_variance?.terminal_escrow_abs_total} />
                </div>
            </Panel>

            <Panel title="24h Player Funnel And Conversion Analytics">
                <div style={S.grid}>
                    <Metric
                        label="Solo Sessions Started"
                        value={playerFunnel.solo_sessions_started ?? 0}
                        detail={`Unique Players: ${fmt(playerFunnel.solo_unique_players ?? 0)}`}
                    />
                    <Metric label="Solo Sessions Submitted" value={playerFunnel.solo_sessions_submitted ?? 0} />
                    <Metric label="Solo Completion Rate" value={`${Number(playerFunnel.solo_completion_rate_pct ?? 0).toFixed(1)}%`} />
                    <Metric label="Paid Skips" value={playerFunnel.paid_skips_count ?? 0} />
                    <Metric
                        label="PvP Matches Created"
                        value={playerFunnel.pvp_matches_created ?? 0}
                        detail={`Completed: ${fmt(playerFunnel.pvp_matches_completed ?? 0)}`}
                    />
                    <Metric
                        label="PvP H2H Vs Horse Mix"
                        value={`${fmt(playerFunnel.pvp_human_human_count ?? 0)} H2H / ${fmt(playerFunnel.pvp_human_horse_count ?? 0)} Horse`}
                    />
                    <Metric label="Nightly Human Registrations" value={playerFunnel.nightly_human_registrations ?? 0} />
                    <Metric
                        label="Nightly Reminder Opt-Ins"
                        value={playerFunnel.nightly_reminders_opted_in ?? 0}
                        detail={`Dispatched: ${fmt(playerFunnel.nightly_reminders_dispatched ?? 0)}`}
                    />
                    <Metric label="Integrity Flagged (24h)" value={playerFunnel.integrity_flagged_sessions ?? 0} />
                </div>
                <p style={S.note}>Aggregated From Authoritative Solo Sessions, Paid Skip Receipts, PvP Matches, Nightly Entrants And Reminder Tables Over The Trailing 24 Hours.</p>
            </Panel>

            <Panel title="Anti-Cheat Integrity Review Queue">
                <div style={{ ...S.grid, marginBottom: 16 }}>
                    <Metric label="Total Signals" value={integritySummary.total_signals ?? 0} />
                    <Metric label="Flagged Sessions" value={integritySummary.flagged_signals ?? 0} />
                    <Metric label="High-Risk Signals" value={integritySummary.high_risk_signals ?? 0} detail="Risk Score 50 Or Higher" />
                </div>
                {flaggedSessions.length ? (
                    <div className={consoleStyles.tableWell} style={S.tableWell} tabIndex={0} role="region" aria-label="Anti-Cheat Integrity Review Queue">
                        <table style={S.table}>
                            <thead>
                                <tr>
                                    <th style={S.th}>Player</th>
                                    <th style={S.th}>Mode</th>
                                    <th style={S.th}>Risk Score</th>
                                    <th style={S.th}>Risk Flags</th>
                                    <th style={S.th}>Tab Blurs</th>
                                    <th style={S.th}>Copy / Paste</th>
                                    <th style={S.th}>Avg Answer Ms</th>
                                    <th style={S.th}>Recorded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flaggedSessions.map((row) => (
                                    <tr key={row.id || row.session_id}>
                                        <td style={S.td}>{fmt(row.display_name)}</td>
                                        <td style={S.td}>{fmt(row.mode)}</td>
                                        <td style={S.td}>
                                            <span style={{ ...S.badge, minHeight: 24, padding: '2px 10px', background: Number(row.risk_score) >= 50 ? '#7f1d1d' : '#0c55c0' }}>
                                                {fmt(row.risk_score)}
                                            </span>
                                        </td>
                                        <td style={S.td}>{Array.isArray(row.risk_flags) && row.risk_flags.length ? row.risk_flags.join(', ') : '-'}</td>
                                        <td style={S.td}>{fmt(row.tab_blur_count)}</td>
                                        <td style={S.td}>{`${fmt(row.copy_attempt_count)} / ${fmt(row.paste_attempt_count)}`}</td>
                                        <td style={S.td}>{fmtMs(row.avg_answer_ms)}</td>
                                        <td style={S.td}>{fmtTime(row.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={S.muted}>No Flagged Integrity Sessions Were Recorded.</p>
                )}
                <p style={S.note}>Integrity Signals Are Strictly Non-Punitive Review Telemetry And Never Block Gameplay Or Degrade Operations Health.</p>
            </Panel>

            <Panel title="Question serving and review">
                <div style={S.grid}>
                    <Metric label="Eligible questions" value={question.eligible_pool} />
                    <Metric label="Review queue" value={question.review_queue} />
                    <Metric label="Valid reports open" value={question.reports_open_valid} />
                    <Metric label="Oldest valid report" value={question.reports_oldest_valid_hours == null ? '-' : `${question.reports_oldest_valid_hours}h`} />
                    <Metric label="Stale open sessions" value={question.sessions_stale_open} />
                    <Metric label="Missing stats" value={question.submitted_without_stats} />
                    <Metric label="Repeat rate: 7 days" value={question.repeat_rate_7d == null ? '-' : `${(Number(question.repeat_rate_7d) * 100).toFixed(1)}%`} />
                    <Metric label="Active quarantines" value={data.question_quarantine?.active} />
                </div>
            </Panel>

            <Panel title="Active alert episodes">
                {data.active_alerts?.length ? (
                    <ul style={S.list}>
                        {data.active_alerts.map((alert) => (
                            <li key={alert.episode_key}><strong>{alert.severity}:</strong> {alert.last_summary || alert.alertname} <span style={S.detail}>Since {fmtTime(alert.firing_since)}</span></li>
                        ))}
                    </ul>
                ) : <p style={S.muted}>No Question-Domain Alert Episode Is Active.</p>}
            </Panel>

            <Panel title="Immutable operator receipts">
                {data.operator_events?.length ? (
                    <ul style={S.list}>
                        {data.operator_events.map((event) => (
                            <li key={event.receiptId}>
                                <strong>{fmt(event.action)}:</strong> {fmt(event.outcome)}
                                <span style={S.detail}> At {fmtTime(event.createdAt)} | Receipt {event.receiptId}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p style={S.muted}>No Operator Receipt Has Been Recorded.</p>}
            </Panel>

            <Panel title="Historical evidence quarantine">
                <div style={S.grid}>
                    <Metric label="Retained evidence records" value={data.historical_quarantine?.total} />
                    {Object.entries(data.historical_quarantine?.by_reason || {}).map(([reason, count]) => (
                        <Metric key={reason} label={reason.replaceAll('_', ' ')} value={count} />
                    ))}
                </div>
                <p style={S.note}>Only Aggregate Counts Are Shown. IDs, Player Data And Immutable Snapshots Never Leave The Server.</p>
            </Panel>
        </main>
    );
}

const S = {
    page: { minHeight: '100vh', maxWidth: 1440, margin: '0 auto', padding: 'clamp(16px, 3vw, 36px)', background: '#070b10', color: '#eef3f8', fontFamily: 'system-ui, sans-serif' },
    header: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 28 },
    headerState: { display: 'grid', justifyItems: 'end', gap: 8 },
    eyebrow: { margin: '0 0 8px', color: '#86daff', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' },
    h1: { margin: '0 0 8px', fontSize: 'clamp(30px, 5vw, 48px)', lineHeight: 1 },
    h2: { margin: 0, fontSize: 18 },
    panel: { marginBottom: 20, padding: 'clamp(16px, 2vw, 24px)', background: '#0a1829', border: '1px solid #445e77', borderRadius: 10 },
    panelHead: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 16 },
    issuePanel: { marginBottom: 20, padding: 20, background: '#2b1115', border: '1px solid #9f303b', borderRadius: 10 },
    mfaPanel: { marginBottom: 20, padding: 20, background: '#0a1f36', border: '1px solid #86daff', borderRadius: 10 },
    resultPanel: { marginBottom: 20, padding: 20, background: '#0d261c', border: '1px solid #2d8b60', borderRadius: 10 },
    mfaLink: { display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '9px 15px', border: '1px solid #86daff', borderRadius: 6, background: '#0c55c0', color: '#f2f7ff', fontWeight: 750, textDecoration: 'none' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12 },
    metric: { minWidth: 0, padding: 14, background: '#0b1c2c', border: '1px solid #445e77', borderRadius: 8 },
    metricLabel: { color: '#bdd0e2', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' },
    metricValue: { marginTop: 6, color: '#fff', fontSize: 22, fontWeight: 750, overflowWrap: 'anywhere' },
    badge: { display: 'inline-flex', minHeight: 32, alignItems: 'center', padding: '5px 12px', borderRadius: 999, color: '#fff', fontSize: 13, fontWeight: 750 },
    neutralBadge: { background: '#263646', border: '1px solid #475d72' },
    burnInHeader: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 },
    compactBadge: { display: 'inline-flex', minHeight: 24, alignItems: 'center', padding: '2px 10px', borderRadius: 999, color: '#fff', fontSize: 12, fontWeight: 750 },
    sloWrap: { display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 280 },
    sloPill: { display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700 },
    tableWell: { overflowX: 'auto', border: '1px solid #283746', borderRadius: 8 },
    table: { width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 },
    th: { padding: '10px 12px', textAlign: 'left', color: '#a9bac9', background: '#111d29', borderBottom: '1px solid #34475a', fontWeight: 700 },
    td: { padding: '10px 12px', borderBottom: '1px solid #223141', whiteSpace: 'nowrap' },
    muted: { margin: 0, color: '#a9bac9', lineHeight: 1.5 },
    detail: { color: '#91a4b5', fontSize: 12 },
    note: { margin: '14px 0 0', color: '#91a4b5', fontSize: 12, lineHeight: 1.5 },
    errorText: { color: '#fecaca', lineHeight: 1.5 },
    list: { margin: '12px 0 0', paddingLeft: 22, display: 'grid', gap: 9, lineHeight: 1.45 },
    error: { padding: 18, background: '#2b1115', border: '1px solid #9f303b', borderRadius: 8, color: '#fecaca' },
    formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 12, marginBottom: 14 },
    label: { display: 'grid', gap: 6, color: '#b9c8d5', fontSize: 12, fontWeight: 700 },
    input: { width: '100%', minHeight: 44, boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #3a4c5e', borderRadius: 6, background: '#09111a', color: '#f7fbff' },
    textarea: { width: '100%', minHeight: 82, boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #3a4c5e', borderRadius: 6, resize: 'vertical', background: '#09111a', color: '#f7fbff' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 },
    button: { minHeight: 44, padding: '9px 15px', border: '1px solid #86daff', borderRadius: 6, background: '#0c55c0', color: '#f2f7ff', fontWeight: 750, cursor: 'pointer' },
    dangerButton: { borderColor: '#c8505c', background: '#671b24' },
    pre: { marginTop: 14, padding: 14, overflowX: 'auto', border: '1px solid #283746', borderRadius: 6, background: '#071019', color: '#cfe4f5', fontSize: 12, whiteSpace: 'pre-wrap' },
};
