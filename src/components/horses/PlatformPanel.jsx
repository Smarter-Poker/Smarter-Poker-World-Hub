import EmergencyStopControls from './EmergencyStopControls';
import EngineControlPanel from './EngineControlPanel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OPERATOR_TIMEOUT_MS } from './useOperatorFetch';
import Pager from './Pager';
import styles from './shared.module.css';
import {
  booleanState, dataOf, engineModel, incidentAcknowledgementPayload, incidentDisposition, incidentOperationId, maintenanceModel,
  numberText, pageOf, permissionRequiredSources, platformAdminUrl, registryRows, sourceFailures, stateOf,
  text, timestamp, toneForState,
} from './platformAdmin';

const GROUPS = Object.freeze([
  { id: 'engine', label: 'Engine', routes: ['engine'] },
  { id: 'maintenance', label: 'Maintenance', routes: ['maintenance'] },
  { id: 'breaks', label: 'Break Evidence', routes: ['breaks'] },
  { id: 'releases', label: 'Release Receipts', routes: ['releases'] },
  { id: 'registry', label: 'Control Registry', routes: ['registry'] },
  { id: 'crons', label: 'Job Health', routes: ['crons'] },
  { id: 'incidents', label: 'Incidents', routes: ['alerts', 'incidents'] },
]);

function Note({ tone = 'info', children }) {
  return <div className={styles[`${tone}Note`] || styles.infoNote}>{children}</div>;
}

function Fact({ label, value, qualifier }) {
  return <div className={styles.platformFact}><span className={styles.opsFactLabel}>{label}</span><strong className={styles.opsFactValue}>{text(value)}</strong>{qualifier ? <span className={styles.platformQualifier}>{qualifier}</span> : null}</div>;
}

function SourceDisclosure({ value, error }) {
  if (error) return <Note tone="danger">Source Unavailable. This Section Is Unknown, Not Empty: {error}</Note>;
  const failures = sourceFailures(value);
  if (!failures.length) return null;
  return <Note tone="warn">Independent Sources Could Not Be Read: {failures.join(', ')}. Their Values Remain Unknown.</Note>;
}

function StatusRail({ state, label = 'Source State' }) {
  const tone = toneForState(state);
  return <div className={`${styles.platformStatus} ${styles[`platformStatus_${tone}`] || ''}`}><span>{label}</span><strong>{text(state)}</strong></div>;
}

function EvidenceRows({ title, value, empty }) {
  const page = pageOf(value);
  return <section className={styles.platformFrame} aria-label={title}><div className={styles.platformFrameHead}><h3>{title}</h3><span>{page.total === null ? `${page.rows.length} Returned` : `${page.rows.length} Of ${page.total}`}</span></div>{page.rows.length ? <div className={styles.platformLedger}>{page.rows.map((row, index) => <article className={styles.platformLedgerRow} key={row.id || row.key || `${title}-${index}`}><div><strong>{row.title || row.name || row.key || row.target_sha || row.alertname || row.classification || row.type || row.source || `Evidence ${index + 1}`}</strong><span>{timestamp(row.at || row.last_received_at || row.occurredAt || row.created_at || row.recorded_at || row.detected_at || row.updated_at || row.started_at)}</span></div><div><span>{text(row.state ?? row.status ?? row.result)}</span><span>{text(row.reason ?? row.message ?? row.summary ?? row.description ?? row.detail ?? row.source_table, 'No Additional Detail')}</span></div></article>)}</div> : <div className={styles.stateNote}>{empty}</div>}{page.truncated || page.hasMore ? <Note tone="warn">This Evidence List Is Capped. More Rows Exist Than Are Shown.</Note> : null}</section>;
}

