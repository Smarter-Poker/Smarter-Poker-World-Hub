/* ═══════════════════════════════════════════════════════════════
   Club Arena Players — Native Hub Page (replaces iframe shell)
   4 Tabs: Members | Sessions | Retention | Chip Flow
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import { busEmit, eventBus } from '../../../src/engine/EventBus';
import { createDebouncedHandler } from '../../../src/lib/club-arena/retryAsync';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};
const timeAgo = (ts) => {
  if (!ts) return 'Never';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function ClubArenaPlayersPage() {
  useTrainingBus('club-arena-players');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Members / Sessions state
  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tables, setTables] = useState([]);

  // Retention state
  const [retention, setRetention] = useState(null);
  const [retentionLoaded, setRetentionLoaded] = useState(false);

  // Chip Flow state
  const [chipFlow, setChipFlow] = useState(null);
  const [chipFlowLoaded, setChipFlowLoaded] = useState(false);

  // Search / Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Welcome-back modal
  const [wbTarget, setWbTarget] = useState(null);
  const [wbAmount, setWbAmount] = useState('');

  // Player Notes
  const [notes, setNotes] = useState({});
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteData, setNoteData] = useState({ player_type: 'unknown', color_label: 'none', notes: '' });
  const [savingNote, setSavingNote] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Auto-clear success ────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Load Sessions (Primary Data) ──────────────────────────
  const loadSessions = useCallback(async (cId, silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const targetClubId = cId || clubId;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }
      const res = await apiGet(`/api/club-arena/player-sessions?clubId=${targetClubId}`);
      if (mountedRef.current) {
        const sessionData = res.sessions || [];
        setSessions(sessionData);
        setSummary(res.summary || null);
        setTables(res.tables || []);

        // Load notes for all players in one batch
        if (!notesLoaded && sessionData.length > 0) {
          try {
            const userIds = [...new Set(sessionData.map(s => s.userId).filter(Boolean))];
            if (userIds.length > 0) {
              const notesRes = await apiCall('/api/club-arena/player-notes', { action: 'get_bulk', targetUserIds: userIds });
              if (mountedRef.current) {
                setNotes(notesRes.notes || {});
                setNotesLoaded(true);
              }
            } else {
              setNotesLoaded(true);
            }
          } catch (err) {
            console.warn('[Players] Notes bulk load failed:', err.message);
            if (mountedRef.current) setNotesLoaded(true);
          }
        }
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId, notesLoaded]);

  // ── Load Retention (Lazy) ─────────────────────────────────
  const loadRetention = useCallback(async (force) => {
    if (!force && retentionLoaded) return;
    if (!clubId) return;
    try {
      const res = await apiCall('/api/club-arena/player-retention', { clubId, action: 'scan' });
      if (mountedRef.current) { setRetention(res); setRetentionLoaded(true); }
    } catch (err) {
      setLoading(false);
      console.warn('[Players] Retention scan failed:', err.message);
    }
  }, [clubId, retentionLoaded]);

  // ── Load Chip Flow (Lazy) ─────────────────────────────────
  const loadChipFlow = useCallback(async () => {
    if (chipFlowLoaded || !clubId) return;
    try {
      const res = await apiCall('/api/club-arena/player-chip-flow', { clubId });
      if (mountedRef.current) { setChipFlow(res.flow || {}); setChipFlowLoaded(true); }
    } catch (err) {
      setLoading(false);
      console.warn('[Players] Chip flow failed:', err.message);
    }
  }, [clubId, chipFlowLoaded]);

  // ── Initial Load with Session Hydration Awareness ──────────
  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      if (qClub) { setClubId(qClub); loadSessions(qClub); return; }
      if (session) {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: membership } = await supabase
          .from('club_members').select('club_id').eq('user_id', session.user.id)
          .limit(1).maybeSingle();
        if (membership?.club_id && !cancelled) { setClubId(membership.club_id); loadSessions(membership.club_id); return; }
      }
      if (!cancelled) { setError('No club found. Navigate from the Club Arena lobby.'); setLoading(false); }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }
      const timeout = setTimeout(() => { if (!cancelled) { setError('login_required'); setLoading(false); } }, 3000);
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
        clearTimeout(timeout);
        if (s && !cancelled) await init(s);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authUnsub = subscription;
    })();

    return () => { cancelled = true; authUnsub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId]);

  // ── Lazy Tab Loading ───────────────────────────────────────
  useEffect(() => {
    if (tab === 'retention') loadRetention();
    if (tab === 'chipflow') loadChipFlow();
  }, [tab, loadRetention, loadChipFlow]);

  // ── EventBus Listeners (debounced) ────────────────────────
  useEffect(() => {
    const debouncedRefresh = createDebouncedHandler(() => { if (clubId) loadSessions(clubId, true); }, 300);
    const events = ['CHIPS_DISTRIBUTED', 'MEMBER_UPDATED', 'PLAYER_JOINED', 'PLAYER_LEFT', 'CASHOUT_APPROVED', 'CASHOUT_REQUESTED', 'CLUB_UPDATED'];
    events.forEach(ev => eventBus.on(ev, debouncedRefresh));
    return () => { debouncedRefresh.cancel(); events.forEach(ev => eventBus.off(ev, debouncedRefresh)); };
  }, [clubId, loadSessions]);

  // ── Visibility Refresh ─────────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadSessions(clubId, true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clubId, loadSessions]);

  // ── Actions ────────────────────────────────────────────────
  const sendWelcomeBack = async () => {
    if (!wbTarget) return;
    setProcessing(true);
    try {
      const amt = parseInt(wbAmount, 10) || 500;
      await apiCall('/api/club-arena/player-retention', { clubId, action: 'welcome_back', playerId: wbTarget.userId, amount: amt });
      setSuccess(`${fmtChips(amt)} welcome-back chips sent to ${wbTarget.name}!`);
      busEmit('CHIPS_DISTRIBUTED', { clubId });
      setWbTarget(null); setWbAmount('');
      loadRetention(true); // force re-scan after welcome-back
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  // ── Loading / Login Required ───────────────────────────────
  if (loading) {
    return (
      <HubErrorBoundary name="Players">
        <SEOHead title="Players | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}>
          <div className={s.inner} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="ca-skeleton" style={{ height: '48px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>{[1,2,3].map(i => <div key={i} className="ca-skeleton" style={{ height: '36px', flex: 1 }} />)}</div>
            {[1,2,3,4,5,6].map(i => <div key={i} className="ca-skeleton" style={{ height: '52px' }} />)}
          </div>
        </div>
      </HubErrorBoundary>
    );
  }

  // ── Derived Data ───────────────────────────────────────────
  const filtered = useMemo(() => sessions.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (p.displayName || '').toLowerCase().includes(q) || (p.userId || '').toLowerCase().includes(q);
    }
    return true;
  }), [sessions, statusFilter, roleFilter, searchQuery]);

  const retSummary = retention?.summary || {};
  const atRisk = retention?.atRisk || [];
  const churned = retention?.churned || [];

  // Chip flow enriched with names from sessions
  const chipFlowEntries = useMemo(() => {
    if (!chipFlow) return [];
    const nameMap = {};
    sessions.forEach(p => { nameMap[p.userId] = p.displayName; });
    return Object.entries(chipFlow).map(([userId, flow]) => ({
      userId,
      name: nameMap[userId] || userId.substring(0, 8),
      ...flow,
    })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [chipFlow, sessions]);

  return (
    <HubErrorBoundary name="Players">
      <SEOHead title="Players | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Success ────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Players page.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* ── Welcome-Back Modal ──────────────────────────── */}
          {wbTarget && (
            <div className={s.modalOverlay} onClick={() => setWbTarget(null)}>
              <div className={s.modal} onClick={e => e.stopPropagation()}>
                <div className={s.modalTitle}>🎁 Send Welcome-Back Chips</div>
                <p style={{ color: '#B0B3B8', marginBottom: '12px', fontSize: '13px' }}>
                  Send promo chips to <strong style={{ color: '#E4E6EB' }}>{wbTarget.name}</strong> to encourage them to return.
                  They&apos;ve been inactive for <strong style={{ color: '#F7C52A' }}>{wbTarget.daysSinceActive} days</strong>.
                </p>
                <div className={s.formGroup} style={{ marginBottom: '16px' }}>
                  <label className={s.formLabel}>Chip Amount</label>
                  <input className={s.formInput} type="number" placeholder="500" value={wbAmount} onChange={e => setWbAmount(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setWbTarget(null)} className={s.btnGhost}>Cancel</button>
                  <button onClick={sendWelcomeBack} className={s.btnSuccess} disabled={processing}>{processing ? 'Sending...' : '🎁 Send Chips'}</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Player Note Modal ────────────────────────────── */}
          {noteTarget && (
            <div className={s.modalOverlay} onClick={() => !savingNote && setNoteTarget(null)}>
              <div className={s.modal} onClick={e => e.stopPropagation()}>
                <div className={s.modalTitle}>📝 Note: {noteTarget.displayName || noteTarget.userId?.substring(0, 8)}</div>
                <div className={s.formGroup} style={{ marginBottom: '12px' }}>
                  <label className={s.formLabel}>Player Type</label>
                  <select className={s.formSelect} value={noteData.player_type} onChange={e => setNoteData(d => ({ ...d, player_type: e.target.value }))}>
                    {['unknown', 'fish', 'reg', 'shark', 'whale', 'nit', 'lag', 'tag'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div className={s.formGroup} style={{ marginBottom: '12px' }}>
                  <label className={s.formLabel}>Color Label</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[['none','#6B7280'],['red','#FA383E'],['orange','#F5A623'],['yellow','#F7C52A'],['green','#31A24C'],['blue','#4599FF'],['purple','#C084FC']].map(([c, hex]) => (
                      <button key={c} onClick={() => setNoteData(d => ({ ...d, color_label: c }))} style={{ width: '28px', height: '28px', borderRadius: '50%', background: hex, border: noteData.color_label === c ? '3px solid #E4E6EB' : '2px solid #3A3B3C', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
                <div className={s.formGroup} style={{ marginBottom: '16px' }}>
                  <label className={s.formLabel}>Notes</label>
                  <textarea className={s.formInput} rows={4} placeholder="Add notes about this player..." value={noteData.notes} onChange={e => setNoteData(d => ({ ...d, notes: e.target.value }))} style={{ resize: 'vertical', minHeight: '80px' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setNoteTarget(null)} className={s.btnGhost} disabled={savingNote}>Cancel</button>
                  <button className={s.btnPrimary} disabled={savingNote} onClick={async () => {
                    setSavingNote(true);
                    try {
                      await apiCall('/api/club-arena/player-notes', { action: 'upsert', targetUserId: noteTarget.userId, note: noteData });
                      setNotes(prev => ({ ...prev, [noteTarget.userId]: noteData }));
                      setSuccess('Note saved!');
                      setNoteTarget(null);
                    } catch (err) { setError(err.message); }
                    finally { setSavingNote(false); }
                  }}>{savingNote ? 'Saving...' : '💾 Save Note'}</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              Players
              {summary && <span className={s.unionCode}>{fmt(summary.totalMembers)} members</span>}
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadSessions(clubId)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Retention Alert Banner ────────────────────────── */}
          {retentionLoaded && (retSummary.atRisk > 0 || retSummary.churned > 0) && tab !== 'retention' && (
            <div className={s.alertBanner} onClick={() => setTab('retention')}>
              <span className={s.alertCount}>{retSummary.atRisk + retSummary.churned}</span>
              <span>player{(retSummary.atRisk + retSummary.churned) !== 1 ? 's' : ''} need attention — {retSummary.atRisk} at-risk, {retSummary.churned} churned</span>
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className={s.tabs}>
            {[
              { id: 'members', label: 'Members', badge: summary?.totalMembers || null },
              { id: 'sessions', label: 'Sessions', badge: summary?.online || null },
              { id: 'retention', label: 'Retention' },
              { id: 'chipflow', label: 'Chip Flow' },
            ].map(t => (
              <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge ? <span className={s.tabBadge}>{t.badge}</span> : null}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: MEMBERS                                     */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'members' && (
            <>
              {/* Summary */}
              {summary && (
                <div className={s.statsGrid}>
                  <div className={s.statCard}><div className={s.statValueBlue}>{fmt(summary.totalMembers)}</div><div className={s.statLabel}>Total Members</div></div>
                  <div className={s.statCard}><div className={s.statValueGreen}>{fmt(summary.online)}</div><div className={s.statLabel}>Online Now</div></div>
                  <div className={s.statCard}><div className={s.statValueGold}>{fmt(summary.idle)}</div><div className={s.statLabel}>Idle</div></div>
                  <div className={s.statCard}><div className={s.statValueBlue}>{fmt(summary.activeTables)}</div><div className={s.statLabel}>Active Tables</div></div>
                  <div className={s.statCard}><div className={s.statValue}>{fmt(summary.totalSeated)}</div><div className={s.statLabel}>Players Seated</div></div>
                </div>
              )}

              {/* Filters */}
              <div className={s.formRow} style={{ marginBottom: '16px' }}>
                <div className={s.formGroup}>
                  <input className={s.formInput} placeholder="Search by name or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <div className={s.formGroup} style={{ maxWidth: '150px' }}>
                  <select className={s.formSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="online">🟢 Online</option>
                    <option value="idle">🟡 Idle</option>
                    <option value="away">🔵 Away</option>
                    <option value="offline">⚫ Offline</option>
                  </select>
                </div>
                <div className={s.formGroup} style={{ maxWidth: '150px' }}>
                  <select className={s.formSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                    <option value="all">All Roles</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="super_agent">Super Agent</option>
                    <option value="agent">Agent</option>
                    <option value="player">Player</option>
                  </select>
                </div>
              </div>

              {/* Member List */}
              {filtered.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>👥</span><span className={s.emptyText}>{searchQuery || statusFilter !== 'all' ? 'No players match your filters' : 'No members found'}</span></div>
              ) : (
                <div className={s.cardGrid}>
                  {filtered.map(p => {
                    const statusColors = { online: '#31A24C', idle: '#F7C52A', away: '#4599FF', offline: '#6B7280' };
                    const statusEmoji = { online: '🟢', idle: '🟡', away: '🔵', offline: '⚫' };
                    return (
                      <div key={p.userId} className={s.card}>
                        <div className={s.cardHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', border: `2px solid ${statusColors[p.status]}` }} />
                            ) : (
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: `2px solid ${statusColors[p.status]}` }}>
                                {(p.displayName || '?')[0].toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className={s.cardName}>{p.displayName}</div>
                              <div style={{ fontSize: '11px', color: statusColors[p.status] }}>{statusEmoji[p.status]} {p.status}</div>
                            </div>
                          </div>
                          <span className={`${s.cardBadge} ${p.role === 'owner' || p.role === 'admin' ? s.badgeActive : ''}`} style={p.role === 'agent' || p.role === 'super_agent' ? { background: 'rgba(168,85,247,0.15)', color: '#C084FC' } : undefined}>
                            {p.role}
                          </span>
                        </div>
                        <div className={s.cardMeta}>
                          <span className={s.cardMetaItem}>💰 {fmtChips(p.chipBalance)}</span>
                          <span className={s.cardMetaItem}>⏱ {timeAgo(p.lastActive)}</span>
                          {p.txCount24h > 0 && <span className={s.cardMetaItem}>📊 {p.txCount24h} txns</span>}
                          {p.volume24h > 0 && <span className={s.cardMetaItem}>💸 {fmtChips(p.volume24h)} vol</span>}
                          <button onClick={(e) => {
                            e.stopPropagation();
                            const existing = notes[p.userId];
                            setNoteData(existing ? { player_type: existing.player_type || 'unknown', color_label: existing.color_label || 'none', notes: existing.notes || '' } : { player_type: 'unknown', color_label: 'none', notes: '' });
                            setNoteTarget(p);
                          }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: '14px', borderRadius: '4px', color: notes[p.userId] ? '#F7C52A' : '#6B7280' }} title={notes[p.userId] ? 'Edit note' : 'Add note'}>
                            {notes[p.userId] ? '📝' : '✏️'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: SESSIONS                                    */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'sessions' && (
            <>
              {/* Active Tables Overview */}
              {tables.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Active Tables ({tables.length})</div>
                  <div className={s.statsGrid}>
                    {tables.map(t => (
                      <div key={t.id} className={s.statCard}>
                        <div className={s.statValueBlue}>{t.current_players}/{t.max_players}</div>
                        <div className={s.statLabel}>{t.name || 'Table'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Session Table */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Player Sessions</div>
                {sessions.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>📊</span><span className={s.emptyText}>No session data available</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Player</th>
                          <th>Role</th>
                          <th>Chips</th>
                          <th>24h Txns</th>
                          <th>24h Volume</th>
                          <th>Last Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map(p => {
                          const statusColors = { online: '#31A24C', idle: '#F7C52A', away: '#4599FF', offline: '#6B7280' };
                          return (
                            <tr key={p.userId}>
                              <td>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: statusColors[p.status], marginRight: '6px', boxShadow: p.status === 'online' ? '0 0 6px rgba(49,162,76,0.5)' : 'none' }} />
                                {p.status}
                              </td>
                              <td style={{ fontWeight: 600 }}>{p.displayName}</td>
                              <td><span style={{ fontSize: '11px', color: '#B0B3B8', textTransform: 'uppercase' }}>{p.role}</span></td>
                              <td>{fmtChips(p.chipBalance)}</td>
                              <td style={{ color: p.txCount24h > 0 ? '#31A24C' : '#6B7280' }}>{p.txCount24h}</td>
                              <td style={{ fontWeight: 600 }}>{fmtChips(p.volume24h)}</td>
                              <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(p.lastActive)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: RETENTION                                   */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'retention' && (
            <>
              {!retentionLoaded ? (
                <div className={s.loading}>Scanning player activity...</div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className={s.statsGrid}>
                    <div className={s.statCard}><div className={s.statValueBlue}>{fmt(retSummary.total)}</div><div className={s.statLabel}>Total</div></div>
                    <div className={s.statCard}><div className={s.statValueGreen}>{fmt(retSummary.active)}</div><div className={s.statLabel}>Active</div></div>
                    <div className={s.statCard}><div className={s.statValueGold}>{fmt(retSummary.atRisk)}</div><div className={s.statLabel}>At-Risk</div></div>
                    <div className={s.statCard}><div className={s.statValueRed}>{fmt(retSummary.churned)}</div><div className={s.statLabel}>Churned</div></div>
                  </div>

                  {/* At-Risk Players */}
                  {atRisk.length > 0 && (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>⚠️ At-Risk Players ({atRisk.length})</div>
                      <div className={s.sectionSubtitle}>Inactive for 5-14 days — reach out before they churn</div>
                      <div className={s.tableScroll}>
                        <table className={s.dataTable}>
                          <thead>
                            <tr><th>Player</th><th>Chips</th><th>Days Inactive</th><th>Action</th></tr>
                          </thead>
                          <tbody>
                            {atRisk.map(p => (
                              <tr key={p.userId}>
                                <td style={{ fontWeight: 600 }}>{p.name}</td>
                                <td>{fmtChips(p.chipBalance)}</td>
                                <td style={{ color: '#F7C52A', fontWeight: 600 }}>{p.daysSinceActive}d</td>
                                <td><button onClick={() => { setWbTarget(p); setWbAmount('500'); }} className={`${s.btnGold} ${s.btnSmall}`}>🎁 Welcome Back</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Churned Players */}
                  {churned.length > 0 && (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>🔴 Churned Players ({churned.length})</div>
                      <div className={s.sectionSubtitle}>Inactive for 14+ days</div>
                      <div className={s.tableScroll}>
                        <table className={s.dataTable}>
                          <thead>
                            <tr><th>Player</th><th>Chips</th><th>Days Inactive</th><th>Action</th></tr>
                          </thead>
                          <tbody>
                            {churned.map(p => (
                              <tr key={p.userId}>
                                <td style={{ fontWeight: 600 }}>{p.name}</td>
                                <td>{fmtChips(p.chipBalance)}</td>
                                <td style={{ color: '#E41E3F', fontWeight: 600 }}>{p.daysSinceActive}d</td>
                                <td><button onClick={() => { setWbTarget(p); setWbAmount('1000'); }} className={`${s.btnGold} ${s.btnSmall}`}>🎁 Re-engage</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {atRisk.length === 0 && churned.length === 0 && (
                    <div className={s.emptyState}><span className={s.emptyIcon}>✅</span><span className={s.emptyText}>All players are actively engaged!</span></div>
                  )}
                </>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: CHIP FLOW                                   */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'chipflow' && (
            <>
              {!chipFlowLoaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[1,2,3,4].map(i => <div key={i} className={s.shimmerLine} style={{ height: '50px', borderRadius: '8px' }} />)}
                </div>
              ) : chipFlowEntries.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>💸</span><span className={s.emptyText}>No chip flow data for the last 7 days</span></div>
              ) : (
                <>
                  {/* Summary */}
                  <div className={s.statsGrid}>
                    <div className={s.statCard}>
                      <div className={s.statValueGreen}>{fmtChips(chipFlowEntries.reduce((sum, e) => sum + (e.in || 0), 0))}</div>
                      <div className={s.statLabel}>Total Inflow</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueRed}>{fmtChips(chipFlowEntries.reduce((sum, e) => sum + (e.out || 0), 0))}</div>
                      <div className={s.statLabel}>Total Outflow</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValue} style={{ color: chipFlowEntries.reduce((sum, e) => sum + (e.net || 0), 0) >= 0 ? '#31A24C' : '#E41E3F' }}>
                        {fmtChips(chipFlowEntries.reduce((sum, e) => sum + (e.net || 0), 0))}
                      </div>
                      <div className={s.statLabel}>Net Flow</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueBlue}>{fmt(chipFlowEntries.length)}</div>
                      <div className={s.statLabel}>Active Players</div>
                    </div>
                  </div>

                  {/* Flow Table */}
                  <div className={s.section}>
                    <div className={s.sectionTitle}>7-Day Player Chip Flow</div>
                    <div className={s.tableScroll}>
                      <table className={s.dataTable}>
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Chips In</th>
                            <th>Chips Out</th>
                            <th>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chipFlowEntries.map(e => (
                            <tr key={e.userId}>
                              <td style={{ fontWeight: 600 }}>{e.name}</td>
                              <td style={{ color: '#31A24C' }}>+{fmtChips(e.in)}</td>
                              <td style={{ color: '#E41E3F' }}>-{fmtChips(e.out)}</td>
                              <td style={{ fontWeight: 700, color: (e.net || 0) >= 0 ? '#31A24C' : '#E41E3F' }}>
                                {(e.net || 0) >= 0 ? '+' : ''}{fmtChips(e.net)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
