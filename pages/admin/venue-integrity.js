import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../../styles/VenueIntegrityConsole.module.css';

export async function getServerSideProps() {
  // A fixture-backed render path for local visual regression. It is impossible
  // to enable in production and never bypasses the API's real admin/MFA gate.
  if (process.env.NODE_ENV === 'development' && process.env.PNM_INTEGRITY_PREVIEW === '1') {
    const [{ default: snapshot }, { buildVenueIntegrityQueue }] = await Promise.all([
      import('../../data/all-venues.json'),
      import('../../src/lib/poker-near-me/venueIntegrityOperations'),
    ]);
    const queue = buildVenueIntegrityQueue(snapshot.venues || []);
    return {
      props: {
        previewQueue: {
          summary: queue.summary,
          issues: queue.issues,
          recentCorrections: [],
          generatedAt: new Date().toISOString(),
        },
      },
    };
  }
  return { props: { previewQueue: null } };
}

const FILTERS = [
  ['all', 'All signals'],
  ['conflict', 'Held'],
  ['missing', 'Missing'],
  ['duplicate', 'Duplicates'],
  ['unverified', 'Boundary pending'],
];

function readAccessToken() {
  try {
    return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
  } catch (_error) {
    return null;
  }
}

function issueLabel(type) {
  return ({ conflict: 'Held', missing: 'Missing', duplicate: 'Duplicate', unverified: 'Boundary pending' })[type] || type;
}