function EngineSection({ value, error }) {
  const model = engineModel(value);
  return <><SourceDisclosure value={value} error={error} /><StatusRail state={error ? 'Unknown' : model.state} label="Engine Evidence" /><div className={styles.platformInstrumentGrid}>
    <Fact label="Reachability" value={error ? 'Unknown' : booleanState(model.reachable)} />
    <Fact label="Liveness" value={error ? 'Unknown' : model.liveness} />
    <Fact label="Release SHA" value={error ? 'Unknown' : model.releaseSha} />
    <Fact label="Version" value={error ? 'Unknown' : model.version} />
    <Fact label="Instance" value={error ? 'Unknown' : model.instance} />
    <Fact label="Uptime" value={error ? 'Unknown' : model.uptime} />
    <Fact label="Active Tables" value={error ? 'Unknown' : numberText(model.activeTables)} />
    <Fact label="Dealable Tables" value={error ? 'Unknown' : numberText(model.dealableTables)} />
    <Fact label="Stalled Tables" value={error ? 'Unknown' : numberText(model.stalledTables)} />
    <Fact label="Active Tournaments" value={error ? 'Unknown' : numberText(model.tournaments)} />
    <Fact label="Humans Seated, Live Tables" value={error ? 'Unknown' : numberText(model.humansSeated)} qualifier="Read From The Database, Horses And Left Seats Excluded" />
    <Fact label="Occupied Seats, Database" value={error ? 'Unknown' : numberText(model.occupiedSeats)} />
    <Fact label="Average Hands Per Hour" value={error ? 'Unknown' : numberText(model.averageHandsPerHour)} />
    <Fact label="Estimated Platform Hands Per Second" value={error ? 'Unknown' : numberText(model.estimatedHandsPerSecond)} qualifier="Estimated From Active Tables And Measured-Table Hands Per Hour" />
    <Fact label="Average Action Latency" value={error ? 'Unknown' : knownMs(model.actionLatency)} />
    <Fact label="Latency Violations" value={error ? 'Unknown' : numberText(model.latencyViolations)} qualifier={model.latencySample ? `Sample: ${text(model.latencySample)}` : 'Sample Unknown'} />
  </div><div className={styles.platformSourceBar}><span>Checked {error ? 'Unknown' : timestamp(model.checkedAt)}</span><span>Cache {error ? 'Unknown' : text(model.cache)}</span><span>Stale {error ? 'Unknown' : booleanState(model.stale)}</span></div></>;
}

function knownMs(value) { return value === null || value === undefined || !Number.isFinite(Number(value)) ? 'Unknown' : `${numberText(value)} ms`; }

function MaintenanceSection({ value, error }) {
  const model = maintenanceModel(value);
  const runtime = model.runtime || {};
  const durable = model.durable || {};
  return <><SourceDisclosure value={value} error={error} /><StatusRail state={error ? 'Unknown' : model.state} label="Maintenance Reconciliation" />
    <div className={styles.platformSplit}>
      <section className={styles.platformFrame}><div className={styles.platformFrameHead}><h3>Runtime Maintenance</h3><span>Engine Health</span></div><div className={styles.platformFacts}><Fact label="Active" value={error ? 'Unknown' : booleanState(runtime.active ?? runtime.enabled)} /><Fact label="Phase" value={error ? 'Unknown' : runtime.phase} /><Fact label="Durable Confirmed" value={error ? 'Unknown' : booleanState(runtime.durableConfirmed ?? runtime.durable_confirmed)} /><Fact label="Break Ends" value={error ? 'Unknown' : timestamp(runtime.breakEndsAt ?? runtime.break_ends_at)} /><Fact label="Remaining" value={error || runtime.remainingMs == null ? 'Unknown' : `${numberText(runtime.remainingMs)} ms`} /><Fact label="Unparked Tables" value={error ? 'Unknown' : numberText(runtime.unparkedTables ?? runtime.unparked_tables)} /><Fact label="Ready For Restart" value={error ? 'Unknown' : booleanState(runtime.readyForRestart ?? runtime.ready_for_restart)} /></div></section>
      <section className={styles.platformFrame}><div className={styles.platformFrameHead}><h3>Durable Break Authority</h3><span>Database Singleton</span></div><div className={styles.platformFacts}><Fact label="Active" value={error ? 'Unknown' : booleanState(durable.active ?? durable.enabled)} /><Fact label="Declared By" value={error ? 'Unknown' : durable.declaredBy ?? durable.declared_by} /><Fact label="Ownership Token" value={error ? 'Unknown' : durable.ownershipToken ?? durable.ownership_token} /><Fact label="Freeze Enforced" value={error ? 'Unknown' : booleanState(durable.freezeEnforced ?? durable.enforce_freeze)} /><Fact label="Latest Thaw" value={error ? 'Unknown' : timestamp(model.thaw?.created_at ?? model.thaw?.thawed_at)} /></div></section>
    </div><Note tone="warn">{model.authorityGap || 'Commands Retain Their Original Announcement And Deadline. A Queued Request Is Not An Active Freeze.'}</Note></>;
}

