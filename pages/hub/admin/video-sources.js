import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });

const COLORS = { bg: '#02070d', panel: '#071520', edge: '#1e6687', cyan: '#31d7ff',
  text: '#eaf8ff', dim: '#8fa9b7', green: '#55f5a2', gold: '#ffc857', red: '#ff647c' };

function token() {
  try { return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null; }
  catch (_error) { return null; }
}

function age(value) {
  if (!value) return 'Never';
  const hours = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function Metric({ label, value, tone = 'cyan' }) {
  return <div className="metric"><span>{label}</span><strong style={{ color: COLORS[tone] }}>{value}</strong></div>;
}

function SourceCard({ source, onPatch }) {
  const unhealthy = source.consecutive_failures > 0 || source.lifecycle_status === 'quarantined';
  return <article className="source-card">
    <div className="source-head">
      <div><small>{source.ingest_topic.replace('_', ' ')}</small><h2>{source.name}</h2></div>
      <span className={`status ${unhealthy ? 'bad' : source.lifecycle_status}`}>{source.lifecycle_status}</span>
    </div>
    <div className="source-grid">
      <div><span>Stable Channel</span><b>{source.provider_source_id || 'Resolving On Next Run'}</b></div>
      <div><span>Last Success</span><b>{age(source.last_success_at)}</b></div>
      <div><span>Latest Yield</span><b>{source.last_qualified_count} Qualified</b></div>
      <div><span>Cadence</span><b>{source.cadence_minutes} Min</b></div>
    </div>
    {source.last_failure_code && <p className="failure">{source.last_failure_code}</p>}
    <div className="actions">
      {source.lifecycle_status === 'active'
        ? <button onClick={() => onPatch(source, { lifecycle_status: 'paused' })}>Pause Source</button>
        : <button onClick={() => onPatch(source, { lifecycle_status: 'active' })}>Activate Source</button>}
      <select aria-label={`Cadence for ${source.name}`} value={source.cadence_minutes}
        onChange={(event) => onPatch(source, { cadence_minutes: Number(event.target.value) })}>
        <option value="180">Every 3 Hours</option><option value="360">Every 6 Hours</option>
        <option value="720">Every 12 Hours</option><option value="1440">Daily</option>
      </select>
      <a href={source.attribution_url || '#'} target="_blank" rel="noreferrer">Open Channel</a>
    </div>
  </article>;
}

export default function VideoSourceOperations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [topic, setTopic] = useState('all');
  const [draft, setDraft] = useState({ name: '', handle: '', ingest_topic: 'poker' });

  const load = useCallback(async () => {
    setBusy(true); setError('');
    const access = token();
    if (!access) { setError('Sign in with an admin account to manage sources.'); setBusy(false); return; }
    try {
      const response = await fetch('/api/admin/video-sources', { headers: { Authorization: `Bearer ${access}` } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setData(body);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchSource = useCallback(async (source, changes) => {
    const access = token();
    if (!access) return;
    setError('');
    const response = await fetch('/api/admin/video-sources', {
      method: 'PATCH', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: source.id, ...changes }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Source update failed'); return; }
    setData((current) => ({ ...current, sources: current.sources.map((item) => item.id === source.id ? body.source : item) }));
  }, []);

  const createSource = useCallback(async (event) => {
    event.preventDefault();
    const access = token();
    if (!access) return;
    setError('');
    const response = await fetch('/api/admin/video-sources', {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, ingestion_mode: 'creator_uploads', lifecycle_status: 'active',
        cadence_minutes: 720, max_candidates_per_run: 75, expected_daily_candidates: 8,
        attribution_url: `https://www.youtube.com/${draft.handle}` }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || 'Source creation failed'); return; }
    setData((current) => ({ ...current, sources: [...current.sources, body.source] }));
    setDraft({ name: '', handle: '', ingest_topic: 'poker' });
  }, [draft]);

  const sources = useMemo(() => (data?.sources || []).filter((source) => topic === 'all' || source.ingest_topic === topic), [data, topic]);
  const todayQuota = data?.quota?.[0];

  return <>
    <Head><title>Video Supply Console | Smarter.Poker</title><meta name="robots" content="noindex,nofollow" /></Head>
    <UniversalHeader />
    <main className="page">
      <header className="hero">
        <div><small>CONTENT OPERATIONS / PHASE 3</small><h1>Video Supply Console</h1>
          <p>Stable Channels, Incremental Cursors, Source Health, And Provider Quota In One Command Surface.</p></div>
        <button className="refresh" onClick={load} disabled={busy}>{busy ? 'Checking...' : 'Refresh telemetry'}</button>
      </header>
      {error && <div className="error" role="alert">{error}</div>}
      {data && <>
        <section className="metrics">
          <Metric label="Active sources" value={data.summary.active} tone="green" />
          <Metric label="Daily capacity" value={`${data.summary.configuredDailyCapacity} / ${data.summary.capacityTarget}`} />
          <Metric label="Needs attention" value={data.summary.unhealthy} tone={data.summary.unhealthy ? 'gold' : 'green'} />
          <Metric label="YouTube quota" value={todayQuota ? `${todayQuota.units_used} / ${todayQuota.daily_budget}` : 'No use today'} />
        </section>
        <nav className="rail" aria-label="Source topic filter">
          {[['all','All sources'],['poker','Poker'],['casino_slots','Casino and slots'],['sports','Sports']].map(([value,label]) =>
            <button key={value} className={topic === value ? 'active' : ''} onClick={() => setTopic(value)}>{label}</button>)}
        </nav>
        <form className="add-source" onSubmit={createSource}>
          <strong>Add Verified Channel</strong>
          <input required aria-label="Channel Name" placeholder="Channel Name" value={draft.name}
            onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
          <input required aria-label="YouTube handle" placeholder="@YouTubeHandle" value={draft.handle}
            onChange={(event) => setDraft((value) => ({ ...value, handle: event.target.value }))} />
          <select aria-label="Channel topic" value={draft.ingest_topic}
            onChange={(event) => setDraft((value) => ({ ...value, ingest_topic: event.target.value }))}>
            <option value="poker">Poker</option><option value="casino_slots">Casino And Slots</option><option value="sports">Sports</option>
          </select>
          <button type="submit">Add Source</button>
        </form>
        <section className="source-list" aria-live="polite">
          {sources.map((source) => <SourceCard key={source.id} source={source} onPatch={patchSource} />)}
        </section>
        <section className="runs"><h2>Latest Ingestion Operations</h2>
          {(data.recentRuns || []).slice(0, 12).map((run) => <div key={run.operation_id} className="run">
            <span className={`dot ${run.status}`} /><b>{run.source_name}</b><span>{run.status}</span>
            <span>{run.qualified} Qualified / {run.inserted} New</span><time>{age(run.completed_at || run.started_at)}</time>
          </div>)}
        </section>
      </>}
    </main>
    <style jsx>{`
      :global(body){margin:0;background:${COLORS.bg};color:${COLORS.text}}
      .page{min-height:100vh;padding:18px 14px 80px;font-family:Inter,system-ui,sans-serif;background:radial-gradient(circle at 80% 0,rgba(30,102,135,.22),transparent 32rem),${COLORS.bg}}
      .hero{max-width:1180px;margin:auto;border:1px solid ${COLORS.edge};background:linear-gradient(135deg,rgba(10,34,50,.96),rgba(2,9,15,.98));box-shadow:inset 0 1px rgba(164,230,255,.25),0 20px 60px #000;padding:22px;display:flex;flex-direction:column;gap:18px}
      small{color:${COLORS.cyan};letter-spacing:.18em;text-transform:uppercase} h1{font-size:clamp(2rem,8vw,4.6rem);margin:.2rem 0;line-height:.95;text-transform:uppercase} p{color:${COLORS.dim};max-width:680px}
      button,.actions a{border:1px solid ${COLORS.edge};background:linear-gradient(#15384a,#07131b);color:${COLORS.text};padding:11px 14px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;cursor:pointer;text-decoration:none}
      .refresh{align-self:flex-start}.error{max-width:1136px;margin:14px auto;border:1px solid ${COLORS.red};padding:14px;color:#ffd8df;background:#260811}
      .metrics{max-width:1180px;margin:14px auto;display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.metric{border:1px solid #17445a;background:${COLORS.panel};padding:14px}.metric span{display:block;color:${COLORS.dim};font-size:.72rem;text-transform:uppercase}.metric strong{font-size:1.35rem}
      .rail{max-width:1180px;margin:20px auto 12px;display:flex;overflow-x:auto;gap:8px;padding-bottom:7px}.rail button{white-space:nowrap}.rail .active{border-color:${COLORS.cyan};color:${COLORS.cyan};box-shadow:inset 0 -2px ${COLORS.cyan}}
      .add-source{max-width:1150px;margin:0 auto 12px;border:1px solid #17445a;background:${COLORS.panel};padding:14px;display:grid;gap:8px}.add-source strong{text-transform:uppercase;color:${COLORS.cyan}}input,select{min-width:0;border:1px solid #24566c;background:#041018;color:${COLORS.text};padding:10px}
      .source-list{max-width:1180px;margin:auto;display:grid;gap:10px}.source-card{border:1px solid #17445a;background:linear-gradient(145deg,#0a1c27,#050d13);padding:16px;box-shadow:inset 0 1px rgba(255,255,255,.08)}.source-head{display:flex;justify-content:space-between;gap:12px}.source-head h2{margin:4px 0 14px;font-size:1.15rem}.status{height:max-content;padding:4px 7px;border:1px solid ${COLORS.green};color:${COLORS.green};font-size:.68rem;text-transform:uppercase}.status.paused,.status.bad{border-color:${COLORS.gold};color:${COLORS.gold}}.status.retired{border-color:${COLORS.red};color:${COLORS.red}}
      .source-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.source-grid span{display:block;color:${COLORS.dim};font-size:.68rem;text-transform:uppercase}.source-grid b{font-size:.82rem;word-break:break-word}.failure{color:${COLORS.gold};font-family:ui-monospace,monospace;font-size:.75rem}.actions{display:flex;gap:8px;margin-top:15px;flex-wrap:wrap}.actions a{font-size:.75rem}
      .runs{max-width:1180px;margin:26px auto;border:1px solid #17445a;background:${COLORS.panel};padding:16px}.runs h2{text-transform:uppercase;font-size:1rem}.run{display:grid;grid-template-columns:10px 1.4fr 1fr 1.5fr auto;gap:8px;align-items:center;border-top:1px solid #143242;padding:10px 0;font-size:.75rem;color:${COLORS.dim}}.run b{color:${COLORS.text}}.dot{width:7px;height:7px;border-radius:50%;background:${COLORS.gold}}.dot.succeeded,.dot.empty{background:${COLORS.green}}.dot.failed{background:${COLORS.red}}
      @media(min-width:760px){.page{padding:30px}.hero{padding:36px;flex-direction:row;justify-content:space-between;align-items:end}.metrics{grid-template-columns:repeat(4,1fr)}.add-source{grid-template-columns:1fr 1.2fr 1fr 1fr auto;align-items:center}.source-list{grid-template-columns:repeat(2,1fr)}}
      @media(min-width:1180px){.source-list{grid-template-columns:repeat(3,1fr)}}
    `}</style>
  </>;
}