function formatAge(value) {
  if (!value) return 'revision unavailable';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'updated just now';
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `updated ${hours}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}

function formFromIssue(issue) {
  return {
    address: issue?.address || '',
    city: issue?.city || '',
    state: issue?.state || '',
    latitude: issue?.latitude ?? '',
    longitude: issue?.longitude ?? '',
    reason: '',
  };
}

export default function VenueIntegrityConsole({ previewQueue = null }) {
  const [state, setState] = useState(previewQueue
    ? { loading: false, error: '', ...previewQueue }
    : { loading: true, error: '', summary: null, issues: [], recentCorrections: [], generatedAt: null });
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(formFromIssue(null));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadQueue = useCallback(async ({ preserveSelection = false } = {}) => {
    const token = readAccessToken();
    if (!token) {
      window.location.replace(`/auth/login?redirect=${encodeURIComponent('/admin/venue-integrity')}`);
      return;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/admin/venue-integrity?pageSize=200', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.replace(`/auth/login?redirect=${encodeURIComponent('/admin/venue-integrity')}`);
        return;
      }
      if (!response.ok) throw new Error(payload.error || `Queue request failed (${response.status})`);
      setState({
        loading: false,
        error: '',
        summary: payload.summary,
        issues: payload.issues || [],
        recentCorrections: payload.recent_corrections || [],
        generatedAt: payload.generated_at,
      });
      if (!preserveSelection) {
        setSelected(null);
        setForm(formFromIssue(null));
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || 'Unable to load venue integrity queue' }));
    }
  }, []);

  useEffect(() => { if (!previewQueue) loadQueue(); }, [loadQueue, previewQueue]);

  const visibleIssues = useMemo(() => {
    const term = search.trim().toLowerCase();
    return state.issues.filter((issue) => {
      if (status !== 'all' && issue.issue_type !== status) return false;
      if (!term) return true;
      return [issue.id, issue.name, issue.address, issue.city, issue.state]
        .some((value) => String(value ?? '').toLowerCase().includes(term));
    });
  }, [search, state.issues, status]);

  function selectIssue(issue) {
    setSelected(issue);
    setForm(formFromIssue(issue));
    setNotice('');
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!selected || selected.issue_type === 'duplicate') return;
    const token = readAccessToken();
    if (!token) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/venue-integrity', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: selected.id,
          expected_updated_at: selected.updated_at,
          ...form,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.requiresMfa) throw new Error('MFA verification is required before venue data can be changed. Complete the admin challenge, then retry.');
        throw new Error(payload.error || `Correction failed (${response.status})`);
      }
      setNotice(`${selected.name} is now ${payload.location_quality?.status || 'verified'} and eligible for the next directory refresh.`);
      await loadQueue();
    } catch (error) {
      setNotice(error?.message || 'Correction could not be applied');
    } finally {
      setSaving(false);
    }
  }

  const summary = state.summary || { input: 0, actionable: 0, conflict: 0, missing: 0, duplicate: 0, unverified: 0 };
  const isDuplicate = selected?.issue_type === 'duplicate';

  return (
    <>
      <Head>
        <title>Venue Signal Operations | Smarter.Poker</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroImage} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroContent}>
            <a className={styles.eyebrow} href="/hub/poker-near-me/map">Poker Near Me / Signal Control</a>
            <div className={styles.heroCopy}>
              <div>
                <h1>Venue integrity operations</h1>
                <p>Quarantined map signals, missing coordinates and duplicate identities—resolved through one auditable control surface.</p>
              </div>
              <div className={styles.livePlate} data-queue-health={summary.actionable ? 'attention' : 'clear'}>
                <span className={styles.liveDot} />
                <div><strong>{summary.actionable}</strong><small>signals require attention</small></div>
              </div>
            </div>
          </div>
        </header>

        <section className={styles.console}>
          <div className={styles.metricRail} aria-label="Venue integrity summary">
            <div><small>Active registry</small><strong>{summary.input}</strong><span>source records</span></div>
            <div className={styles.critical}><small>Held from map</small><strong>{summary.conflict}</strong><span>state conflicts</span></div>
            <div><small>Coordinates missing</small><strong>{summary.missing}</strong><span>cannot be mapped</span></div>
            <div><small>Duplicate rows</small><strong>{summary.duplicate}</strong><span>{summary.duplicate_groups || 0} identity groups</span></div>
            <div><small>Coverage pending</small><strong>{summary.unverified}</strong><span>boundary unavailable</span></div>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.segmented} role="group" aria-label="Filter integrity issues">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" className={status === value ? styles.activeSegment : ''} onClick={() => setStatus(value)}>
                  {label}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <span>Search</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Venue, city, state or ID" />
            </label>
            <button type="button" className={styles.refresh} onClick={() => loadQueue()} disabled={state.loading}>Refresh signal</button>
          </div>

          {state.error && <div className={styles.error} role="alert">{state.error}</div>}
          {notice && <div className={styles.notice} role="status">{notice}</div>}

          <div className={styles.workspace}>
            <section className={styles.queue} aria-label="Venue remediation queue">
              <div className={styles.panelHeader}>
                <div><span>Operational queue</span><strong>{visibleIssues.length} visible</strong></div>
                <small>{state.generatedAt ? `Assessed ${formatAge(state.generatedAt).replace('updated ', '')}` : 'Live assessment'}</small>
              </div>
              <div className={styles.queueList}>
                {state.loading && <div className={styles.empty}>Scanning venue boundaries and identity keys…</div>}
                {!state.loading && visibleIssues.length === 0 && (
                  <div className={styles.empty}><strong>Signal path clear</strong><span>No records match this queue view.</span></div>
                )}
                {!state.loading && visibleIssues.map((issue) => (
                  <button
                    type="button"
                    key={`${issue.issue_type}-${issue.id}`}
                    className={`${styles.issue} ${selected?.id === issue.id ? styles.selectedIssue : ''}`}
                    onClick={() => selectIssue(issue)}
                    aria-pressed={selected?.id === issue.id}
                  >
                    <span className={`${styles.issueCode} ${styles[issue.issue_type]}`}>{issueLabel(issue.issue_type)}</span>
                    <span className={styles.issueIdentity}>
                      <strong>{issue.name}</strong>
                      <small>{issue.city || 'Unknown city'}, {issue.state || '—'} · ID {issue.id}</small>
                    </span>
                    <span className={styles.issueSignal}>
                      <strong>{issue.latitude ?? '—'}</strong>
                      <small>{issue.longitude ?? '—'}</small>
                    </span>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            </section>

            <aside className={styles.repair} aria-label="Correction workspace">
              <div className={styles.panelHeader}>
                <div><span>Correction bay</span><strong>{selected ? `Venue ${selected.id}` : 'Standby'}</strong></div>
                <small>{selected ? formatAge(selected.updated_at) : 'Select a signal'}</small>
              </div>
              {!selected && (
                <div className={styles.repairStandby}>
                  <span aria-hidden="true">⌖</span>
                  <strong>Select a queue record</strong>
                  <p>Inspect its source coordinates, then apply a boundary-verified correction with a permanent audit reason.</p>
                </div>
              )}
              {selected && isDuplicate && (
                <div className={styles.duplicatePanel}>
                  <span className={styles.issueCode}>Identity merge</span>
                  <h2>{selected.name}</h2>
                  <p>This row shares its normalized venue identity with {selected.related_ids.length} other source record(s). Duplicate retirement requires a source-level merge so schedules, claims and reviews are not orphaned.</p>
                  <div className={styles.related}>Related IDs: {selected.related_ids.join(', ') || 'none reported'}</div>
                  <a href={`/hub/venues/${selected.id}`} target="_blank" rel="noreferrer">Inspect public venue ↗</a>
                </div>
              )}
              {selected && !isDuplicate && (
                <form className={styles.form} onSubmit={submitCorrection}>
                  <div className={styles.formTitle}>
                    <div><span className={`${styles.issueCode} ${styles[selected.issue_type]}`}>{issueLabel(selected.issue_type)}</span><h2>{selected.name}</h2></div>
                    <a href={`/hub/venues/${selected.id}`} target="_blank" rel="noreferrer">Public record ↗</a>
                  </div>
                  <label><span>Street address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="street-address" /></label>
                  <div className={styles.formRow}>
                    <label><span>City</span><input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                    <label className={styles.stateField}><span>State</span><input required maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} /></label>
                  </div>
                  <div className={styles.formRow}>
                    <label><span>Latitude</span><input required inputMode="decimal" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
                    <label><span>Longitude</span><input required inputMode="decimal" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
                  </div>
                  <label><span>Audit reason</span><textarea required minLength={12} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Source checked and reason for correction…" /></label>
                  <div className={styles.safetyNote}><span>Atomic write</span> The venue revision is checked again before coordinates change. Every correction stores before/after evidence and the acting admin.</div>
                  <button className={styles.commit} type="submit" disabled={saving || form.reason.trim().length < 12 || !selected.updated_at}>
                    {saving ? 'Verifying and applying…' : 'Verify boundary & commit'}
                  </button>
                </form>
              )}
            </aside>
          </div>

          <section className={styles.history} aria-label="Recent venue integrity corrections">
            <div className={styles.panelHeader}>
              <div><span>Immutable audit trail</span><strong>Recent verified corrections</strong></div>
              <small>{state.recentCorrections.length} retained in view</small>
            </div>
            <div className={styles.historyList}>
              {state.recentCorrections.length === 0 && <div className={styles.historyEmpty}>No operator corrections have been recorded yet.</div>}
              {state.recentCorrections.map((correction) => (
                <article key={correction.id} className={styles.historyItem}>
                  <span className={styles.historyStatus}>{correction.integrity_status}</span>
                  <div><strong>Venue {correction.venue_id}</strong><p>{correction.reason}</p></div>
                  <time dateTime={correction.created_at}>{formatAge(correction.created_at)}</time>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>
    </>
  );
}