function BreaksSection({ value, error }) {
  const body = dataOf(value);
  const groups = [
    ['Break Scorecards', body.scorecards ?? body.ca_break_scorecards],
    ['Maintenance Break Log', body.breakLog ?? body.engine_maintenance_break_log],
    ['Maintenance Faults', body.faults ?? body.engine_maintenance_break_faults],
    ['Maintenance Thaws', body.thaws ?? body.engine_maintenance_thaws],
    ['Freeze Circulation Marks', body.circulationMarks ?? body.ca_freeze_circulation_marks],
  ];
  return <><SourceDisclosure value={value} error={error} />{error ? <StatusRail state="Unknown" label="Break Evidence" /> : groups.map(([title, rows]) => <EvidenceRows key={title} title={title} value={rows || { rows: [] }} empty={`No ${title} Rows Were Returned. This Does Not Prove The Source Is Empty.`} />)}</>;
}

function ReleasesSection({ value, error }) {
  const body = dataOf(value);
  const currentSha = body.currentEngineSha ?? body.current_engine_sha;
  const latestSha = body.latestShippedSha ?? body.latest_shipped_sha ?? body.rows?.[0]?.target_sha;
  const state = error ? 'Unknown' : currentSha && latestSha && currentSha !== latestSha ? 'Release Divergence' : stateOf(value);
  return <><SourceDisclosure value={value} error={error} /><StatusRail state={state} label="Engine Release Reconciliation" /><div className={styles.platformInstrumentGrid}><Fact label="Current Engine SHA" value={error ? 'Unknown' : currentSha} /><Fact label="Latest Shipped Receipt" value={error ? 'Unknown' : latestSha} /></div><Note tone="info">Release Receipts Are Evidence Only. Dispatch And Retry Remain Provider-Owned Actions.</Note><EvidenceRows title="Engine Release Receipts" value={error ? { rows: [] } : value} empty="No Release Receipt Rows Were Returned. Current Release State Is Unknown." /></>;
}

