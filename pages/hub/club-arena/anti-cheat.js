/* ═══════════════════════════════════════════════════════════════
   Club Arena Anti-Cheat Dashboard — Native Hub Page
   5 Tabs: Overview | Flags | Events | Collusion | Anomalies
   Wires all 9 actions from /api/club-arena/anti-cheat
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall } from '../../../src/lib/club-arena/apiClient';
import { busEmit, eventBus } from '../../../src/engine/EventBus';
import { createDebouncedHandler } from '../../../src/lib/club-arena/retryAsync';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const timeAgo = (ts) => {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};

const SEVERITY_STYLES = {
  critical: { bg: 'rgba(228,30,63,0.15)', color: '#FA383E', label: '🔴 Critical' },
  high:     { bg: 'rgba(245,166,35,0.15)', color: '#F5A623', label: '🟠 High' },
  medium:   { bg: 'rgba(247,197,42,0.15)', color: '#F7C52A', label: '🟡 Medium' },
  low:      { bg: 'rgba(69,153,255,0.15)', color: '#4599FF', label: '🔵 Low' },
};

// ── Shimmer Skeleton ────────────────────────────────────────
function Shimmer({ rows = 5, cols = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px' }}>
          {Array.from({ length: cols }, (_, j) => (
            <div key={j} className={s.shimmerLine} style={{ height: '18px', borderRadius: '4px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Severity Badge ──────────────────────────────────────────
function SeverityBadge({ severity }) {
  const sev = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, background: sev.bg, color: sev.color, padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {sev.label}
    </span>
  );
}

export default function ClubArenaAntiCheatPage() {
  useTrainingBus('club-arena-anti-cheat');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Overview
  const [stats, setStats] = useState(null);

  // Flags
  const [flags, setFlags] = useState([]);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [flagFilter, setFlagFilter] = useState('open');

  // Events
  const [events, setEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  // Collusion
  const [collusionPairs, setCollusionPairs] = useState([]);
  const [collusionLoaded, setCollusionLoaded] = useState(false);
  const [analyzedHands, setAnalyzedHands] = useState(0);

  // Anomalies
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesLoaded, setAnomaliesLoaded] = useState(false);

  // Review Modal
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('reviewed');
  const [reviewNotes, setReviewNotes] = useState('');

  // Player History Modal
  const [playerHistory, setPlayerHistory] = useState(null);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Auto-clear success
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── API Call Helper ────────────────────────────────────────
  const ac = useCallback(async (action, params = {}) => {
    return apiCall('/api/club-arena/anti-cheat', { action, clubId, ...params });
  }, [clubId]);

  // ── Load Stats (Overview) ──────────────────────────────────
  const loadStats = useCallback(async (cId, silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const res = await apiCall('/api/club-arena/anti-cheat', { action: 'get_stats', clubId: cId || clubId });
      if (mountedRef.current) setStats(res.stats || null);
    } catch (err) {
      if (mountedRef.current && !silent) setError(err.message);
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, [clubId]);

  // ── Load Flags ─────────────────────────────────────────────
  const loadFlags = useCallback(async (status) => {
    try {
      const res = await ac('get_flags', { status: status || flagFilter, limit: 50 });
      if (mountedRef.current) { setFlags(res.flags || []); setFlagsLoaded(true); }
    } catch (err) { console.warn('[AntiCheat] Flags load failed:', err.message); }
  }, [ac, flagFilter]);

  // ── Load Events ────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    try {
      const res = await ac('get_events', { limit: 50 });
      if (mountedRef.current) { setEvents(res.events || []); setEventsLoaded(true); }
    } catch (err) { console.warn('[AntiCheat] Events load failed:', err.message); }
  }, [ac]);

  // ── Load Collusion Pairs ──────────────────────────────────
  const loadCollusion = useCallback(async () => {
    try {
      const res = await ac('get_collusion_pairs', { threshold: 0.75, minHands: 5 });
      if (mountedRef.current) {
        setCollusionPairs(res.pairs || []);
        setAnalyzedHands(res.analyzed_hands || 0);
        setCollusionLoaded(true);
      }
    } catch (err) { console.warn('[AntiCheat] Collusion load failed:', err.message); }
  }, [ac]);

  // ── Load Anomalies ─────────────────────────────────────────
  const loadAnomalies = useCallback(async () => {
    try {
      const res = await ac('get_anomalies', { limit: 500 });
      if (mountedRef.current) { setAnomalies(res.anomalies || []); setAnomaliesLoaded(true); }
    } catch (err) { console.warn('[AntiCheat] Anomalies load failed:', err.message); }
  }, [ac]);

  // ── Load Player History ────────────────────────────────────
  const loadPlayerHistory = useCallback(async (playerId) => {
    setPlayerHistoryLoading(true);
    try {
      const res = await ac('get_player_history', { playerId });
      if (mountedRef.current) setPlayerHistory(res);
    } catch (err) { setError(err.message); }
    finally { setPlayerHistoryLoading(false); }
  }, [ac]);

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return; // Wait for Next.js to hydrate query params
    let cancelled = false;
    let authUnsub = null;
    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      const { supabase } = await import('../../../src/lib/supabase');
      let targetClub = qClub;
      if (!targetClub) {
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        targetClub = mem?.club_id;
      }
      if (targetClub && !cancelled) {
        setClubId(targetClub);
        loadStats(targetClub);
      } else if (!cancelled) { setError('No club found.'); setLoading(false); }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }
      const timeout = setTimeout(() => { if (!cancelled) { setError('login_required'); setLoading(false); } }, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        clearTimeout(timeout);
        if (sess && !cancelled) await init(sess);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authUnsub = subscription;
    })();

    return () => { cancelled = true; authUnsub?.unsubscribe?.(); };
  }, [router.isReady, router.query.club, router.query.clubId, loadStats]);

  // ── Lazy Tab Loading ───────────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    if (tab === 'flags' && !flagsLoaded) loadFlags();
    if (tab === 'events' && !eventsLoaded) loadEvents();
    if (tab === 'collusion' && !collusionLoaded) loadCollusion();
    if (tab === 'anomalies' && !anomaliesLoaded) loadAnomalies();
  }, [tab, clubId, flagsLoaded, eventsLoaded, collusionLoaded, anomaliesLoaded, loadFlags, loadEvents, loadCollusion, loadAnomalies]);

  // ── Reload flags when filter changes ───────────────────────
  useEffect(() => {
    if (flagsLoaded && clubId) loadFlags(flagFilter);
  }, [flagFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EventBus Listeners (debounced) ─────────────────────
  useEffect(() => {
    if (!clubId) return;
    const debouncedRefresh = createDebouncedHandler(() => { loadStats(clubId, true); setFlagsLoaded(false); }, 300);
    const events = ['ANTI_CHEAT_FLAG_CREATED', 'PLAYER_KICKED', 'TABLE_CREATED', 'CHIPS_DISTRIBUTED'];
    events.forEach(ev => eventBus.on(ev, debouncedRefresh));
    return () => { debouncedRefresh.cancel(); events.forEach(ev => eventBus.off(ev, debouncedRefresh)); };
  }, [clubId, loadStats]);

  // ── Actions ────────────────────────────────────────────────
  const reviewFlag = async () => {
    if (!reviewTarget) return;
    setProcessing(true);
    try {
      await ac('review_flag', { flagId: reviewTarget.id, newStatus: reviewStatus, notes: reviewNotes || undefined });
      setSuccess(`Flag ${reviewStatus} successfully.`);
      setReviewTarget(null); setReviewNotes('');
      setFlagsLoaded(false); loadFlags();
      loadStats(clubId); // refresh overview counts
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  const kickPlayer = async (playerId, tableId) => {
    if (!confirm('Remove this player from the table for anti-cheat violation?')) return;
    setProcessing(true);
    try {
      const res = await ac('kick_player', { playerId, tableId, reason: 'Anti-cheat violation — removed by admin' });
      setSuccess(res.message || 'Player removed.');
      busEmit('PLAYER_KICKED', { clubId, playerId, tableId });
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  // ── Loading / Login ────────────────────────────────────────
  if (loading && !stats) {
    return (
      <HubErrorBoundary name="Anti-Cheat">
        <SEOHead title="Anti-Cheat | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.inner}><Shimmer rows={6} cols={4} /></div></div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="Anti-Cheat">
      <SEOHead title="Anti-Cheat Dashboard | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Success / Login ──────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Anti-Cheat Dashboard.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* ── Review Flag Modal ────────────────────────────── */}
          {reviewTarget && (
            <div className={s.modalOverlay} onClick={() => !processing && setReviewTarget(null)}>
              <div className={s.modal} onClick={e => e.stopPropagation()}>
                <div className={s.modalTitle}>Review Flag</div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <SeverityBadge severity={reviewTarget.severity} />
                    <span style={{ color: '#E4E6EB', fontWeight: 600 }}>{reviewTarget.flag_type}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#B0B3B8' }}>
                    Player: {reviewTarget.player?.display_name || reviewTarget.player_id?.substring(0, 8) || '—'}
                  </div>
                  {reviewTarget.details && (
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px', background: '#18191A', padding: '8px', borderRadius: '6px', fontFamily: 'monospace', maxHeight: '100px', overflow: 'auto' }}>
                      {JSON.stringify(reviewTarget.details, null, 2)}
                    </div>
                  )}
                </div>
                <div className={s.formGroup} style={{ marginBottom: '16px' }}>
                  <label className={s.formLabel}>Action</label>
                  <select className={s.formSelect} value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}>
                    <option value="reviewed">✅ Mark Reviewed</option>
                    <option value="dismissed">🗑️ Dismiss</option>
                    <option value="actioned">⚡ Actioned</option>
                  </select>
                </div>
                <div className={s.formGroup} style={{ marginBottom: '20px' }}>
                  <label className={s.formLabel}>Notes (optional)</label>
                  <input className={s.formInput} placeholder="Add review notes..." value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setReviewTarget(null)} className={s.btnGhost} disabled={processing}>Cancel</button>
                  <button onClick={reviewFlag} className={s.btnPrimary} disabled={processing}>{processing ? 'Submitting...' : 'Submit Review'}</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Player History Modal ─────────────────────────── */}
          {playerHistory && (
            <div className={s.modalOverlay} onClick={() => setPlayerHistory(null)}>
              <div className={s.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
                <div className={s.modalTitle}>Player Anti-Cheat History</div>
                {playerHistoryLoading ? <Shimmer rows={4} cols={3} /> : (
                  <>
                    <div className={s.statsGrid} style={{ marginBottom: '16px' }}>
                      <div className={s.statCard}><div className={s.statValueRed}>{fmt(playerHistory.flags?.length || 0)}</div><div className={s.statLabel}>Flags</div></div>
                      <div className={s.statCard}><div className={s.statValue}>{fmt(playerHistory.events?.length || 0)}</div><div className={s.statLabel}>Events</div></div>
                      <div className={s.statCard}><div className={s.statValueBlue}>{fmt(playerHistory.sessions?.length || 0)}</div><div className={s.statLabel}>Sessions</div></div>
                    </div>
                    {(playerHistory.flags || []).length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Flags</div>
                        {playerHistory.flags.slice(0, 10).map(f => (
                          <div key={f.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #3A3B3C', fontSize: '13px' }}>
                            <SeverityBadge severity={f.severity} />
                            <span style={{ color: '#E4E6EB' }}>{f.flag_type}</span>
                            <span style={{ color: '#B0B3B8', marginLeft: 'auto' }}>{timeAgo(f.flagged_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(playerHistory.events || []).length > 0 && (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>Recent Events</div>
                        {playerHistory.events.slice(0, 10).map((ev, i) => (
                          <div key={ev.id || i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #3A3B3C', fontSize: '13px' }}>
                            <span style={{ background: '#3A3B3C', color: '#E4E6EB', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{ev.event_type}</span>
                            <span style={{ color: '#B0B3B8', marginLeft: 'auto' }}>{timeAgo(ev.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setPlayerHistory(null)} className={s.btnGhost}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              🛡️ Anti-Cheat Dashboard
              {stats && stats.open_flags > 0 && (
                <span className={s.unionCode} style={{ background: 'rgba(228,30,63,0.15)', color: '#FA383E' }}>
                  {stats.open_flags} open
                </span>
              )}
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <Link href="/hub/club-arena/admin" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>⚙️ Admin</button></Link>
              <button onClick={() => { loadStats(clubId); setFlagsLoaded(false); setEventsLoaded(false); setCollusionLoaded(false); setAnomaliesLoaded(false); }} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className={s.tabs}>
            {[
              { id: 'overview', label: '🛡️ Overview' },
              { id: 'flags', label: '🚩 Flags', badge: stats?.open_flags || null },
              { id: 'events', label: '📊 Events' },
              { id: 'collusion', label: '🤝 Collusion' },
              { id: 'anomalies', label: '🎯 Anomalies' },
            ].map(t => (
              <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge ? <span className={s.tabBadge}>{t.badge}</span> : null}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: OVERVIEW                                    */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'overview' && (
            <>
              {!stats ? <Shimmer rows={4} cols={4} /> : (
                <>
                  {/* Summary Cards */}
                  <div className={s.statsGrid}>
                    <div className={s.statCard}><div className={s.statValueRed}>{fmt(stats.open_flags)}</div><div className={s.statLabel}>Open Flags</div></div>
                    <div className={s.statCard}><div className={s.statValueGold}>{fmt(stats.blocks_24h)}</div><div className={s.statLabel}>Blocks (24h)</div></div>
                    <div className={s.statCard}><div className={s.statValueGreen}>{fmt(stats.active_sessions)}</div><div className={s.statLabel}>Active Sessions</div></div>
                  </div>

                  {/* Severity Breakdown */}
                  <div className={s.section}>
                    <div className={s.sectionTitle}>Flags by Severity</div>
                    <div className={s.statsGrid}>
                      {Object.entries(stats.by_severity || {}).map(([sev, count]) => {
                        const st = SEVERITY_STYLES[sev] || {};
                        return (
                          <div key={sev} className={s.statCard} style={{ borderLeft: `3px solid ${st.color || '#6B7280'}` }}>
                            <div className={s.statValue} style={{ color: st.color }}>{fmt(count)}</div>
                            <div className={s.statLabel} style={{ textTransform: 'capitalize' }}>{sev}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Flags by Type */}
                  {Object.keys(stats.by_type || {}).length > 0 && (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>Flags by Type</div>
                      <div className={s.tableScroll}>
                        <table className={s.dataTable}>
                          <thead><tr><th>Type</th><th>Count</th></tr></thead>
                          <tbody>
                            {Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                              <tr key={type}>
                                <td style={{ fontWeight: 600 }}>{type}</td>
                                <td>{fmt(count)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {stats.open_flags === 0 && (
                    <div className={s.emptyState}>
                      <span className={s.emptyIcon}>✅</span>
                      <span className={s.emptyText}>No open flags — club is clean!</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: FLAGS                                       */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'flags' && (
            <>
              {/* Filter Bar */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {['open', 'reviewed', 'dismissed', 'actioned', 'all'].map(f => (
                  <button key={f} className={flagFilter === f ? s.btnPrimary : s.btnGhost} onClick={() => setFlagFilter(f)} style={{ textTransform: 'capitalize', padding: '6px 14px', fontSize: '13px' }}>
                    {f}
                  </button>
                ))}
              </div>

              {!flagsLoaded ? <Shimmer rows={6} cols={4} /> : flags.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>🚩</span><span className={s.emptyText}>No flags match the filter &ldquo;{flagFilter}&rdquo;</span></div>
              ) : (
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead>
                      <tr>
                        <th>Severity</th>
                        <th>Type</th>
                        <th>Player</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flags.map(f => (
                        <tr key={f.id}>
                          <td><SeverityBadge severity={f.severity} /></td>
                          <td style={{ fontWeight: 600, color: '#E4E6EB' }}>{f.flag_type}</td>
                          <td>
                            <button onClick={() => loadPlayerHistory(f.player_id)} className={s.btnGhost} style={{ padding: '2px 8px', fontSize: '12px' }}>
                              {f.player?.display_name || f.player_id?.substring(0, 8) || '—'}
                            </button>
                          </td>
                          <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(f.flagged_at)}</td>
                          <td>
                            <span style={{ fontSize: '11px', fontWeight: 600, background: f.status === 'open' ? 'rgba(228,30,63,0.15)' : '#3A3B3C', color: f.status === 'open' ? '#FA383E' : '#B0B3B8', padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                              {f.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {f.status === 'open' && (
                                <button onClick={() => { setReviewTarget(f); setReviewStatus('reviewed'); setReviewNotes(''); }} className={`${s.btnGold} ${s.btnSmall}`}>Review</button>
                              )}
                              <button onClick={() => kickPlayer(f.player_id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Kick</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: EVENTS                                      */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'events' && (
            <>
              {!eventsLoaded ? <Shimmer rows={8} cols={3} /> : events.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>📊</span><span className={s.emptyText}>No anti-cheat events recorded yet</span></div>
              ) : (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Recent Events ({events.length})</div>
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Type</th><th>Player</th><th>Details</th><th>Time</th></tr></thead>
                      <tbody>
                        {events.map((ev, i) => (
                          <tr key={ev.id || i}>
                            <td>
                              <span style={{ fontSize: '11px', fontWeight: 700, background: ev.event_type.includes('kicked') ? 'rgba(228,30,63,0.15)' : ev.event_type.includes('blocked') ? 'rgba(245,166,35,0.15)' : '#3A3B3C', color: ev.event_type.includes('kicked') ? '#FA383E' : ev.event_type.includes('blocked') ? '#F5A623' : '#E4E6EB', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                {ev.event_type}
                              </span>
                            </td>
                            <td>
                              <button onClick={() => ev.player_id && loadPlayerHistory(ev.player_id)} className={s.btnGhost} style={{ padding: '2px 8px', fontSize: '12px' }}>
                                {ev.player?.display_name || ev.player_id?.substring(0, 8) || 'System'}
                              </button>
                            </td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.details ? JSON.stringify(ev.details).substring(0, 80) : '—'}
                            </td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8', whiteSpace: 'nowrap' }}>{timeAgo(ev.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: COLLUSION                                   */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'collusion' && (
            <>
              {!collusionLoaded ? <Shimmer rows={6} cols={5} /> : (
                <>
                  <div className={s.statsGrid} style={{ marginBottom: '16px' }}>
                    <div className={s.statCard}><div className={s.statValueBlue}>{fmt(analyzedHands)}</div><div className={s.statLabel}>Hands Analyzed</div></div>
                    <div className={s.statCard}><div className={s.statValueRed}>{fmt(collusionPairs.length)}</div><div className={s.statLabel}>Suspicious Pairs</div></div>
                    <div className={s.statCard}>
                      <div className={s.statValue} style={{ color: collusionPairs.filter(p => p.severity === 'critical').length > 0 ? '#FA383E' : '#31A24C' }}>
                        {fmt(collusionPairs.filter(p => p.severity === 'critical').length)}
                      </div>
                      <div className={s.statLabel}>Critical</div>
                    </div>
                  </div>

                  {collusionPairs.length === 0 ? (
                    <div className={s.emptyState}><span className={s.emptyIcon}>✅</span><span className={s.emptyText}>No suspicious chip-dumping patterns detected across {fmt(analyzedHands)} hands</span></div>
                  ) : (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>Suspected Collusion Pairs</div>
                      <div className={s.sectionSubtitle}>Players with one-directional chip flow above 75% threshold</div>
                      <div className={s.tableScroll}>
                        <table className={s.dataTable}>
                          <thead>
                            <tr>
                              <th>Severity</th>
                              <th>Dumper → Receiver</th>
                              <th>Hands Together</th>
                              <th>Flow Ratio</th>
                              <th>Net Chips</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {collusionPairs.map((pair, i) => (
                              <tr key={i}>
                                <td><SeverityBadge severity={pair.severity} /></td>
                                <td>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button onClick={() => loadPlayerHistory(pair.dumper_id)} className={s.btnGhost} style={{ padding: '2px 6px', fontSize: '12px', color: '#FA383E' }}>
                                      {pair.dumper_id.substring(0, 8)}
                                    </button>
                                    <span style={{ color: '#6B7280' }}>→</span>
                                    <button onClick={() => loadPlayerHistory(pair.receiver_id)} className={s.btnGhost} style={{ padding: '2px 6px', fontSize: '12px', color: '#31A24C' }}>
                                      {pair.receiver_id.substring(0, 8)}
                                    </button>
                                  </div>
                                </td>
                                <td style={{ fontWeight: 600 }}>{fmt(pair.hands_together)}</td>
                                <td>
                                  <span style={{ fontWeight: 700, color: pair.chip_flow_ratio >= 0.9 ? '#FA383E' : pair.chip_flow_ratio >= 0.85 ? '#F5A623' : '#F7C52A' }}>
                                    {(pair.chip_flow_ratio * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(pair.net_chips_transferred)}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => kickPlayer(pair.dumper_id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Kick Dumper</button>
                                    <button onClick={() => kickPlayer(pair.receiver_id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Kick Receiver</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: ANOMALIES                                   */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'anomalies' && (
            <>
              {!anomaliesLoaded ? <Shimmer rows={6} cols={4} /> : (
                <>
                  <div className={s.statsGrid} style={{ marginBottom: '16px' }}>
                    <div className={s.statCard}><div className={s.statValueRed}>{fmt(anomalies.length)}</div><div className={s.statLabel}>Anomalies Found</div></div>
                    <div className={s.statCard}>
                      <div className={s.statValue} style={{ color: '#FA383E' }}>{fmt(anomalies.filter(a => a.severity === 'critical').length)}</div>
                      <div className={s.statLabel}>Critical</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueGold}>{fmt(anomalies.filter(a => a.severity === 'high').length)}</div>
                      <div className={s.statLabel}>High</div>
                    </div>
                  </div>

                  {anomalies.length === 0 ? (
                    <div className={s.emptyState}><span className={s.emptyIcon}>🎯</span><span className={s.emptyText}>No suspicious plays detected — all hands look clean!</span></div>
                  ) : (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>Suspicious Plays</div>
                      <div className={s.sectionSubtitle}>Players who folded strong hands on the river (possible chip-dumping signal)</div>
                      <div className={s.tableScroll}>
                        <table className={s.dataTable}>
                          <thead>
                            <tr>
                              <th>Severity</th>
                              <th>Player</th>
                              <th>Action</th>
                              <th>Hand Rank</th>
                              <th>Pot Size</th>
                              <th>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {anomalies.map((a, i) => (
                              <tr key={`${a.hand_id}-${a.player_id}-${i}`}>
                                <td><SeverityBadge severity={a.severity} /></td>
                                <td>
                                  <button onClick={() => loadPlayerHistory(a.player_id)} className={s.btnGhost} style={{ padding: '2px 8px', fontSize: '12px' }}>
                                    {a.player_id.substring(0, 8)}
                                  </button>
                                </td>
                                <td>
                                  <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(228,30,63,0.15)', color: '#FA383E', padding: '3px 8px', borderRadius: '4px' }}>
                                    Folded Strong Hand
                                  </span>
                                </td>
                                <td style={{ fontWeight: 700, color: '#F7C52A', textTransform: 'capitalize' }}>{String(a.hand_rank).replace(/_/g, ' ')}</td>
                                <td style={{ fontWeight: 600 }}>{fmtChips(a.pot_total)}</td>
                                <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(a.completed_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
