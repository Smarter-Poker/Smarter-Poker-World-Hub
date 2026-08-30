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
    const previewRevision = new Date().toISOString();
    const queue = buildVenueIntegrityQueue((snapshot.venues || []).map((venue) => ({
      ...venue,
      location_integrity_revision: previewRevision,
    })));
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
  ['incomplete', 'Incomplete'],
  ['stale', 'Stale sources'],
];

function readAccessToken() {
  try {
    return JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null')?.access_token || null;
  } catch (_error) {
    return null;
  }
}

function issueLabel(type) {
  return ({ conflict: 'Held', missing: 'Missing', duplicate: 'Duplicate', unverified: 'Boundary pending', incomplete: 'Incomplete', stale: 'Stale source' })[type] || type;
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
    phone: issue?.phone || '',
    website: issue?.website || '',
    profile_photo_url: issue?.profile_photo_url || '',
    cover_photo_url: issue?.cover_photo_url || '',
    logo_url: issue?.logo_url || '',
    source_url: '',
    confidence: '0.85',
    canonical_venue_id: issue?.related_ids?.[0] || '',
    reason: '',
  };
}

export default function VenueIntegrityConsole({ previewQueue = null }) {
  const [state, setState] = useState(previewQueue
    ? { loading: false, error: '', ...previewQueue }
    : { loading: true, error: '', summary: null, issues: [], recentCorrections: [], recentEnrichments: [], recentRetirements: [], pagination: null, generatedAt: null });
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(formFromIssue(null));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadQueue = useCallback(async ({ preserveSelection = false, page = 1 } = {}) => {
    const token = readAccessToken();
    if (!token) {
      window.location.replace(`/auth/login?redirect=${encodeURIComponent('/admin/venue-integrity')}`);
      return;
    }
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const params = new URLSearchParams({ pageSize: '100', page: String(page), status });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/admin/venue-integrity?${params}`, {
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
        recentEnrichments: payload.recent_enrichments || [],
        recentRetirements: payload.recent_retirements || [],
        pagination: payload.pagination || null,
        generatedAt: payload.generated_at,
      });
      if (!preserveSelection) {
        setSelected(null);
        setForm(formFromIssue(null));
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || 'Unable to load venue integrity queue' }));
    }
  }, [search, status]);

  useEffect(() => {
    if (previewQueue) return undefined;
    const timer = setTimeout(() => loadQueue(), 250);
    return () => clearTimeout(timer);
  }, [loadQueue, previewQueue]);

  const visibleIssues = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!previewQueue) return state.issues;
    return state.issues.filter((issue) => {
      if (status !== 'all' && !(issue.issue_types || [issue.issue_type]).includes(status)) return false;
      if (!term) return true;
      return [issue.id, issue.name, issue.address, issue.city, issue.state].some((value) => String(value ?? '').toLowerCase().includes(term));
    });
  }, [previewQueue, search, state.issues, status]);

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
          expected_revision: selected.revision,
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

  async function submitEnrichment(event) {
    event.preventDefault();
    if (!selected) return;
    const token = readAccessToken();
    if (!token) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/venue-integrity', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: selected.id, expected_revision: selected.revision, ...form }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.requiresMfa) throw new Error('MFA enrollment and verification are required before source-backed venue data can be changed.');
        throw new Error(payload.error || `Enrichment failed (${response.status})`);
      }
      setNotice(`${selected.name} enrichment was applied and recorded with source evidence.`);
      await loadQueue();
    } catch (error) {
      setNotice(error?.message || 'Enrichment could not be applied');
    } finally {
      setSaving(false);
    }
  }

  async function retireDuplicate() {
    if (!selected) return;
    const token = readAccessToken();
    if (!token) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/venue-integrity', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'retire_duplicate', id: selected.id,
          canonical_venue_id: form.canonical_venue_id,
          expected_revision: selected.revision, reason: form.reason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.requiresMfa) throw new Error('MFA enrollment and verification are required before a duplicate can be retired.');
        throw new Error(payload.error || `Duplicate retirement failed (${response.status})`);
      }
      setNotice(`Venue ${selected.id} now permanently redirects to canonical venue ${form.canonical_venue_id}.`);
      await loadQueue();
    } catch (error) {
      setNotice(error?.message || 'Duplicate retirement could not be applied');
    } finally {
      setSaving(false);
    }
  }

  async function refreshIndex() {
    const token = readAccessToken();
    if (!token) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/venue-integrity', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'refresh' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.requiresMfa) throw new Error('MFA enrollment and verification are required before the registry can be rescanned.');
        throw new Error(payload.error || `Registry refresh failed (${response.status})`);
      }
      setNotice(`${payload.refreshed || 0} venue signals were re-indexed.`);
      await loadQueue();
    } catch (error) {
      setNotice(error?.message || 'Registry refresh could not be completed');
    } finally {
      setSaving(false);
    }
  }

  const summary = state.summary || { input: 0, actionable: 0, conflict: 0, missing: 0, duplicate: 0, unverified: 0, incomplete: 0, stale: 0 };
  const isDuplicate = selected?.issue_type === 'duplicate';
  const needsLocation = !!selected?.issue_types?.some((type) => ['conflict', 'missing', 'unverified'].includes(type));
  const needsEnrichment = !!selected?.issue_types?.some((type) => ['incomplete', 'stale'].includes(type));
  const recentEnrichments = state.recentEnrichments || [];
  const recentRetirements = state.recentRetirements || [];

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
            <div><small>Profiles incomplete</small><strong>{summary.incomplete}</strong><span>missing directory fields</span></div>
            <div><small>Sources stale</small><strong>{summary.stale}</strong><span>older than 30 days</span></div>
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
            <button type="button" className={styles.refresh} onClick={() => loadQueue({ preserveSelection: true })} disabled={state.loading}>Reload queue</button>
            {!previewQueue && <button type="button" className={styles.refresh} onClick={refreshIndex} disabled={saving}>Rescan registry</button>}
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
                      <small>{(issue.issue_types || [issue.issue_type]).map(issueLabel).join(' · ')}{issue.missing_fields?.length ? ` · Missing ${issue.missing_fields.join(', ')}` : ''}</small>
                    </span>
                    <span className={styles.issueSignal}>
                      <strong>{issue.latitude ?? '—'}</strong>
                      <small>{issue.longitude ?? '—'}</small>
                    </span>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
              {state.pagination?.pages > 1 && (
                <div className={styles.toolbar} aria-label="Queue pagination">
                  <button type="button" className={styles.refresh} disabled={state.loading || state.pagination.page <= 1} onClick={() => loadQueue({ page: state.pagination.page - 1 })}>Previous</button>
                  <span>Page {state.pagination.page} of {state.pagination.pages} · {state.pagination.total} records</span>
                  <button type="button" className={styles.refresh} disabled={state.loading || state.pagination.page >= state.pagination.pages} onClick={() => loadQueue({ page: state.pagination.page + 1 })}>Next</button>
                </div>
              )}
            </section>

            <aside className={styles.repair} aria-label="Correction workspace">
              <div className={styles.panelHeader}>
                <div><span>Correction bay</span><strong>{selected ? `Venue ${selected.id}` : 'Standby'}</strong></div>
                <small>{selected ? formatAge(selected.revision) : 'Select a signal'}</small>
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
                  <p>This row shares its normalized identity with {selected.related_ids.length} source record(s). Retirement preserves every referenced schedule, claim and review, suppresses this alias, and installs a permanent canonical redirect.</p>
                  <div className={styles.related}>Related IDs: {selected.related_ids.join(', ') || 'none reported'}</div>
                  <label><span>Canonical venue ID</span><input inputMode="numeric" value={form.canonical_venue_id} onChange={(event) => setForm({ ...form, canonical_venue_id: event.target.value })} /></label>
                  <label><span>Audit reason</span><textarea required minLength={12} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Compared source identities and selected the canonical record…" /></label>
                  <button className={styles.commit} type="button" onClick={retireDuplicate} disabled={saving || !form.canonical_venue_id || form.reason.trim().length < 12}>{saving ? 'Retiring alias…' : 'Retire into canonical venue'}</button>
                  <a href={`/hub/venues/${selected.id}`} target="_blank" rel="noreferrer">Inspect public venue ↗</a>
                </div>
              )}
              {selected && !isDuplicate && (
                <div className={styles.form}>
                  <div className={styles.formTitle}>
                    <div><span className={`${styles.issueCode} ${styles[selected.issue_type]}`}>{issueLabel(selected.issue_type)}</span><h2>{selected.name}</h2></div>
                    <a href={`/hub/venues/${selected.id}`} target="_blank" rel="noreferrer">Public record ↗</a>
                  </div>
                  {needsLocation && (
                    <form className={styles.form} onSubmit={submitCorrection}>
                      <label><span>Street address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="street-address" /></label>
                      <div className={styles.formRow}>
                        <label><span>City</span><input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
                        <label className={styles.stateField}><span>State</span><input required maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} /></label>
                      </div>
                      <div className={styles.formRow}>
                        <label><span>Latitude</span><input required inputMode="decimal" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
                        <label><span>Longitude</span><input required inputMode="decimal" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
                      </div>
                      <label><span>Location audit reason</span><textarea required minLength={12} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Boundary source checked and reason for correction…" /></label>
                      <div className={styles.safetyNote}><span>Atomic write</span> The venue revision is checked again before coordinates change. Every correction stores before/after evidence and the acting admin.</div>
                      <button className={styles.commit} type="submit" disabled={saving || form.reason.trim().length < 12 || !selected.revision}>{saving ? 'Verifying and applying…' : 'Verify boundary & commit'}</button>
                    </form>
                  )}
                  {needsEnrichment && (
                    <form className={styles.form} onSubmit={submitEnrichment}>
                      <div className={styles.safetyNote}><span>Source-backed enrichment</span> Missing fields: {selected.missing_fields?.join(', ') || 'source freshness verification'}.</div>
                      <div className={styles.formRow}>
                        <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" /></label>
                        <label><span>Website</span><input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} autoComplete="url" /></label>
                      </div>
                      <label><span>Profile artwork URL</span><input value={form.profile_photo_url} onChange={(event) => setForm({ ...form, profile_photo_url: event.target.value })} /></label>
                      <label><span>Cover artwork URL</span><input value={form.cover_photo_url} onChange={(event) => setForm({ ...form, cover_photo_url: event.target.value })} /></label>
                      <label><span>Logo URL</span><input value={form.logo_url} onChange={(event) => setForm({ ...form, logo_url: event.target.value })} /></label>
                      <div className={styles.formRow}>
                        <label><span>Evidence URL</span><input required value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} /></label>
                        <label><span>Confidence (0–1)</span><input required inputMode="decimal" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value })} /></label>
                      </div>
                      <label><span>Enrichment audit reason</span><textarea required minLength={12} maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Official source reviewed and fields verified…" /></label>
                      <button className={styles.commit} type="submit" disabled={saving || !form.source_url || form.reason.trim().length < 12}>{saving ? 'Recording evidence…' : 'Apply enrichment with evidence'}</button>
                    </form>
                  )}
                </div>
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
          <section className={styles.history} aria-label="Recent venue directory operations">
            <div className={styles.panelHeader}>
              <div><span>Source provenance</span><strong>Enrichment and canonical history</strong></div>
              <small>{recentEnrichments.length + recentRetirements.length} retained in view</small>
            </div>
            <div className={styles.historyList}>
              {recentEnrichments.length === 0 && recentRetirements.length === 0 && <div className={styles.historyEmpty}>No directory enrichment or duplicate retirement has been recorded yet.</div>}
              {recentEnrichments.map((entry) => (
                <article key={entry.id} className={styles.historyItem}>
                  <span className={styles.historyStatus}>enriched</span>
                  <div><strong>Venue {entry.venue_id}</strong><p>{entry.reason} · confidence {entry.confidence}</p></div>
                  <time dateTime={entry.created_at}>{formatAge(entry.created_at)}</time>
                </article>
              ))}
              {recentRetirements.map((entry) => (
                <article key={entry.id} className={styles.historyItem}>
                  <span className={styles.historyStatus}>redirected</span>
                  <div><strong>Venue {entry.retired_venue_id} → {entry.canonical_venue_id}</strong><p>{entry.reason}</p></div>
                  <time dateTime={entry.created_at}>{formatAge(entry.created_at)}</time>
                </article>
              ))}
            </div>
          </section>
        </section>
      </main>
    </>
  );
}
