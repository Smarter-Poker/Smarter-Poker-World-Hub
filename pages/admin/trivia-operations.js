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

async function fetchOperations(token, query = '') {
    const response = await fetch(`/api/admin/trivia-operations${query}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
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

function Metric({ label, value, detail }) {
    return (
        <div className={consoleStyles.metric} style={S.metric}>
            <div style={S.metricLabel}>{label}</div>
            <div style={S.metricValue}>{fmt(value)}</div>
            {detail ? <div style={S.detail}>{detail}</div> : null}
        </div>
    );
}

function Panel({ title, children }) {
    return (
        <section className={consoleStyles.panel} style={S.panel}>
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
    const [actionState, setActionState] = useState({ busy: false, item: null, error: null, pending: null });
    const [questionForm, setQuestionForm] = useState({ targetId: '', reasonCode: 'operator_review', reason: '' });
    const [pvpReason, setPvpReason] = useState('');
    const [tournamentForm, setTournamentForm] = useState({ targetId: '', reason: '' });
    const [settlementForm, setSettlementForm] = useState({ targetId: '', reason: '' });
    const [incidentForm, setIncidentForm] = useState({ incidentKey: '', severity: 'warning', status: 'open', note: '', reason: '' });
    const [lookupForm, setLookupForm] = useState({ kind: 'user', targetId: '' });
    const [lookupState, setLookupState] = useState({ busy: false, result: null, error: null });
    const tokenRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const token = readLocalAccessToken();
            if (!token) {
                window.location.replace('/auth/login?redirect=' + encodeURIComponent('/admin/trivia-operations'));
                return;
            }
            tokenRef.current = token;
            try {
                const { response, body } = await fetchOperations(token);
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

    async function refreshSnapshot() {
        if (!tokenRef.current) return;
        const { response, body } = await fetchOperations(tokenRef.current);
        if (body?.generated_at) setState({ loading: false, snapshot: body, error: null });
        else if (response.status !== 503) setState((current) => ({ ...current, error: body?.error || 'Unable to refresh operations data.' }));
    }

    async function executeAction(input, retry = false) {
        const token = tokenRef.current;
        if (!token) return;
        const operation = retry ? input : { ...input, requestKey: requestKey() };
        setActionState({ busy: true, item: null, error: null, pending: operation });
        try {
            const response = await fetch('/api/admin/trivia-operations', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(operation),
            });
            const body = await response.json().catch(() => ({}));
            const item = body?.item || null;
            if (item?.receiptId) {
                setActionState({ busy: false, item, error: body.success ? null : item.result?.detail || item.result?.error || 'Action was not completed.', pending: null });
                await refreshSnapshot();
                return;
            }
            const unknownOutcome = response.status >= 500;
            setActionState({
                busy: false,
                item: null,
                error: body?.error || `Action failed (HTTP ${response.status}).`,
                pending: unknownOutcome ? operation : null,
            });
        } catch (error) {
            // An unknown transport outcome keeps the exact request key. The
            // retry button replays that durable operation instead of creating
            // a second side effect.
            setActionState({ busy: false, item: null, error: error?.message || 'Action response was not received.', pending: operation });
        }
    }

    async function runLookup() {
        const token = tokenRef.current;
        if (!token) return;
        setLookupState({ busy: true, result: null, error: null });
        try {
            const query = `?lookupKind=${encodeURIComponent(lookupForm.kind)}&lookupId=${encodeURIComponent(lookupForm.targetId.trim())}`;
            const { body } = await fetchOperations(token, query);
            if (!body?.support_lookup) throw new Error(body?.error || 'Support lookup failed.');
            setLookupState({ busy: false, result: body.support_lookup, error: null });
        } catch (error) {
            setLookupState({ busy: false, result: null, error: error?.message || 'Support lookup failed.' });
        }
    }

    if (state.loading) {
        return <main className={consoleStyles.surface} style={S.page}><div className={consoleStyles.state} role="status">Loading Trivia Operations...</div></main>;
    }
    if (state.error) {
        return <main className={consoleStyles.surface} style={S.page}><div className={consoleStyles.state} style={S.error} role="alert">{state.error}</div></main>;
    }

    const data = state.snapshot;
    const question = data.question_health?.metrics || {};
    const pvp = data.pvp_metrics || {};
    const scheduler = data.scheduler || {};
    const upcoming = data.tournaments?.upcoming || [];
    const active = data.tournaments?.active || [];
    const capabilities = new Set(data.authority?.capabilities || []);
    const can = (capability) => capabilities.has(capability);
    const pvpConfig = data.pvp_config || {};
    const cutoverStatus = data.cutover_status || {};
    const cutoverGates = cutoverStatus.gates || {};
    const treasury = cutoverStatus.treasury || {};
    const recoveryStatus = cutoverStatus.recovery_status || null;

    return (
        <main className={consoleStyles.surface} style={S.page}>
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

            {actionState.item || actionState.error ? (
                <section style={actionState.item?.outcome === 'succeeded' ? S.resultPanel : S.issuePanel} aria-live="polite">
                    <h2 style={S.h2}>{actionState.item?.outcome === 'succeeded' ? 'Action recorded' : 'Action result'}</h2>
                    {actionState.item?.receiptId ? <p style={S.note}>Receipt: <code>{actionState.item.receiptId}</code>{actionState.item.replayed ? ' (replayed)' : ''}</p> : null}
                    {actionState.error ? <p style={S.errorText}>{actionState.error}</p> : null}
                    {actionState.pending ? (
                        <ActionButton disabled={actionState.busy} onClick={() => executeAction(actionState.pending, true)}>
                            Retry Same Request
                        </ActionButton>
                    ) : null}
                </section>
            ) : null}

            <Panel title="Release controls">
                <div style={S.grid}>
                    {Object.entries(data.controls || {}).map(([name, enabled]) => (
                        <Metric key={name} label={name.replaceAll('_', ' ')} value={enabled} />
                    ))}
                </div>
                <p style={S.note}>These Are Public Deployment Flags. Runtime Engine Switches Remain Separate Canary Controls, And Supported Recovery Actions Require Named Capabilities And Immutable Receipts.</p>
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
                    <Metric label="Capabilities" value={(data.authority?.capabilities || []).join(', ') || 'None'} />
                    <Metric label="Recent receipts" value={data.operator_events?.length || 0} />
                    <Metric label="Durable alert episodes" value={data.operations_health?.activeEpisodes?.length || 0} />
                </div>
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
                    <Metric label="Current holder" value={scheduler.lease?.holder_id} />
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
    eyebrow: { margin: '0 0 8px', color: '#8dbbe0', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' },
    h1: { margin: '0 0 8px', fontSize: 'clamp(30px, 5vw, 48px)', lineHeight: 1 },
    h2: { margin: 0, fontSize: 18 },
    panel: { marginBottom: 20, padding: 'clamp(16px, 2vw, 24px)', background: '#0d141d', border: '1px solid #283746', borderRadius: 10 },
    panelHead: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 16 },
    issuePanel: { marginBottom: 20, padding: 20, background: '#2b1115', border: '1px solid #9f303b', borderRadius: 10 },
    resultPanel: { marginBottom: 20, padding: 20, background: '#0d261c', border: '1px solid #2d8b60', borderRadius: 10 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12 },
    metric: { minWidth: 0, padding: 14, background: '#111d29', border: '1px solid #2a3c4d', borderRadius: 8 },
    metricLabel: { color: '#a9bac9', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' },
    metricValue: { marginTop: 6, color: '#fff', fontSize: 22, fontWeight: 750, overflowWrap: 'anywhere' },
    badge: { display: 'inline-flex', minHeight: 32, alignItems: 'center', padding: '5px 12px', borderRadius: 999, color: '#fff', fontSize: 13, fontWeight: 750 },
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
    input: { width: '100%', minHeight: 42, boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #3a4c5e', borderRadius: 6, background: '#09111a', color: '#f7fbff' },
    textarea: { width: '100%', minHeight: 82, boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #3a4c5e', borderRadius: 6, resize: 'vertical', background: '#09111a', color: '#f7fbff' },
    actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 },
    button: { minHeight: 42, padding: '9px 15px', border: '1px solid #4b8ec6', borderRadius: 6, background: '#123c5e', color: '#f5fbff', fontWeight: 750, cursor: 'pointer' },
    dangerButton: { borderColor: '#c8505c', background: '#671b24' },
    pre: { marginTop: 14, padding: 14, overflowX: 'auto', border: '1px solid #283746', borderRadius: 6, background: '#071019', color: '#cfe4f5', fontSize: 12, whiteSpace: 'pre-wrap' },
};