function RegistrySection({ value, error }) {
  const rows = error ? [] : registryRows(value);
  const boundaries = [
    ['General Tournament Registration', 'Stops New Registration, Rebuys And Add-Ons. Existing Play, Unregistration, Cancellation And Funded Refunds Continue.'],
    ['Cashout', 'The Dedicated Stop Guards Cashout Requests And Approval Execution. Cancellation, Decline, Expiry Refunds And Table Departures Continue.'],
    ['Chip Issuance', 'Stops Positive Chip And Diamond Issuance. Burns And Transfers Of Existing Funds Continue; Funded Refunds And Reversals Use Their Existing Owners.'],
  ];
  return <><SourceDisclosure value={value} error={error} /><StatusRail state={error ? 'Unknown' : stateOf(value)} label="Control Registry" /><Note tone="info">This Is An Allowlisted Projection Of Existing Authorities. It Does Not Copy State Or Create A Generic Updater.</Note><div className={styles.platformRegistry}>{rows.map((row, index) => <article className={styles.platformControl} key={`${row.domain}-${row.key}-${index}`}><div className={styles.platformControlHead}><div><span>{row.domain}</span><h3>{row.key}</h3></div><strong>{row.sourceHealth === 'Unknown' ? 'Unknown' : row.state}</strong></div><div className={styles.platformFacts}><Fact label="Kind" value={row.kind} /><Fact label="Scope" value={row.scope} /><Fact label="Rollout" value={row.rolloutPercent === null ? 'Not Supported' : `${row.rolloutPercent}%`} /><Fact label="Consumer" value={row.consumer} /><Fact label="Source" value={row.sourceTable ?? row.source_table} /><Fact label="Field" value={row.sourceField ?? row.source_field} /><Fact label="Write Authority" value={row.writeAuthority ?? row.write_authority ?? (row.writable ? 'Source-Specific Route' : 'Read-Only')} /><Fact label="Source Health" value={row.sourceHealth} /></div>{row.blastRadius || row.blast_radius ? <p className={styles.platformBlast}>{row.blastRadius ?? row.blast_radius}</p> : null}</article>)}</div>{!rows.length ? <div className={styles.stateNote}>{error ? 'Control Registry Is Unknown.' : 'No Allowlisted Controls Were Returned. This Is Missing Evidence, Not An Empty Registry.'}</div> : null}<section className={styles.platformFrame} aria-labelledby="emergency-stop-boundaries-title"><div className={styles.platformFrameHead}><h3 id="emergency-stop-boundaries-title">Emergency Stop Boundaries</h3><span>Transaction Scope</span></div><div className={styles.platformRegistry}>{boundaries.map(([name, detail]) => <article className={styles.platformControl} key={name}><div className={styles.platformControlHead}><div><span>Stop Scope</span><h3>{name}</h3></div><strong>Read Current State Below</strong></div><p className={styles.platformBlast}>{detail}</p></article>)}</div></section></>;
}

function JobsSection({ value, error }) {
  const rows = error ? [] : pageOf(value).rows;
  const body = dataOf(value);
  return <><SourceDisclosure value={value} error={error} /><StatusRail state={error ? 'Unknown' : stateOf(value)} label="Job Telemetry" /><Note tone="info">Scheduler Evidence Is Read-Only. A Job Missing From Its Expected Telemetry Is Unknown Unless The Registry Proves It Should Report There.</Note><div className={styles.platformRegistry}>{rows.map((row, index) => <article className={styles.platformControl} key={row.job_name || row.name || index}><div className={styles.platformControlHead}><div><span>{text(row.scheduler, 'Scheduler Unknown')}</span><h3>{text(row.job_name ?? row.name)}</h3></div><strong>{text(row.state ?? row.status)}</strong></div><div className={styles.platformFacts}><Fact label="Last Success" value={timestamp(row.last_success_at ?? row.lastSuccessAt)} /><Fact label="Last Evidence" value={timestamp(row.last_seen_at ?? row.created_at ?? row.started_at)} /><Fact label="Observed P90 Gap" value={row.p90_gap_minutes == null ? 'Unknown' : `${numberText(row.p90_gap_minutes)} Minutes`} /><Fact label="Staleness" value={row.staleness ?? row.stale_state} /></div></article>)}</div>{!rows.length ? <div className={styles.stateNote}>{error ? 'Job Health Is Unknown.' : 'No Open Claw Staleness Rows Were Returned. Jobs Are Unknown, Not Never Run.'}</div> : null}<EvidenceRows title="Instrumented Handler Health" value={body.health || { rows: [] }} empty="No Handler Health Rows Were Returned. Handler State Is Unknown." /><EvidenceRows title="Recent Job Executions" value={body.executions || { rows: [] }} empty="No Execution Rows Were Returned. This Does Not Prove Jobs Never Ran." /></>;
}

