/* ═══════════════════════════════════════════════════════════════
   Union Games — Native Hub Page (replaces iframe shell)
   3 Tabs: Tournaments | Tables | BBJ Pool
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall } from '../../../src/lib/club-arena/apiClient';
import { busEmit, eventBus } from '../../../src/engine/EventBus';
import s from '../../../src/styles/UnionDashboard.module.css';

const fmt = (n) => Number(n || 0).toLocaleString();
const timeAgo = (ts) => {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const statusClass = (status) => {
  const map = { running: s.statusRunning, scheduled: s.statusScheduled, registering: s.statusRunning, late_reg: s.statusRunning, paused: s.statusPaused, cancelled: s.statusClosed, complete: s.statusApproved, waiting: s.statusWaiting, closed: s.statusClosed, break: s.statusPaused, final_table: s.statusRunning };
  return map[status] || s.statusPending;
};

export default function UnionGamesPage() {
  useTrainingBus('arena-union-games');

  const [tab, setTab] = useState('tournaments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [unionId, setUnionId] = useState(null);

  // Tournament state
  const [tournaments, setTournaments] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [tournFilter, setTournFilter] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [tournForm, setTournForm] = useState({ hostClubId: '', name: '', buyIn: '1000', startingChips: '5000', maxPlayers: '100', scheduledStart: '', type: 'mtt', variant: 'nlhe', lateRegLevels: '6', rebuyEnabled: true, guaranteedPrize: '0', participatingClubIds: [] });
  const [tournDetails, setTournDetails] = useState(null);

  // Table state
  const [tables, setTables] = useState([]);
  const [tableFilter, setTableFilter] = useState('active');
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [tableForm, setTableForm] = useState({ clubId: '', name: '', gameVariant: 'nlhe', smallBlind: '1', bigBlind: '2', maxPlayers: '9', minBuyIn: '', maxBuyIn: '' });

  // BBJ state
  const [bbjData, setBbjData] = useState(null);

  // Search / Filter
  const [tournSearch, setTournSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 4000); return () => clearTimeout(t); } }, [success]);

  // ── Discover Union ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError('Please log in'); setLoading(false); return; }

        // 1. Check union_admins table first
        const { data: adminRow } = await supabase.from('union_admins').select('union_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        if (adminRow?.union_id) { setUnionId(adminRow.union_id); setLoading(false); return; }

        // 2. Fallback: check if user is the union owner
        const { data: ownerRow } = await supabase.from('unions').select('id').eq('owner_id', session.user.id).limit(1).maybeSingle();
        if (ownerRow?.id) { setUnionId(ownerRow.id); setLoading(false); return; }

        setError('You are not a union admin or owner.');
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Load Tournaments ──────────────────────────────────────
  const loadTournaments = useCallback(async (filter) => {
    if (!unionId) return;
    setLoading(true);
    try {
      const statusMap = {
        active: ['scheduled', 'registering', 'late_reg', 'running', 'paused', 'break', 'final_table'],
        scheduled: ['scheduled'],
        running: ['running', 'late_reg', 'break', 'paused', 'final_table'],
        completed: ['complete', 'cancelled'],
      };
      const res = await apiCall('/api/club-arena/union-games', {
        action: 'list_tournaments', unionId, status: statusMap[filter || tournFilter] || statusMap.active,
      });
      if (mountedRef.current) { setTournaments(res.tournaments || []); setClubs(res.clubs || []); }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [unionId, tournFilter]);

  // ── Load Tables ───────────────────────────────────────────
  const loadTables = useCallback(async (filter) => {
    if (!unionId) return;
    setLoading(true);
    try {
      const res = await apiCall('/api/club-arena/union-games', {
        action: 'list_tables', unionId, statusFilter: filter || tableFilter,
      });
      if (mountedRef.current) { setTables(res.tables || []); if (res.clubs) setClubs(res.clubs); }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [unionId, tableFilter]);

  // ── Load BBJ ──────────────────────────────────────────────
  const loadBBJ = useCallback(async () => {
    if (!unionId) return;
    try {
      const res = await apiCall('/api/club-arena/union-games', { action: 'get_bbj_status', unionId });
      if (mountedRef.current) setBbjData(res.data);
    } catch (_) {}
  }, [unionId]);

  // Tab-driven loading
  useEffect(() => {
    if (!unionId) return;
    if (tab === 'tournaments') loadTournaments();
    else if (tab === 'tables') loadTables();
    else if (tab === 'bbj') loadBBJ();
  }, [tab, unionId]);

  // ── Mutation Helper ───────────────────────────────────────
  const doAction = async (body, successMsg, { busEvent = null } = {}) => {
    setProcessing(true); setError(null);
    try {
      const res = await apiCall('/api/club-arena/union-games', { ...body, unionId });
      if (mountedRef.current) setSuccess(successMsg || res.message || 'Done');
      if (busEvent) busEmit(busEvent, { unionId, action: body?.action, ...res });
      return res;
    } catch (err) { if (mountedRef.current) setError(err.message); return null; }
    finally { if (mountedRef.current) setProcessing(false); }
  };

  // ── Load Tournament Details ───────────────────────────────
  const loadTournDetails = async (tournamentId) => {
    try {
      const res = await apiCall('/api/club-arena/union-games', { action: 'get_tournament_details', unionId, tournamentId });
      if (mountedRef.current) setTournDetails({ id: tournamentId, registrations: res.registrations || [] });
    } catch (err) { if (mountedRef.current) setError(err.message); }
  };

  // ── Auto-Refresh Polling (45s on active tab) ──────────────
  useEffect(() => {
    if (!unionId) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (tab === 'tournaments') loadTournaments();
      else if (tab === 'tables') loadTables();
    }, 45000);
    return () => clearInterval(interval);
  }, [unionId, tab, loadTournaments, loadTables]);

  // ── EventBus LISTENERS — auto-refresh on incoming events ──
  useEffect(() => {
    if (!unionId || typeof eventBus?.on !== 'function') return;
    const refreshTourns = () => { if (mountedRef.current) loadTournaments(); };
    const refreshTables = () => { if (mountedRef.current) loadTables(); };
    const unsubs = [
      eventBus.on('union:tournament-created', refreshTourns),
      eventBus.on('union:tournament-updated', refreshTourns),
      eventBus.on('union:table-created', refreshTables),
      eventBus.on('union:table-closed', refreshTables),
    ];
    return () => unsubs.forEach(fn => fn?.());
  }, [unionId, loadTournaments, loadTables]);

  // ── Filtered Lists (search) ───────────────────────────────
  const filteredTournaments = useMemo(() => {
    if (!tournSearch.trim()) return tournaments;
    const q = tournSearch.toLowerCase();
    return tournaments.filter(t => t.name?.toLowerCase().includes(q) || t.status?.includes(q));
  }, [tournaments, tournSearch]);

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter(t => t.name?.toLowerCase().includes(q) || t.stakes?.includes(q) || t.game_type?.toLowerCase().includes(q));
  }, [tables, tableSearch]);

  if (loading && !unionId) {
    return (
      <HubErrorBoundary name="Union Games">
        <SEOHead title="Union Games | Smarter.Poker" /><UniversalHeader />
        <div className={s.container}><div className={s.loading}>Loading Union Games...</div></div>
      </HubErrorBoundary>
    );
  }
  if (error && !unionId) {
    return (
      <HubErrorBoundary name="Union Games">
        <SEOHead title="Union Games | Smarter.Poker" /><UniversalHeader />
        <div className={s.container}><div className={s.inner}><div className={s.error}>{error}</div></div></div>
      </HubErrorBoundary>
    );
  }

  const clubMap = {};
  clubs.forEach(c => { clubMap[c.id] = c; });

  return (
    <HubErrorBoundary name="Union Games">
      <SEOHead title="Union Games | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {error && <div className={s.error}>{error}</div>}
          {success && <div className={s.successMsg}>{success}</div>}

          <div className={s.pageHeader}>
            <div className={s.pageTitle}>Union Games</div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/union-dashboard" style={{ textDecoration: 'none' }}><button className={s.btnPrimary}>📊 Dashboard</button></Link>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
            </div>
          </div>

          {/* Tabs */}
          <div className={s.tabs}>
            {[
              { id: 'tournaments', label: `Tournaments (${tournaments.length})` },
              { id: 'tables', label: `Tables (${tables.length})` },
              { id: 'bbj', label: 'BBJ Pool' },
            ].map(t => (
              <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ══════════════════ TOURNAMENTS TAB ═══════════════ */}
          {tab === 'tournaments' && (
            <>
              <div className={s.formRow} style={{ marginBottom: 16 }}>
                <div className={s.formGroup} style={{ maxWidth: 200 }}>
                  <select className={s.formSelect} value={tournFilter} onChange={e => { setTournFilter(e.target.value); loadTournaments(e.target.value); }}>
                    <option value="active">Active</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className={s.formGroup} style={{ maxWidth: 250 }}>
                  <input className={s.formInput} value={tournSearch} onChange={e => setTournSearch(e.target.value)} placeholder="Search tournaments..." />
                </div>
                <button className={s.btnPrimary} onClick={() => setShowCreate(!showCreate)}>
                  {showCreate ? 'Cancel' : '+ Create Tournament'}
                </button>
                <button className={s.btnGhost} onClick={() => loadTournaments()} disabled={loading}>Refresh</button>
              </div>

              {/* Create Tournament Form */}
              {showCreate && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Create Tournament</div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Host Club</label>
                      <select className={s.formSelect} value={tournForm.hostClubId} onChange={e => setTournForm(f => ({ ...f, hostClubId: e.target.value }))}>
                        <option value="">Select club...</option>
                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Name</label>
                      <input className={s.formInput} value={tournForm.name} onChange={e => setTournForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sunday Special" />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Type</label>
                      <select className={s.formSelect} value={tournForm.type} onChange={e => setTournForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="mtt">MTT</option>
                        <option value="sng">Sit & Go</option>
                        <option value="xmtt">Cross-Club (XMTT)</option>
                      </select>
                    </div>
                  </div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Buy-in</label>
                      <input className={s.formInput} type="number" min="0" value={tournForm.buyIn} onChange={e => setTournForm(f => ({ ...f, buyIn: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Starting Chips</label>
                      <input className={s.formInput} type="number" min="100" value={tournForm.startingChips} onChange={e => setTournForm(f => ({ ...f, startingChips: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Max Players</label>
                      <input className={s.formInput} type="number" min="2" max="5000" value={tournForm.maxPlayers} onChange={e => setTournForm(f => ({ ...f, maxPlayers: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Guarantee</label>
                      <input className={s.formInput} type="number" min="0" value={tournForm.guaranteedPrize} onChange={e => setTournForm(f => ({ ...f, guaranteedPrize: e.target.value }))} />
                    </div>
                  </div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Scheduled Start</label>
                      <input className={s.formInput} type="datetime-local" value={tournForm.scheduledStart} onChange={e => setTournForm(f => ({ ...f, scheduledStart: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Variant</label>
                      <select className={s.formSelect} value={tournForm.variant} onChange={e => setTournForm(f => ({ ...f, variant: e.target.value }))}>
                        <option value="nlhe">No Limit Hold'em</option>
                        <option value="plo">Pot Limit Omaha</option>
                        <option value="nlhe_shortdeck">Short Deck</option>
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Late Reg Levels</label>
                      <input className={s.formInput} type="number" min="0" max="20" value={tournForm.lateRegLevels} onChange={e => setTournForm(f => ({ ...f, lateRegLevels: e.target.value }))} />
                    </div>
                  </div>

                  {/* XMTT Club Selection */}
                  {tournForm.type === 'xmtt' && (
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Participating Clubs</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                          {clubs.map(c => {
                            const selected = tournForm.participatingClubIds.includes(c.id);
                            return (
                              <button key={c.id} className={selected ? s.btnSuccess : s.btnGhost} style={{ fontSize: 12 }}
                                onClick={() => setTournForm(f => ({ ...f, participatingClubIds: selected ? f.participatingClubIds.filter(id => id !== c.id) : [...f.participatingClubIds, c.id] }))}>
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <button className={s.btnPrimary} disabled={processing || !tournForm.hostClubId || !tournForm.name.trim()} onClick={async () => {
                    const start = tournForm.scheduledStart ? new Date(tournForm.scheduledStart).toISOString() : undefined;
                    const res = await doAction({
                      action: 'create_tournament',
                      hostClubId: tournForm.hostClubId,
                      name: tournForm.name.trim(),
                      type: tournForm.type,
                      variant: tournForm.variant,
                      buyIn: parseInt(tournForm.buyIn) || 1000,
                      startingChips: parseInt(tournForm.startingChips) || 5000,
                      maxPlayers: parseInt(tournForm.maxPlayers) || 100,
                      lateRegLevels: parseInt(tournForm.lateRegLevels) || 6,
                      rebuyEnabled: tournForm.rebuyEnabled,
                      guaranteedPrize: parseInt(tournForm.guaranteedPrize) || 0,
                      scheduledStart: start,
                      participatingClubIds: tournForm.type === 'xmtt' ? tournForm.participatingClubIds : undefined,
                    }, 'Tournament created', { busEvent: 'union:tournament-created' });
                    if (res) { setShowCreate(false); loadTournaments(); }
                  }}>Create Tournament</button>
                </div>
              )}

              {/* Tournament List */}
              {loading ? <div className={s.loading}>Loading tournaments...</div> : (
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead><tr>
                      <th>Name</th><th>Club</th><th>Status</th><th>Type</th><th>Buy-in</th><th>Players</th><th>Prize</th><th>Start</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {filteredTournaments.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td>{clubMap[t.club_id]?.name || 'Unknown'}</td>
                          <td><span className={`${s.statusBadge} ${statusClass(t.status)}`}>{t.status}</span></td>
                          <td>{t.settings?.tournamentType || t.type || 'mtt'}</td>
                          <td>{fmt(t.buy_in)}</td>
                          <td>{fmt(t.registered_count)}/{fmt(t.max_players)}</td>
                          <td style={{ color: '#F7C52A' }}>{fmt(t.prize_pool || t.guaranteed_prize)}</td>
                          <td>{t.scheduled_start ? new Date(t.scheduled_start).toLocaleString() : '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {t.status === 'scheduled' && (
                                <>
                                  <button className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                    const res = await doAction({ action: 'open_registration', tournamentId: t.id }, 'Registration opened', { busEvent: 'union:tournament-updated' });
                                    if (res) loadTournaments();
                                  }}>Open Reg</button>
                                  <button className={`${s.btnPrimary} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                    const res = await doAction({ action: 'start_tournament', tournamentId: t.id }, 'Tournament started', { busEvent: 'union:tournament-updated' });
                                    if (res) loadTournaments();
                                  }}>Start</button>
                                </>
                              )}
                              {['registering', 'late_reg'].includes(t.status) && (
                                <button className={`${s.btnPrimary} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                  const res = await doAction({ action: 'start_tournament', tournamentId: t.id }, 'Tournament started', { busEvent: 'union:tournament-updated' });
                                  if (res) loadTournaments();
                                }}>Start</button>
                              )}
                              {['running', 'late_reg', 'final_table'].includes(t.status) && (
                                <button className={`${s.btnGold} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                  const res = await doAction({ action: 'pause_tournament', tournamentId: t.id }, 'Paused', { busEvent: 'union:tournament-updated' });
                                  if (res) loadTournaments();
                                }}>Pause</button>
                              )}
                              {t.status === 'paused' && (
                                <button className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                  const res = await doAction({ action: 'resume_tournament', tournamentId: t.id }, 'Resumed', { busEvent: 'union:tournament-updated' });
                                  if (res) loadTournaments();
                                }}>Resume</button>
                              )}
                              {!['complete', 'cancelled'].includes(t.status) && (
                                <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                  if (!confirm(`Cancel tournament "${t.name}"? Players will be refunded.`)) return;
                                  const res = await doAction({ action: 'cancel_tournament', tournamentId: t.id }, 'Cancelled', { busEvent: 'union:tournament-updated' });
                                  if (res) loadTournaments();
                                }}>Cancel</button>
                              )}
                              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => loadTournDetails(t.id)}>Details</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && filteredTournaments.length === 0 && (
                <div className={s.emptyState}><span className={s.emptyIcon}>🏆</span><div className={s.emptyText}>{tournSearch ? 'No tournaments match your search' : `No ${tournFilter} tournaments`}</div></div>
              )}

              {/* Tournament Details Modal */}
              {tournDetails && (
                <div className={s.modalOverlay} onClick={() => setTournDetails(null)}>
                  <div className={s.modal} onClick={e => e.stopPropagation()}>
                    <div className={s.modalTitle}>Tournament Registrations</div>
                    <div className={s.tableScroll}>
                      <table className={s.dataTable}>
                        <thead><tr><th>Player</th><th>Status</th><th>Pos.</th><th>Payout</th></tr></thead>
                        <tbody>
                          {tournDetails.registrations.map((r, i) => (
                            <tr key={i}>
                              <td>{r.display_name || r.user_id?.slice(0, 8)}</td>
                              <td><span className={`${s.statusBadge} ${statusClass(r.status)}`}>{r.status}</span></td>
                              <td>{r.finish_position || '-'}</td>
                              <td>{r.payout_amount ? fmt(r.payout_amount) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {tournDetails.registrations.length === 0 && <div className={s.emptyState}><div className={s.emptyText}>No registrations yet</div></div>}
                    <button className={s.btnGhost} onClick={() => setTournDetails(null)} style={{ marginTop: 12 }}>Close</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════ TABLES TAB ════════════════════ */}
          {tab === 'tables' && (
            <>
              <div className={s.formRow} style={{ marginBottom: 16 }}>
                <div className={s.formGroup} style={{ maxWidth: 200 }}>
                  <select className={s.formSelect} value={tableFilter} onChange={e => { setTableFilter(e.target.value); loadTables(e.target.value); }}>
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <div className={s.formGroup} style={{ maxWidth: 250 }}>
                  <input className={s.formInput} value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Search tables by name/stakes..." />
                </div>
                <button className={s.btnPrimary} onClick={() => setShowCreateTable(!showCreateTable)}>
                  {showCreateTable ? 'Cancel' : '+ Create Table'}
                </button>
                <button className={s.btnGhost} onClick={() => loadTables()} disabled={loading}>Refresh</button>
              </div>

              {/* Create Table Form */}
              {showCreateTable && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Create Cash Table</div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Club</label>
                      <select className={s.formSelect} value={tableForm.clubId} onChange={e => setTableForm(f => ({ ...f, clubId: e.target.value }))}>
                        <option value="">Select club...</option>
                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Table Name</label>
                      <input className={s.formInput} value={tableForm.name} onChange={e => setTableForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. High Stakes NLH" />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Game</label>
                      <select className={s.formSelect} value={tableForm.gameVariant} onChange={e => setTableForm(f => ({ ...f, gameVariant: e.target.value }))}>
                        <option value="nlhe">No Limit Hold'em</option>
                        <option value="plo">Pot Limit Omaha</option>
                        <option value="nlhe_shortdeck">Short Deck</option>
                      </select>
                    </div>
                  </div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Small Blind</label>
                      <input className={s.formInput} type="number" min="1" value={tableForm.smallBlind} onChange={e => setTableForm(f => ({ ...f, smallBlind: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Big Blind</label>
                      <input className={s.formInput} type="number" min="1" value={tableForm.bigBlind} onChange={e => setTableForm(f => ({ ...f, bigBlind: e.target.value }))} />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Max Seats</label>
                      <input className={s.formInput} type="number" min="2" max="10" value={tableForm.maxPlayers} onChange={e => setTableForm(f => ({ ...f, maxPlayers: e.target.value }))} />
                    </div>
                  </div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Min Buy-in (BB)</label>
                      <input className={s.formInput} type="number" min="10" value={tableForm.minBuyIn} onChange={e => setTableForm(f => ({ ...f, minBuyIn: e.target.value }))} placeholder="40" />
                    </div>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Max Buy-in (BB)</label>
                      <input className={s.formInput} type="number" min="10" value={tableForm.maxBuyIn} onChange={e => setTableForm(f => ({ ...f, maxBuyIn: e.target.value }))} placeholder="200" />
                    </div>
                  </div>
                  <button className={s.btnPrimary} disabled={processing || !tableForm.clubId} onClick={async () => {
                    const res = await doAction({
                      action: 'create_table',
                      clubId: tableForm.clubId,
                      name: tableForm.name || undefined,
                      gameVariant: tableForm.gameVariant,
                      smallBlind: parseInt(tableForm.smallBlind) || 1,
                      bigBlind: parseInt(tableForm.bigBlind) || 2,
                      maxPlayers: parseInt(tableForm.maxPlayers) || 9,
                      minBuyIn: tableForm.minBuyIn ? parseInt(tableForm.minBuyIn) : undefined,
                      maxBuyIn: tableForm.maxBuyIn ? parseInt(tableForm.maxBuyIn) : undefined,
                    }, 'Table created', { busEvent: 'union:table-created' });
                    if (res) { setShowCreateTable(false); loadTables(); }
                  }}>Create Table</button>
                </div>
              )}

              {/* Tables List */}
              {loading ? <div className={s.loading}>Loading tables...</div> : (
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead><tr>
                      <th>Name</th><th>Club</th><th>Status</th><th>Game</th><th>Stakes</th><th>Players</th><th>Buy-in</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                      {filteredTables.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td>{clubMap[t.club_id]?.name || 'Unknown'}</td>
                          <td><span className={`${s.statusBadge} ${statusClass(t.status)}`}>{t.status}</span></td>
                          <td>{(t.game_type || t.game_variant || 'nlhe').toUpperCase()}</td>
                          <td>{t.small_blind}/{t.big_blind}</td>
                          <td>{t.current_players || 0}/{t.max_players || 9}</td>
                          <td>{fmt(t.min_buyin || t.min_buy_in)}-{fmt(t.max_buyin || t.max_buy_in)}</td>
                          <td>
                            {['waiting', 'running'].includes(t.status) && (t.current_players || 0) === 0 && (
                              <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                if (!confirm(`Close table "${t.name}"?`)) return;
                                const res = await doAction({ action: 'close_table', tableId: t.id }, 'Table closed', { busEvent: 'union:table-closed' });
                                if (res) loadTables();
                              }}>Close</button>
                            )}
                            {(t.current_players || 0) > 0 && <span style={{ fontSize: 11, color: '#B0B3B8' }}>Players seated</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && filteredTables.length === 0 && (
                <div className={s.emptyState}><span className={s.emptyIcon}>🃏</span><div className={s.emptyText}>{tableSearch ? 'No tables match your search' : `No ${tableFilter} tables`}</div></div>
              )}
            </>
          )}

          {/* ══════════════════ BBJ TAB ═══════════════════════ */}
          {tab === 'bbj' && (
            <>
              {bbjData ? (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Bad Beat Jackpot</div>
                  <div className={s.walletGrid}>
                    <div className={s.walletBBJ}>
                      <div className={s.walletLabel}>BBJ Pool</div>
                      <div className={s.walletAmount}>{fmt(bbjData.pool_balance || bbjData.total)}</div>
                    </div>
                    {bbjData.backup_balance !== undefined && (
                      <div className={s.walletPromo}>
                        <div className={s.walletLabel}>Backup Pool</div>
                        <div className={s.walletAmount}>{fmt(bbjData.backup_balance)}</div>
                      </div>
                    )}
                  </div>
                  {bbjData.last_hit && (
                    <div style={{ fontSize: 14, color: '#B0B3B8', marginTop: 12 }}>
                      Last hit: {new Date(bbjData.last_hit).toLocaleDateString()} — {fmt(bbjData.last_hit_amount)} chips
                    </div>
                  )}
                </div>
              ) : (
                <div className={s.emptyState}>
                  <span className={s.emptyIcon}>💎</span>
                  <div className={s.emptyText}>BBJ data not available. The RPC may not be deployed yet.</div>
                  <button className={s.btnGhost} onClick={loadBBJ} style={{ marginTop: 12 }}>Retry</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </HubErrorBoundary>
  );
}
