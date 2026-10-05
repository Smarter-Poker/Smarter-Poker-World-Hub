import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../src/lib/supabase';
const { formatVideoOperationsMetric } = require('../../../lib/videoOperationsContract');

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });
const windows = [24, 72, 168];
const adjustableControls = new Set(['video_library_discovery', 'video_library_enrichment', 'video_library_reel_creation', 'video_library_reel_publication', 'video_library_editorial_gate']);
const windowLabel = (hours) => hours === 168 ? '7 days' : `${hours} hours`;
function token() {
  try { return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null; }
  catch { return null; }
}
function newOperationId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') return null;
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const number = (value) => Number(value || 0).toLocaleString();
const sum = (rows, key) => (rows || []).reduce((total, row) => total + Number(row[key] || 0), 0);

function Metric({ label, value, note, tone = 'mint' }) {
  return <article className={`metric ${tone}`}><span>{label}</span><strong>{formatVideoOperationsMetric(value)}</strong>{note && <small>{note}</small>}</article>;
}

export default function VideoOperations() {
  const [windowHours, setWindowHours] = useState(24);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [controlReason, setControlReason] = useState({});
  const [savingControl, setSavingControl] = useState('');
  const pendingControlOperations = useRef(new Map());
  const requestSequence = useRef(0);
  const requestController = useRef(null);
  const controlController = useRef(null);
  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true); setError('');
    const access = token();
    if (!access) { setData(null); setError('Sign in with an admin account to view pipeline operations.'); setBusy(false); return; }
    try {
      const response = await fetch(`/api/admin/video-operations?windowHours=${windowHours}`, {
        headers: { Authorization: `Bearer ${access}` }, cache: 'no-store', signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setData(null);
          pendingControlOperations.current.clear();
        }
        throw new Error(body.error || 'Operations snapshot failed');
      }
      if (requestId !== requestSequence.current) return;
      if (token() !== access) { setData(null); setError('Admin session changed. Sign in again to view pipeline operations.'); return; }
      setData(body);
    } catch (cause) {
      if (cause.name !== 'AbortError' && requestId === requestSequence.current) {
        if (token() !== access) { setData(null); setError('Admin session changed. Sign in again to view pipeline operations.'); }
        else setError(cause.message || 'Operations snapshot failed');
      }
    } finally { if (requestId === requestSequence.current) setBusy(false); }
  }, [windowHours]);
  useEffect(() => {
    load();
    return () => { requestController.current?.abort(); requestSequence.current += 1; };
  }, [load]);

  useEffect(() => {
    const invalidateSession = (event) => {
      requestController.current?.abort();
      controlController.current?.abort();
      requestSequence.current += 1;
      pendingControlOperations.current.clear();
      setData(null);
      setSavingControl('');
      setBusy(false);
      const access = event === 'SIGNED_OUT' ? null : token();
      if (access) {
        setError('Admin session changed. Reloading the operations snapshot.');
        load();
      } else {
        setError('Sign in with an admin account to view pipeline operations.');
      }
    };
    const handleStorage = (event) => {
      if (event.key === null
        || event.key === 'smarter-poker-auth'
        || (event.key?.startsWith('sb-') && event.key?.endsWith('-auth-token'))) invalidateSession();
    };
    window.addEventListener('storage', handleStorage);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(invalidateSession);
    return () => {
      window.removeEventListener('storage', handleStorage);
      subscription?.unsubscribe();
    };
  }, [load]);

  const changeControl = useCallback(async (control) => {
    if (savingControl) return;
    const reason = String(controlReason[control.control_key] || '').trim();
    if (!reason) { setError('Enter a short reason before changing a pipeline switch.'); return; }
    const access = token();
    if (!access) { setError('Admin session expired. Sign in and retry.'); return; }
    const operation = pendingControlOperations.current.get(control.control_key) || {
      control_key: control.control_key, enabled: !control.enabled,
      expected_updated_at: control.updated_at, reason,
      operation_id: newOperationId(),
    };
    if (!operation.operation_id) { setError('Secure operation IDs are unavailable in this browser.'); return; }
    pendingControlOperations.current.set(control.control_key, operation);
    const controller = new AbortController();
    controlController.current?.abort();
    controlController.current = controller;
    setSavingControl(control.control_key); setError('');
    try {
      const response = await fetch('/api/admin/video-operations', {
        method: 'PATCH', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(operation), signal: controller.signal,
      });
      const body = await response.json();
      if (token() !== access) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setData(null);
          pendingControlOperations.current.clear();
        } else if (response.status < 500) pendingControlOperations.current.delete(control.control_key);
        if (response.status === 409) await load();
        throw new Error(body.error || 'Pipeline switch update failed');
      }
      pendingControlOperations.current.delete(control.control_key);
      setControlReason((current) => ({ ...current, [control.control_key]: '' }));
      await load();
    } catch (cause) {
      if (cause.name !== 'AbortError' && token() === access) setError(cause.message || 'Pipeline switch update failed');
    }
    finally { if (token() === access) setSavingControl(''); }
  }, [controlReason, load, savingControl]);

  const snapshot = data?.snapshot;
  const totals = useMemo(() => {
    const ingestion = snapshot?.ingestion || [];
    const candidates = snapshot?.candidates || [];
    return {
      activeSources: sum(snapshot?.sources, 'active'),
      overdueSources: sum(snapshot?.sources, 'overdue'),
      candidates: sum(candidates, 'count'),
      published: sum(candidates.filter((row) => row.status === 'published'), 'count'),
      inserted: sum(ingestion, 'inserted'),
      duplicates: sum(ingestion, 'duplicates'),
      costCents: sum(snapshot?.nativeCosts, 'estimated_cost_cents'),
      sessions: Number(snapshot?.organicSessions || 0),
    };
  }, [snapshot]);

  const sourceRows = useMemo(() => {
    const grouped = new Map();
    for (const row of snapshot?.sources || []) {
      const value = grouped.get(row.topic) || { topic: row.topic, sources: 0, active: 0, overdue: 0, lifecycles: [] };
      value.sources += Number(row.sources || 0); value.active += Number(row.active || 0); value.overdue += Number(row.overdue || 0);
      value.lifecycles.push(`${row.lifecycle_status}: ${number(row.sources)}`); grouped.set(row.topic, value);
    }
    return [...grouped.values()];
  }, [snapshot]);

  const candidateRows = useMemo(() => {
    const grouped = new Map();
    for (const row of snapshot?.candidates || []) {
      const value = grouped.get(row.topic) || { topic: row.topic, statuses: {}, stale: 0, publishedInWindow: 0 };
      value.statuses[row.status] = Number(row.count || 0); value.stale += Number(row.stale || 0);
      value.publishedInWindow += Number(row.published_in_window || 0); grouped.set(row.topic, value);
    }
    return [...grouped.values()];
  }, [snapshot]);

  const runRows = useMemo(() => {
    const grouped = new Map();
    for (const row of snapshot?.ingestion || []) {
      const value = grouped.get(row.topic) || { topic: row.topic, runs: 0, candidates: 0, qualified: 0, inserted: 0, duplicates: 0, rejected: 0, quota: 0, failures: 0, failureClasses: {} };
      for (const key of ['runs', 'candidates', 'qualified', 'inserted', 'duplicates', 'rejected']) value[key] += Number(row[key] || 0);
      value.quota += Number(row.quota_units || 0);
      if (row.status === 'failed' || row.status === 'quota_stopped') value.failures += Number(row.runs || 0);
      const failureClass = ['quota', 'data_contract', 'source_unavailable', 'provider_transport', 'other'].includes(row.failure_class) ? row.failure_class : 'other';
      if (failureClass !== 'none') value.failureClasses[failureClass] = (value.failureClasses[failureClass] || 0) + Number(row.runs || 0);
      grouped.set(row.topic, value);
    }
    return [...grouped.values()];
  }, [snapshot]);

  const controls = snapshot?.controls || [];
  const controlHistory = snapshot?.controlHistory || [];
  const jobs = snapshot?.jobs || [];
  const delivery = snapshot?.delivery || [];
  const costs = snapshot?.nativeCosts || [];
  const quota = snapshot?.quota || [];
  const alerts = data?.alerts || [];

  return <>
    <Head><title>Video Operations | Smarter.Poker</title><meta name="robots" content="noindex,nofollow"/></Head>
    <UniversalHeader/>
    <main className="ops" aria-busy={busy}>
      <header className="hero">
        <div><small>VIDEO NETWORK / OPERATIONS</small><h1>Command Room</h1><p>Pipeline Health, Publishing Flow, Rights, Playback Quality, And Operating Cost.</p></div>
        <div className="toolbar"><label>Reporting Window<select value={windowHours} onChange={(event) => setWindowHours(Number(event.target.value))}>{windows.map((hours) => <option key={hours} value={hours}>{windowLabel(hours)}</option>)}</select></label><button onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh Snapshot'}</button></div>
      </header>
      <nav className="console-links" aria-label="Video Operations Tools">
        <a href="/hub/admin/video-sources">Sources</a><a href="/hub/admin/video-editorial">Editorial Queue</a><a href="/hub/admin/video-rights-moderation">Rights Moderation</a><a href="/hub/admin/video-native-studio">Native Studio</a>
      </nav>
      {error && <div className="error" role="alert">{error}</div>}
      {busy && !snapshot && <p className="state">Loading The Latest Operations Snapshot…</p>}
      {snapshot && <>
        <div className="stamp">Updated {new Date(snapshot.generatedAt).toLocaleString()} · Last {windowLabel(snapshot.windowHours)}</div>
        <section className="metrics" aria-label="Pipeline Summary">
          <Metric label="Active Sources" value={totals.activeSources} note={`${totals.overdueSources} overdue`} tone={totals.overdueSources ? 'amber' : 'mint'}/>
          <Metric label="Current Reel Candidates" value={totals.candidates} note={`${totals.published} published in the current queue`} />
          <Metric label="Assets Inserted" value={totals.inserted} note={`${totals.duplicates} duplicate attempts in window`} />
          <Metric label="Organic Study Sessions" value={totals.sessions} note="Automated and rejected events excluded" />
          <Metric label="Estimated Native Cost" value={`$${(totals.costCents / 100).toFixed(2)}`} note={`${sum(costs, 'renditions')} renditions in window`} tone="blue"/>
          <Metric label="Duplicate Public Rows" value={snapshot.duplicates?.duplicateRows || 0} note={`${number(snapshot.duplicates?.duplicateCanonicalKeys)} canonical keys`} tone={snapshot.duplicates?.duplicateRows ? 'red' : 'mint'}/>
        </section>

        <section className="panel alerts"><div className="section-title"><div><small>THRESHOLD MONITOR</small><h2>Alerts</h2></div><b className={alerts.length ? 'alert-count' : 'clear'}>{alerts.length ? `${alerts.length} active` : 'All clear'}</b></div>
          {alerts.length ? <div className="alert-list">{alerts.map((alert) => <article key={alert.key} className={alert.severity}><span>{alert.severity}</span><strong>{alert.message}</strong></article>)}</div> : <p className="quiet">No Configured Operational Thresholds Were Crossed In This Snapshot.</p>}
          <small>Alerts Use Complete Database Aggregates. Raw Source Errors, User Identifiers, Media IDs, And Provider Cursors Are Never Shown Here.</small>
        </section>

        <div className="columns">
          <section className="panel"><div className="section-title"><div><small>SUPPLY / INGESTION</small><h2>Sources And Run Funnel</h2></div></div>
            {sourceRows.length ? <div className="table-wrap"><table><thead><tr><th>Topic</th><th>Sources</th><th>Active</th><th>Overdue</th><th>Lifecycle</th></tr></thead><tbody>{sourceRows.map((row) => <tr key={row.topic}><td>{row.topic || 'Unassigned'}</td><td>{number(row.sources)}</td><td>{number(row.active)}</td><td>{number(row.overdue)}</td><td>{row.lifecycles.join(' · ')}</td></tr>)}</tbody></table></div> : <p className="quiet">No Registered Video Sources.</p>}
            {runRows.length ? <div className="table-wrap"><table><thead><tr><th>Topic</th><th>Runs</th><th>Found</th><th>Qualified</th><th>Inserted</th><th>Duplicate</th><th>Rejected</th><th>Failed</th><th>Failure Classes</th><th>Quota Units</th></tr></thead><tbody>{runRows.map((row) => <tr key={row.topic}><td>{row.topic}</td>{['runs','candidates','qualified','inserted','duplicates','rejected','failures'].map((key) => <td key={key}>{number(row[key])}</td>)}<td>{Object.entries(row.failureClasses).map(([name, count]) => `${name}: ${number(count)}`).join(' · ') || 'None'}</td><td>{number(row.quota)}</td></tr>)}</tbody></table></div> : <p className="quiet">No Ingestion Runs During This Window.</p>}
          </section>

          <section className="panel"><div className="section-title"><div><small>EDITORIAL / RIGHTS</small><h2>Candidate Queue</h2></div><a href="/hub/admin/video-editorial">Review Queue</a></div>
            {candidateRows.length ? <div className="table-wrap"><table><thead><tr><th>Topic</th><th>Generating</th><th>Proposed</th><th>Approved</th><th>Published</th><th>Published In Window</th><th>Rate Limited</th><th>Rejected</th><th>Stale</th></tr></thead><tbody>{candidateRows.map((row) => <tr key={row.topic}><td>{row.topic}</td><td>{number(row.statuses.generating)}</td><td>{number(row.statuses.proposed)}</td><td>{number(row.statuses.approved)}</td><td>{number(row.statuses.published)}</td><td>{number(row.publishedInWindow)}</td><td>{number(row.statuses.rate_limited)}</td><td>{number(row.statuses.rejected)}</td><td>{number(row.stale)}</td></tr>)}</tbody></table></div> : <p className="quiet">No Reel Candidates Are Queued.</p>}
            <div className="mini-grid"><article><span>Topic Mismatches</span><b className={snapshot.topicLeakCount ? 'red-text' : ''}>{number(snapshot.topicLeakCount)}</b></article><article><span>Pending Rights Cases</span><b>{number((snapshot.moderationCases || []).filter((row) => ['submitted','triaged','in_review'].includes(row.status)).reduce((n,row)=>n+Number(row.count||0),0))}</b></article><article><span>Expired Rights Evidence</span><b className={sum(snapshot.rightsEvidence, 'expired') ? 'red-text' : ''}>{number(sum(snapshot.rightsEvidence, 'expired'))}</b></article><article><span>Enrichment Dead Letters</span><b className={sum(jobs.filter((row)=>row.status==='dead_letter'),'count') ? 'red-text' : ''}>{number(sum(jobs.filter((row)=>row.status==='dead_letter'),'count'))}</b></article></div>
          </section>

          <section className="panel"><div className="section-title"><div><small>PLAYBACK / MOBILE</small><h2>Delivery Quality</h2></div></div>
            {delivery.length ? <div className="table-wrap"><table><thead><tr><th>Surface</th><th>Feed</th><th>Mode</th><th>Samples</th><th>Startup P95</th><th>Dropped / Decoded</th><th>Memory</th><th>Transfer</th><th>Battery</th></tr></thead><tbody>{delivery.map((row) => <tr key={`${row.surface}:${row.feed_mode}:${row.playback_type}`}><td>{row.surface}</td><td>{row.feed_mode}</td><td>{row.playback_type || 'unknown'}</td><td>{number(row.samples)}</td><td>{row.startup_ms_p95 == null ? 'N/A' : `${number(row.startup_ms_p95)} ms`}</td><td>{number(row.dropped_frames)} / {number(row.decoded_frames)}</td><td>{row.memory_mb_avg == null ? 'N/A' : `${row.memory_mb_avg} MB`}</td><td>{row.transferred_kb_avg == null ? 'N/A' : `${row.transferred_kb_avg} KB`}</td><td>{row.battery_level_avg == null ? 'N/A' : `${Math.round(row.battery_level_avg * 100)}%`}</td></tr>)}</tbody></table></div> : <p className="quiet">No Mobile Delivery Samples In This Window.</p>}
            <div className="data-saver">Data Saver Samples: <b>{number(sum(delivery,'data_saver_samples'))}</b></div>
          </section>

          <section className="panel"><div className="section-title"><div><small>GUARDS / RECOVERY</small><h2>Feature Flags And Jobs</h2></div></div>
            <div className="controls">{controls.map((control) => {
              const adjustable = adjustableControls.has(control.control_key);
              return <div className="control-row" key={control.control_key}><span>{control.control_key.replaceAll('_',' ')}</span><b className={control.enabled ? 'enabled' : 'disabled'}>{control.enabled ? 'Enabled' : 'Disabled'}</b>{adjustable ? <><input aria-label={`Reason for ${control.control_key}`} value={controlReason[control.control_key] || ''} maxLength={240} placeholder="Reason For Change" onChange={(event) => setControlReason((current) => ({ ...current, [control.control_key]: event.target.value }))}/><button onClick={() => changeControl(control)} disabled={!!savingControl || busy}>{savingControl === control.control_key ? 'Saving…' : control.enabled ? 'Pause Stage' : 'Resume Stage'}</button></> : <small>{control.control_key === 'youtube_native_transcode' ? 'Rights Cleared Service Path Only' : 'Not adjustable in this console'}</small>}</div>;
            })}</div>
            {jobs.length ? <div className="table-wrap"><table><thead><tr><th>Job</th><th>State</th><th>Count</th><th>Due</th></tr></thead><tbody>{jobs.map((row) => <tr key={`${row.job_type}:${row.status}`}><td>{row.job_type}</td><td>{row.status}</td><td>{number(row.count)}</td><td>{number(row.due)}</td></tr>)}</tbody></table></div> : <p className="quiet">No Enrichment Jobs Were Recorded.</p>}
            {controlHistory.length > 0 && <div className="table-wrap"><table><thead><tr><th>Switch History</th><th>Before</th><th>After</th><th>Reason</th><th>Changed</th></tr></thead><tbody>{controlHistory.map((event, index) => <tr key={`${event.control_key}:${event.created_at}:${index}`}><td>{event.control_key}</td><td>{event.enabled_before ? 'Enabled' : 'Disabled'}</td><td>{event.enabled_after ? 'Enabled' : 'Disabled'}</td><td>{event.reason}</td><td>{new Date(event.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
            <small>Switch Changes Require An Admin, The Current Version, A Reason, And An Audit Record. Native Transcode Remains Behind Its Separate Rights Cleared Service Path. Candidate And Enrichment Recovery Stays On The Existing Versioned Queues.</small>
          </section>

          <section className="panel"><div className="section-title"><div><small>DISCOVERY TO STUDY</small><h2>Learning Funnel</h2></div></div>
            {snapshot.learningFunnel?.length ? <div className="table-wrap"><table><thead><tr><th>Event</th><th>Discovery Source</th><th>Qualified Events</th><th>Sessions</th></tr></thead><tbody>{snapshot.learningFunnel.map((row) => <tr key={`${row.event_type}:${row.discovery_source}`}><td>{row.event_type}</td><td>{row.discovery_source}</td><td>{number(row.events)}</td><td>{number(row.organic_sessions)}</td></tr>)}</tbody></table></div> : <p className="quiet">No Organically Qualified Learning Events In This Window.</p>}
            <small>Only Organically Qualified Events With No Rejection Reason Are Included. This View Never Exposes Learner Or Media Identities.</small>
          </section>

          <section className="panel"><div className="section-title"><div><small>QUOTA / COST</small><h2>Usage And Cost</h2></div><a href="/hub/admin/video-sources">Manage Sources</a></div>
            {quota.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Used</th><th>Budget</th><th>Remaining</th></tr></thead><tbody>{quota.map((row) => <tr key={row.usage_date}><td>{row.usage_date}</td><td>{number(row.units_used)}</td><td>{number(row.daily_budget)}</td><td>{number(row.remaining)}</td></tr>)}</tbody></table></div> : <p className="quiet">No Quota Reservations In This Window.</p>}
            {costs.length ? <div className="table-wrap"><table><thead><tr><th>Rendition State</th><th>Count</th><th>Estimated Cost</th><th>Output</th></tr></thead><tbody>{costs.map((row) => <tr key={row.status}><td>{row.status}</td><td>{number(row.renditions)}</td><td>${(Number(row.estimated_cost_cents || 0) / 100).toFixed(2)}</td><td>{(Number(row.output_bytes || 0) / 1024 / 1024).toFixed(1)} MB</td></tr>)}</tbody></table></div> : <p className="quiet">No Native Renditions Were Created In This Window.</p>}
          </section>
        </div>
        <footer>Reporting Window Began {new Date(snapshot.windowStart).toLocaleString()}. Learning Counts Include Only Organically Qualified Events; Event, User, Session, And Content Identities Stay Private.</footer>
      </>}
    </main>
    <style jsx>{`
      :global(body){margin:0;background:#03090d;color:#e9f8ff}.ops{min-height:100vh;padding:16px 12px 64px;font-family:Inter,system-ui,sans-serif;background:radial-gradient(ellipse at 76% -8%,#16405a 0,transparent 34rem),radial-gradient(ellipse at 0 40%,#0b1d2a 0,transparent 40rem),#03090d}.hero,.console-links,.metrics,.panel,.stamp,.error,.state,footer{max-width:1440px;margin-left:auto;margin-right:auto}.hero{display:flex;justify-content:space-between;align-items:end;gap:22px;border:1px solid #347b9c;padding:22px;background:linear-gradient(130deg,#102f41,#071018 68%);box-shadow:inset 0 1px #c3f4ff33,0 22px 72px #000}.hero small,.section-title small{color:#5ddcff;letter-spacing:.2em;font-size:.68rem;font-weight:800}.hero h1{font-size:clamp(2.6rem,8vw,5.6rem);line-height:.86;letter-spacing:-.06em;text-transform:uppercase;margin:.5rem 0}.hero p{color:#9db4c0;margin-bottom:0}.toolbar{display:flex;align-items:end;gap:10px}.toolbar label{display:grid;gap:5px;color:#9db4c0;font-size:.7rem;text-transform:uppercase}.toolbar select,.toolbar button{border:1px solid #3483a4;background:linear-gradient(#174458,#08151e);color:#f2fbff;padding:10px 12px;font:inherit;font-weight:800}.console-links{display:flex;gap:8px;overflow:auto;padding:12px 0}.console-links a,.section-title>a{white-space:nowrap;color:#b7edff;border:1px solid #276783;background:#081923;padding:9px 12px;text-decoration:none;text-transform:uppercase;font-size:.73rem;font-weight:800}.stamp{color:#92a9b5;text-align:right;font-size:.76rem;padding:6px 0 12px}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric,.panel{border:1px solid #1f5873;background:linear-gradient(145deg,#0c202b,#061016);box-shadow:inset 0 1px #fff1,0 12px 30px #000}.metric{padding:14px;min-height:90px}.metric span,.metric small{display:block;color:#8ea8b5;text-transform:uppercase;font-size:.66rem;letter-spacing:.08em}.metric strong{display:block;color:#73f4ac;font-size:1.75rem;margin:5px 0}.metric small{font-size:.65rem;letter-spacing:0;text-transform:none}.metric.amber strong{color:#ffd16c}.metric.blue strong{color:#79d8ff}.metric.red strong{color:#ff7485}.panel{padding:14px;margin-top:12px;min-width:0}.section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.section-title h2{font-size:1.15rem;text-transform:uppercase;margin:.25rem 0 0;letter-spacing:.02em}.alert-count{color:#ff8895}.clear,.enabled{color:#73f4ac}.alerts{border-color:#387994}.alert-list{display:grid;gap:7px}.alert-list article{display:flex;gap:12px;align-items:center;border:1px solid #8a6524;background:#241907;padding:10px}.alert-list article.critical{border-color:#a53d4c;background:#260a10}.alert-list article span{font-size:.65rem;text-transform:uppercase;font-weight:900;color:#ffd16c}.alert-list article.critical span{color:#ff7185}.alert-list article strong{font-size:.82rem}.panel>small{display:block;color:#758f9d;margin-top:12px;font-size:.68rem}.quiet{color:#8ca5b2;font-size:.85rem}.columns{max-width:1440px;margin:auto;display:grid;gap:2px}.table-wrap{overflow-x:auto;margin:8px 0 14px}table{border-collapse:collapse;width:100%;min-width:590px;font-size:.74rem}th,td{text-align:left;border-bottom:1px solid #183d4d;padding:8px;white-space:nowrap}th{color:#84dfff;text-transform:uppercase;font-size:.62rem;letter-spacing:.06em}td{color:#d7e9f0}.mini-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.mini-grid article{border:1px solid #1a475b;background:#07151d;padding:10px}.mini-grid span,.controls span{display:block;color:#819ba8;font-size:.64rem;text-transform:uppercase}.mini-grid b{display:block;color:#8ef4ba;font-size:1.3rem;margin-top:4px}.red-text{color:#ff7185!important}.controls{display:grid;grid-template-columns:1fr 1fr;gap:7px}.control-row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:8px;padding:9px;border:1px solid #1a475b;background:#07151d}.control-row span{overflow-wrap:anywhere}.control-row b{font-size:.68rem;text-transform:uppercase;white-space:nowrap}.control-row input{grid-column:1/-1;min-width:0;border:1px solid #27556b;background:#030d13;color:#e9f8ff;padding:8px;font:inherit;font-size:.75rem}.control-row button{border:1px solid #287b9c;background:linear-gradient(#174458,#08151e);color:#f2fbff;padding:8px;font-size:.65rem;font-weight:800;text-transform:uppercase}.control-row button:disabled{opacity:.5}.control-row small{grid-column:1/-1;color:#879da8}.disabled{color:#ffd16c}.data-saver{border-top:1px solid #183d4d;padding-top:9px;color:#92a9b5;font-size:.75rem}.data-saver b{color:#8ef4ba}.error,.state{border:1px solid #9d4452;background:#280c12;padding:14px;margin-top:14px}.state{border-color:#1f5873;background:#081923}footer{color:#718b98;font-size:.7rem;padding-top:16px}.toolbar button:disabled{opacity:.6}.alert-list+.quiet{margin-top:12px}@media(min-width:720px){.ops{padding:24px}.metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.columns{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.panel{margin-top:10px;padding:18px}.hero{padding:30px}.mini-grid{grid-template-columns:repeat(4,1fr)}}@media(max-width:600px){.hero{align-items:stretch;flex-direction:column}.toolbar{justify-content:space-between}.toolbar label{flex:1}.toolbar select{width:100%}.hero h1{font-size:2.6rem}.stamp{text-align:left}.console-links{margin-left:-12px;margin-right:-12px;padding-left:12px;padding-right:12px}.controls{grid-template-columns:1fr}}
    `}</style>
  </>;
}