function pagerFor(active, data) {
  const body = dataOf(data?.[active]);
  if (active === 'breaks') {
    const pages = [body.scorecards, body.breakLog, body.faults, body.thaws, body.circulationMarks]
      .filter(Boolean).map((value) => pageOf(value));
    if (!pages.length) return null;
    const knownTotals = pages.map((page) => page.total).filter((value) => value !== null);
    const count = Math.max(0, ...pages.map((page) => page.rows.length));
    return {
      count,
      total: knownTotals.length === pages.length ? Math.max(0, ...knownTotals) : null,
      limit: pages[0].limit || 100,
      offset: pages[0].offset || 0,
      hasMore: pages.some((page) => page.hasMore),
      noun: 'Rows Per Evidence Source',
    };
  }
  if (active === 'crons') {
    const pages = [body.health, body.staleness, body.executions].filter(Boolean).map((value) => pageOf(value));
    if (!pages.length) return null;
    const knownTotals = pages.map((page) => page.total).filter((value) => value !== null);
    return {
      count: Math.max(0, ...pages.map((page) => page.rows.length)),
      total: knownTotals.length === pages.length ? Math.max(0, ...knownTotals) : null,
      limit: pages[0].limit || 100,
      offset: pages[0].offset || 0,
      hasMore: pages.some((page) => page.hasMore),
      noun: 'Rows Per Job Evidence Source',
    };
  }
  if (!['releases', 'alerts', 'incidents'].includes(active)) return null;
  const page = pageOf(body);
  return {
    count: page.rows.length,
    total: page.total,
    limit: page.limit || 100,
    offset: page.offset,
    hasMore: page.hasMore,
    noun: active === 'crons' ? 'Job Rows' : active === 'releases' ? 'Release Receipts' : active === 'alerts' ? 'Alert Rows' : 'Incident Rows',
  };
}

