/**
 * /hub/admin/daily-content — Daily Content Engine dashboard (Gate 3, I-1)
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows what the daily content worker produced for each slot (snapshot,
 * renders, per-destination post state), the destinations, jobs and the event
 * log, plus pause switches. Everything is a PRIVATE dry run until Gate 4.
 *
 * Client-rendered shell, same pattern as /hub/admin/diamond-liability: the page
 * renders immediately and calls /api/admin/daily-content with the Bearer token
 * from localStorage; that endpoint does the full admin check.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import consoleStyles from '../../../src/components/admin/OperatorAdminSurface.module.css';

const C = {
    bg: '#000000',
    panel: 'rgba(36, 37, 38, 0.95)',
    panelSoft: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#E4E6EB',
    dim: 'rgba(255, 255, 255, 0.6)',
    cyan: '#00D4FF',
    green: '#00ff88',
    gold: '#FFD700',
    red: '#ef4444',
};

const API = '/api/admin/daily-content';

const SLOTS = [
    { slot: 'today', time: '8:00 AM', title: 'Today On Smarter.Poker' },
    { slot: 'top10', time: '11:30 AM', title: 'Daily Arena Top 10' },
    { slot: 'feature', time: '3:00 PM', title: 'Feature Of The Day' },
    { slot: 'tonight', time: '5:30 PM', title: 'Tonight In The Arena' },
];
const DESTINATIONS = ['internal_feed', 'facebook', 'instagram', 'youtube'];
const DEST_LABEL = { internal_feed: 'Internal Feed', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube' };

const STATUS_COLOR = {
    rendered: C.green, published: C.green, done: C.green,
    building: C.cyan, queued: C.cyan, running: C.cyan, scheduled: C.cyan, authorized: C.cyan,
    held: C.gold, skipped: C.gold, expired: C.gold, uncertain: C.gold, superseded: C.dim, cancelled: C.dim,
    failed: C.red,
};

function readLocalAccessToken() {
    try {
        return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
    } catch (_e) {
        return null;
    }
}

const fmtTime = (iso) => {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (_e) {
        return iso;
    }
};
const fmtDate = (d) => {
    try {
        return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    } catch (_e) {
        return d;
    }
};
const fmtBytes = (n) => {
    const v = Number(n) || 0;
    if (v >= 1048576) return `${(v / 1048576).toFixed(1)} MB`;
    if (v >= 1024) return `${Math.round(v / 1024)} KB`;
    return `${v} B`;
};

function Panel({ title, subtitle, children, accent }) {
    return (
        <section
            className={consoleStyles.panel}
            style={{ background: C.panel, border: `1px solid ${accent || C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}
        >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{title}</h2>
            {subtitle ? <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{subtitle}</div> : null}
            <div style={{ marginTop: 14 }}>{children}</div>
        </section>
    );
}

function Badge({ value }) {
    const color = STATUS_COLOR[value] || C.dim;
    return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, border: `1px solid ${color}`, color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {value || 'none'}
        </span>
    );
}

function Message({ tone, title, children }) {
    const color = tone === 'error' ? C.red : C.gold;
    return (
        <div className={consoleStyles.state} role={tone === 'error' ? 'alert' : 'status'} style={{ border: `1px solid ${color}`, borderRadius: 12, padding: 20, marginTop: 24, background: C.panelSoft }}>
            <div style={{ fontWeight: 700, color, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 14, color: C.text }}>{children}</div>
        </div>
    );
}

function PauseRow({ scope, label, pause, busy, onToggle }) {
    const paused = pause ? pause.paused : false;
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
            <div>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                    {pause ? `${pause.reason || ''} (${pause.set_by}, ${fmtTime(pause.set_at)})` : 'Not Set'}
                </div>
            </div>
            <button
                type="button"
                disabled={busy}
                onClick={() => onToggle(scope, !paused)}
                style={{
                    minWidth: 110, minHeight: 40, borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 700,
                    border: `1px solid ${paused ? C.gold : C.green}`, background: 'transparent', color: paused ? C.gold : C.green,
                }}
                aria-label={`${paused ? 'Resume' : 'Pause'} ${label}`}
            >
                {paused ? 'Paused' : 'Running'}
            </button>
        </div>
    );
}

function RenderPreview({ r }) {
    if (!r.signedUrl) {
        return <div style={{ fontSize: 12, color: C.dim }}>{r.kind}: Preview Link Unavailable</div>;
    }
    const caption = `${r.kind} · ${r.width}x${r.height}${r.duration_s ? ` · ${Number(r.duration_s).toFixed(1)} s` : ''} · ${fmtBytes(r.bytes)} · ${String(r.sha256 || '').slice(0, 8)}`;
    return (
        <figure style={{ margin: 0 }}>
            {r.kind === 'video_9x16' ? (
                <video src={r.signedUrl} controls muted playsInline preload="metadata" style={{ width: '100%', maxWidth: 270, borderRadius: 8, background: '#000' }} />
            ) : (
                <img src={r.signedUrl} alt={`${r.kind} preview`} style={{ width: '100%', maxWidth: 270, borderRadius: 8 }} />
            )}
            <figcaption style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{caption}</figcaption>
        </figure>
    );
}

function EditionCard({ meta, edition }) {
    return (
        <div style={{ background: C.panelSoft, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 12, color: C.cyan, fontWeight: 700 }}>{meta.time}</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>{meta.title}</div>
            {!edition ? (
                <div style={{ fontSize: 13, color: C.dim, marginTop: 10 }}>No Edition</div>
            ) : (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Badge value={edition.status} />
                        {edition.dry_run ? <span style={{ fontSize: 11, color: C.gold }}>Dry Run</span> : null}
                        {edition.revision > 1 ? <span style={{ fontSize: 11, color: C.dim }}>Revision {edition.revision}</span> : null}
                    </div>
                    {edition.status_reason ? <div style={{ fontSize: 12, color: C.dim }}>{edition.status_reason}</div> : null}
                    {edition.headline ? <div style={{ fontSize: 14, fontWeight: 600 }}>{edition.headline}</div> : null}
                    {edition.caption ? <div style={{ fontSize: 12, color: C.text, whiteSpace: 'pre-wrap' }}>{edition.caption}</div> : null}
                    {edition.snapshot ? (
                        <div style={{ fontSize: 11, color: C.dim }}>
                            Snapshot {edition.snapshot.snapshot_key} r{edition.snapshot.revision} · {String(edition.snapshot.sha256 || '').slice(0, 8)} · {edition.snapshot.completeness}
                        </div>
                    ) : null}
                    <div style={{ fontSize: 11, color: C.dim }}>Slot {fmtTime(edition.slot_at)} · Expires {fmtTime(edition.expires_at)}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                        {(edition.renders || []).map((r) => <RenderPreview key={r.kind} r={r} />)}
                    </div>
                    <div>
                        {DESTINATIONS.map((d) => {
                            const p = (edition.posts || []).find((x) => x.destination === d);
                            return (
                                <div key={d} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}>
                                    <span style={{ color: C.dim }}>{DEST_LABEL[d]}</span>
                                    <span>
                                        {p ? <Badge value={p.state} /> : <span style={{ color: C.dim }}>No Post</span>}
                                        {p?.state_reason ? <span style={{ color: C.dim, marginLeft: 6 }}>{p.state_reason}</span> : null}
                                        {p?.remote_url ? <a href={p.remote_url} style={{ color: C.cyan, marginLeft: 6 }} target="_blank" rel="noreferrer">Live Link</a> : null}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DailyContentDashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [noToken, setNoToken] = useState(false);
    const [denied, setDenied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        const token = readLocalAccessToken();
        if (!token) {
            setNoToken(true);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}?days=7`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
            if (res.status === 401) { setNoToken(true); return; }
            if (res.status === 403) { setDenied(true); return; }
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json);
            setError(null);
        } catch (e) {
            setError(e?.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const togglePause = useCallback(async (scope, paused) => {
        const token = readLocalAccessToken();
        if (!token) { setNoToken(true); return; }
        setBusy(true);
        setNotice(null);
        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'set_pause', scope, paused, reason: paused ? 'Paused from dashboard' : 'Cleared from dashboard' }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setNotice(json?.error || `HTTP ${res.status}`);
            } else {
                await load();
            }
        } catch (e) {
            setNotice(e?.message || 'Request failed');
        } finally {
            setBusy(false);
        }
    }, [load]);

    const shell = (body) => (
        <>
            <Head>
                <title>Daily Content Engine | Admin | Smarter.Poker</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <main className={consoleStyles.surface} style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, -apple-system, sans-serif', padding: '0 12px' }}>
                <div style={{ maxWidth: 1180, margin: '0 auto', paddingBottom: 48 }}>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: '24px 0 4px' }}>Daily Content Engine</h1>
                    <div style={{ fontSize: 13, color: C.dim }}>Snapshots, Renders, Post States And Pause Switches</div>
                    {body}
                </div>
            </main>
        </>
    );

    if (noToken) {
        return shell(
            <Message tone="warn" title="Not Signed In">
                This Dashboard Requires An Admin Session.{' '}
                <a href="/auth/login?redirect=/hub/admin/daily-content" style={{ color: C.cyan }}>Sign In</a> And Reload.
            </Message>
        );
    }
    if (denied) {
        return shell(<Message tone="error" title="Forbidden - Admin Only">Your Account Is Not Flagged As An Admin.</Message>);
    }
    if (loading && !data) {
        return shell(<div className={consoleStyles.state} role="status" style={{ color: C.dim, padding: '64px 0', textAlign: 'center', fontSize: 14 }}>Loading Daily Content Engine...</div>);
    }
    if (error && !data) {
        return shell(<Message tone="error" title="Failed To Load">{error}</Message>);
    }
    if (!data) return shell(<div className={consoleStyles.state} role="status" style={{ color: C.dim }}>No Data.</div>);

    const pauseMap = new Map((data.pauses || []).map((p) => [p.scope, p]));
    const globalPaused = pauseMap.get('global')?.paused === true;
    const allDisabled = (data.destinations || []).every((d) => !d.enabled);
    const dates = [...new Set((data.editions || []).map((e) => e.edition_date))].sort().reverse();
    const latestEdition = (date, slot) => (data.editions || [])
        .filter((e) => e.edition_date === date && e.slot === slot)
        .sort((a, b) => b.revision - a.revision)[0] || null;

    return shell(
        <>
            {globalPaused || allDisabled ? (
                <div role="status" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, border: `1px solid ${C.gold}`, color: C.gold, fontWeight: 800, letterSpacing: 0.5 }}>
                    PRIVATE DRY RUN · Publishing Off (Gate 4 Not Approved)
                </div>
            ) : null}
            {notice ? <div role="alert" style={{ marginTop: 12, color: C.gold, fontSize: 13 }}>{notice}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12, color: C.dim }}>
                <span>Updated {fmtTime(data.generatedAt)} · Last {data.days} Days</span>
                <button type="button" onClick={load} style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.cyan}`, color: C.cyan, background: 'transparent', cursor: 'pointer' }}>Refresh</button>
            </div>

            <Panel title="Pause Switches" subtitle="Checked By The Worker Immediately Before Every Submit. Turning The Global Pause Off Requires Gate 4.">
                <PauseRow scope="global" label="Global" pause={pauseMap.get('global')} busy={busy} onToggle={togglePause} />
                {DESTINATIONS.map((d) => (
                    <PauseRow key={d} scope={`destination:${d}`} label={`Destination: ${DEST_LABEL[d]}`} pause={pauseMap.get(`destination:${d}`)} busy={busy} onToggle={togglePause} />
                ))}
                {SLOTS.map((s) => (
                    <PauseRow key={s.slot} scope={`series:${s.slot}`} label={`Series: ${s.title}`} pause={pauseMap.get(`series:${s.slot}`)} busy={busy} onToggle={togglePause} />
                ))}
            </Panel>

            <Panel title="Daily Slots" subtitle="Times Are America/Chicago. Newest Revision Of Each Slot Is Shown.">
                {dates.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No Editions Yet.</div> : null}
                {dates.map((date) => (
                    <div key={date} style={{ marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, color: C.cyan, margin: '0 0 10px' }}>{fmtDate(date)}</h3>
                        <div className={consoleStyles.responsiveGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                            {SLOTS.map((meta) => <EditionCard key={meta.slot} meta={meta} edition={latestEdition(date, meta.slot)} />)}
                        </div>
                    </div>
                ))}
            </Panel>

            <Panel title="Destinations">
                <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Destinations" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: C.dim }}>
                                <th style={{ padding: 6 }}>Destination</th><th style={{ padding: 6 }}>Enabled</th><th style={{ padding: 6 }}>Connection</th><th style={{ padding: 6 }}>Daily Cap</th><th style={{ padding: 6 }}>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.destinations || []).map((d) => (
                                <tr key={d.destination} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: 6 }}>{DEST_LABEL[d.destination] || d.destination}</td>
                                    <td style={{ padding: 6, color: d.enabled ? C.green : C.gold }}>{d.enabled ? 'Yes' : 'No'}</td>
                                    <td style={{ padding: 6 }}>{d.connection_state}</td>
                                    <td style={{ padding: 6 }}>{d.daily_cap}</td>
                                    <td style={{ padding: 6, color: C.dim }}>{d.notes || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <Panel title="Jobs">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    {Object.entries(data.jobs?.counts || {}).map(([state, n]) => (
                        <div key={state} className={consoleStyles.metric} style={{ background: C.panelSoft, borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ fontSize: 11, color: C.dim, textTransform: 'uppercase' }}>{state}</div>
                            <div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div>
                        </div>
                    ))}
                </div>
                <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Recent Jobs" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: C.dim }}>
                                <th style={{ padding: 6 }}>Job</th><th style={{ padding: 6 }}>State</th><th style={{ padding: 6 }}>Attempts</th><th style={{ padding: 6 }}>Updated</th><th style={{ padding: 6 }}>Last Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.jobs?.recent || []).map((j) => (
                                <tr key={j.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: 6 }}>{j.job_key}</td>
                                    <td style={{ padding: 6 }}><Badge value={j.state} /></td>
                                    <td style={{ padding: 6 }}>{j.attempts}/{j.max_attempts}</td>
                                    <td style={{ padding: 6 }}>{fmtTime(j.updated_at)}</td>
                                    <td style={{ padding: 6, color: j.last_error ? C.red : C.dim }}>{j.last_error || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <Panel title="Event Log" subtitle="Last 50 Events">
                <div className={consoleStyles.tableWell} tabIndex={0} role="region" aria-label="Event Log" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                            {(data.events || []).map((e) => (
                                <tr key={e.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{fmtTime(e.at)}</td>
                                    <td style={{ padding: 6 }}>{e.actor}</td>
                                    <td style={{ padding: 6 }}>{e.entity}{e.entity_id ? ` ${e.entity_id}` : ''}</td>
                                    <td style={{ padding: 6, fontWeight: 600 }}>{e.event}</td>
                                    <td style={{ padding: 6, color: C.dim }}>{e.detail?.reason || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
            {error ? <div className={consoleStyles.state} role="alert" style={{ fontSize: 12, color: '#ff7a7a', marginTop: 8 }}>Last Refresh Failed: {error}</div> : null}
        </>
    );
}