function IncidentsSection({ alerts, incidents, alertError, incidentError, authFetch, reload }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const pendingOperations = useRef(new Map());
  const alertPage = pageOf(alerts);
  const incidentPage = pageOf(incidents);
  const alertRows = alertError ? [] : alertPage.rows;
  const incidentRows = incidentError ? [] : incidentPage.rows;
  const withheld = [...permissionRequiredSources(alerts), ...permissionRequiredSources(incidents)]
    .filter((source, index, all) => all.findIndex((candidate) => candidate.name === source.name && candidate.permission === source.permission) === index);
  const canAcknowledge = dataOf(incidents)?.acknowledgement?.available === true;
  const begin = (row, action) => {
    setActionError('');
    setEditor({ identity: row.identity, action, note: '', row });
  };
  const submit = async (event) => {
    event.preventDefault();
    const note = editor?.note?.trim();
    if (!editor || note.length < 3) { setActionError('Enter A Note Of At Least 3 Characters.'); return; }
    const key = `${editor.identity}:${editor.action}`;
    const operationId = pendingOperations.current.get(key) || incidentOperationId();
    pendingOperations.current.set(key, operationId);
    setSaving(true);
    setActionError('');
    try {
      await authFetch('/api/horses/platform-admin', {
        method: 'POST',
        timeoutMs: OPERATOR_TIMEOUT_MS,
        body: JSON.stringify(incidentAcknowledgementPayload(editor.row, editor.action, note, operationId)),
      });
      pendingOperations.current.delete(key);
      setEditor(null);
      await reload();
    } catch (error) {
      setActionError(error?.message || 'Incident Ownership Could Not Be Recorded. Retry Uses The Same Operation Id.');
    } finally {
      setSaving(false);
    }
  };
  return <><SourceDisclosure value={alerts} error={alertError} /><SourceDisclosure value={incidents} error={incidentError} />
    {withheld.length ? <Note tone="warn">Permission-Scoped Sources Withheld: {withheld.map((source) => `${source.name} (${source.permission})`).join(', ')}. This View Is Partial, Not Complete.</Note> : null}
    <section className={styles.platformFrame}><div className={styles.platformFrameHead}><h3>Alert Health</h3><span>{alertError ? 'Unknown' : `${alertRows.length} Returned`}</span></div><div className={styles.platformLedger}>{alertRows.map((row, index) => <article className={styles.platformLedgerRow} key={row.id || `${row.source}-${index}`}><div><strong>{text(row.alertname ?? row.source ?? row.type, 'Alert')}</strong><span>{timestamp(row.last_received_at ?? row.received_at ?? row.created_at ?? row.detected_at)}</span></div><div><span>{text(row.state ?? row.status)}</span><span>{text(row.message ?? row.summary ?? row.description ?? row.reason, 'No Detail Returned')}</span></div></article>)}</div>{!alertRows.length ? <div className={styles.stateNote}>{alertError ? 'Alert Health Is Unknown.' : 'No Alert Rows Were Returned. This Does Not Prove There Are No Alerts.'}</div> : null}</section>
    <section className={styles.platformFrame}><div className={styles.platformFrameHead}><h3>Platform Incidents</h3><span>{incidentError ? 'Unknown' : `${incidentRows.length} Returned`}</span></div><div className={styles.platformLedger}>{incidentRows.map((row, index) => <article className={styles.platformLedgerRow} key={row.identity || row.incident_key || row.id || index}><div><strong>{text(row.title ?? row.classification ?? row.alertname ?? row.source, 'Platform Incident')}</strong><span>{timestamp(row.lastSeenAt ?? row.occurredAt ?? row.last_received_at ?? row.detected_at ?? row.created_at)}</span><span>Source Status: {text(row.status ?? (row.resolved === true ? 'resolved' : null))}</span></div><div><span>{incidentDisposition(row)}</span><span>{text(row.summary ?? row.message ?? row.description ?? row.reason, 'No Detail Returned')}</span>{row.acknowledgementNote ? <span>Ownership Note: {text(row.acknowledgementNote)}</span> : null}{canAcknowledge ? <div><button type="button" className={`${styles.btn} ${styles.btnGo}`} disabled={saving} onClick={() => begin(row, row.ownershipState === 'acknowledged' ? 'release' : 'acknowledge')}>{row.ownershipState === 'acknowledged' ? 'Release Ownership' : 'Acknowledge And Own'}</button></div> : null}{editor?.identity === row.identity ? <form onSubmit={submit}><label><span>Audit Note</span><textarea value={editor.note} maxLength={500} disabled={saving} onChange={(event) => setEditor((current) => ({ ...current, note: event.target.value }))} /></label><div><button type="submit" className={`${styles.btn} ${styles.btnGo}`} disabled={saving}>{saving ? 'Recording...' : `Confirm ${editor.action === 'acknowledge' ? 'Acknowledgement' : 'Release'}`}</button><button type="button" className={styles.btn} disabled={saving} onClick={() => { setEditor(null); setActionError(''); }}>Cancel</button></div>{actionError ? <Note tone="danger">{actionError}</Note> : null}</form> : null}</div></article>)}</div>{!incidentRows.length ? <div className={styles.stateNote}>{incidentError ? 'Platform Incidents Are Unknown.' : 'No Incident Rows Were Returned. This Does Not Prove There Are No Incidents.'}</div> : null}</section>
    {alertPage.cap?.reached || incidentPage.cap?.reached ? <Note tone="warn">This Combined View Reached Its {numberText(alertPage.cap?.maxRows ?? incidentPage.cap?.maxRows)} Row Evidence Cap. Newest Evidence Is Shown And Additional Rows Are Intentionally Not Loaded.</Note> : null}
    <Note tone="warn">Acknowledgement Means Seen And Owned. It Never Resolves A Drift, Clears An Alert, Repairs A Break Or Makes Health Green.</Note></>;
}

export default function PlatformPanel({ authFetch, permissions = [] }) {
  const [active, setActive] = useState('engine');
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: false, data: {}, errors: {} });
  const sequence = useRef(0);
  const group = useMemo(() => GROUPS.find((candidate) => candidate.id === active) || GROUPS[0], [active]);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setState((old) => ({ ...old, loading: true }));
    const settled = await Promise.all(group.routes.map(async (section) => {
      try { return [section, dataOf(await authFetch(platformAdminUrl(section, { limit: 100, offset }), { timeoutMs: OPERATOR_TIMEOUT_MS })), '']; }
      catch (error) { return [section, null, error?.message || 'Read Failed']; }
    }));
    if (current !== sequence.current) return;
    const nextData = {}; const nextErrors = {};
    for (const [section, value, error] of settled) { if (error) nextErrors[section] = error; else nextData[section] = value; }
    setState((old) => ({ loading: false, data: { ...old.data, ...nextData }, errors: { ...old.errors, ...Object.fromEntries(group.routes.map((route) => [route, nextErrors[route] || ''])) } }));
  }, [authFetch, group, offset]);

  useEffect(() => { load(); return () => { sequence.current += 1; }; }, [load]);

  let content = null;
  if (active === 'engine') content = <EngineSection value={state.data.engine} error={state.errors.engine} />;
  if (active === 'maintenance') content = <><MaintenanceSection value={state.data.maintenance} error={state.errors.maintenance} /><EngineControlPanel authFetch={authFetch} domain="maintenance" permissions={permissions} /></>;
  if (active === 'breaks') content = <BreaksSection value={state.data.breaks} error={state.errors.breaks} />;
  if (active === 'releases') content = <ReleasesSection value={state.data.releases} error={state.errors.releases} />;
  if (active === 'registry') content = <><RegistrySection value={state.data.registry} error={state.errors.registry} /><EmergencyStopControls authFetch={authFetch} /></>;
  if (active === 'crons') content = <JobsSection value={state.data.crons} error={state.errors.crons} />;
  if (active === 'incidents') content = <IncidentsSection alerts={state.data.alerts} incidents={state.data.incidents} alertError={state.errors.alerts} incidentError={state.errors.incidents} authFetch={authFetch} reload={load} />;

  const pager = pagerFor(active, state.data);
  return <section className={`${styles.opsPanel} ${styles.platformPanel}`} aria-labelledby="platform-title"><header className={styles.opsHeader}><div><span className={styles.platformEyebrow}>Control Plane Evidence</span><h2 id="platform-title" className={styles.opsTitle}>Platform Operations</h2><p className={styles.opsSubtitle}>Inspect Engine, Maintenance, Release And Scheduler Evidence. Maintenance Commands Follow The Existing Hourly Window. Emergency Stops And Incident Ownership Use Their Audited Authorities; Missing Sources Stay Unknown.</p></div><button type="button" className={`${styles.btn} ${styles.btnGo}`} onClick={load} disabled={state.loading}>{state.loading ? 'Reading Evidence...' : 'Refresh Active Section'}</button></header><nav className={styles.opsSubnav} aria-label="Platform Operations Sections">{GROUPS.map((item) => <button key={item.id} type="button" className={`${styles.opsSubnavBtn} ${active === item.id ? styles.opsSubnavActive : ''}`} aria-current={active === item.id ? 'page' : undefined} onClick={() => { setActive(item.id); setOffset(0); }}>{item.label}</button>)}</nav><div aria-live="polite">{state.loading && !group.routes.some((route) => state.data[route] || state.errors[route]) ? <div className={styles.stateNote}>Reading {group.label}...</div> : content}</div>{pager ? <Pager offset={pager.offset} limit={pager.limit} count={pager.count} total={pager.total} hasMore={pager.hasMore} loading={state.loading} noun={pager.noun} onPrevious={() => setOffset(Math.max(0, offset - pager.limit))} onNext={() => setOffset(offset + pager.limit)} /> : null}</section>;
}
