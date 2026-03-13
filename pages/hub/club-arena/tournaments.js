/* ═══════════════════════════════════════════════════════════════
   Club Arena Tournaments — Native Hub Page (replaces iframe shell)
   Master/Detail view for MTTs & SNGs
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import { eventBus } from '../../../src/engine/EventBus';
import CreateTournamentModal from '../../../src/components/club-arena/CreateTournamentModal';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};
const formatDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const STATUS_MAP = {
  scheduled: { label: 'Scheduled', color: '#B0B3B8', bg: '#3A3B3C' },
  registering: { label: 'Registering', color: '#F7C52A', bg: 'rgba(247,197,42,0.15)' },
  running: { label: 'Running', color: '#31A24C', bg: 'rgba(49,162,76,0.15)' },
  late_reg: { label: 'Late Reg', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
  final_table: { label: 'Final Table', color: '#E41E3F', bg: 'rgba(228,30,63,0.15)' },
  completed: { label: 'Completed', color: '#E4E6EB', bg: '#4E4F50' },
  cancelled: { label: 'Cancelled', color: '#FA383E', bg: 'rgba(250,56,62,0.15)' },
};

// ── Detail Pane Component ───────────────────────────────────
function TournamentDetailPane({ tourn, clubId, clubRole, onBack, onRefreshList, currentUserId }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiGet(`/api/club-arena/tournament-detail?clubId=${clubId}&tournamentId=${tourn.id}`);
      setDetails(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clubId, tourn.id]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  // Handle auto-clear success
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // Registration actions
  const doAction = async (actionName) => {
    setProcessing(true);
    setError(null);
    try {
      const res = await apiCall('/api/club-arena/tournaments', { action: actionName, clubId, tournamentId: tourn.id });
      setSuccessMsg(`Successfully ${actionName}ed!`);
      loadDetails();
      onRefreshList();
    } catch (err) {
      setLoading(false);
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const isRegged = details?.registrations?.some(r => r.user_id === currentUserId && r.status === 'registered');
  const isAdmin = clubRole === 'owner' || clubRole === 'admin' || clubRole === 'manager';

  return (
    <div className={s.section} style={{ animation: 'fadeIn 0.2s ease-out' }}>
      <button onClick={onBack} className={s.btnGhost} style={{ marginBottom: '16px' }}>← Back to Tournaments</button>
      
      {error && <div className={s.error} style={{ marginBottom: '16px' }}>{error}</div>}
      {successMsg && <div className={s.successMsg} style={{ marginBottom: '16px' }}>{successMsg}</div>}

      <div style={{ background: '#242526', padding: '24px', borderRadius: '12px', border: '1px solid #3A3B3C', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, background: '#3A3B3C', color: '#E4E6EB', padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                {tourn.variant} {tourn.type}
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_MAP[tourn.status]?.color, background: STATUS_MAP[tourn.status]?.bg, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                {STATUS_MAP[tourn.status]?.label || tourn.status}
              </span>
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#E4E6EB' }}>{tourn.name}</h2>
            <div style={{ color: '#B0B3B8', fontSize: '14px' }}>
              Buy-in: <strong style={{ color: '#F7C52A' }}>{fmtChips(tourn.buy_in)}</strong> | 
              Starting Chips: <strong>{fmt(tourn.starting_chips)}</strong> | 
              Players: <strong>{tourn.registered_count} {tourn.max_players ? `/ ${tourn.max_players}` : ''}</strong>
            </div>
            {tourn.scheduled_start && tourn.status === 'scheduled' && (
              <div style={{ color: '#4599FF', fontSize: '13px', marginTop: '8px', fontWeight: 600 }}>
                🕒 Starts {formatDate(tourn.scheduled_start)}
              </div>
            )}
            {tourn.settings?.short_description && (
              <div style={{ marginTop: '12px', color: '#94A3B8', fontSize: '13px', maxWidth: '600px', lineHeight: 1.4 }}>
                {tourn.settings.short_description}
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
            {tourn.status === 'registering' || tourn.status === 'scheduled' || tourn.status === 'late_reg' ? (
              isRegged ? (
                <button onClick={() => doAction('unregister')} disabled={processing || tourn.status !== 'registering' && tourn.status !== 'scheduled'} className={s.btnGhost} style={{ border: '1px solid #FA383E', color: '#FA383E' }}>
                  {processing ? '...' : 'Unregister'}
                </button>
              ) : (
                <button onClick={() => doAction('register')} disabled={processing || tourn.registered_count >= (tourn.max_players || 999)} className={s.btnPrimary} style={{ background: '#31A24C', color: '#fff' }}>
                  {processing ? '...' : tourn.registered_count >= (tourn.max_players || 999) ? 'Full' : 'Register'}
                </button>
              )
            ) : null}

            {isAdmin && (tourn.status === 'scheduled' || tourn.status === 'registering') && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button onClick={() => doAction('start')} disabled={processing || tourn.registered_count < 2} className={s.btnGhost} style={{ flex: 1, color: '#31A24C', borderColor: '#31A24C' }}>Launch</button>
                <button onClick={() => doAction('cancel')} disabled={processing} className={s.btnGhost} style={{ flex: 1, color: '#FA383E', borderColor: '#FA383E' }}>Cancel</button>
              </div>
            )}
            {isAdmin && tourn.type === 'spin' && tourn.status === 'registering' && (
              <button onClick={() => doAction('spin_draw_multiplier')} disabled={processing} className={s.btnGhost} style={{ color: '#F7C52A', borderColor: '#F7C52A', marginTop: '8px' }}>
                Draw Multiplier
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details Area */}
      {loading ? (
        <div className={s.loading} style={{ padding: '40px' }}>Loading Details...</div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          
          {/* Left Col: Registrations */}
          <div style={{ flex: '1 1 500px' }}>
            <h3 style={{ fontSize: '18px', margin: '0 0 16px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span>Players ({details?.registrations?.length || 0})</span>
              {details?.stats && (
                <span style={{ fontSize: '13px', color: '#B0B3B8', fontWeight: 500 }}>
                  Rebuys: {details.stats.totalRebuys} | Add-ons: {details.stats.totalAddons}
                </span>
              )}
            </h3>
            
            {details?.registrations?.length === 0 ? (
              <div className={s.emptyState} style={{ padding: '32px' }}><span className={s.emptyIcon}>👤</span><span className={s.emptyText}>No players registered yet.</span></div>
            ) : (
              <div className={s.tableScroll}>
                <table className={s.dataTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Rank</th>
                      <th>Player</th>
                      <th style={{ textAlign: 'center' }}>Rebuys</th>
                      <th style={{ textAlign: 'right' }}>Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.registrations.map((r, i) => {
                      const p = details.profiles?.[r.user_id] || {};
                      const isActive = r.status === 'registered' || r.status === 'playing';
                      return (
                        <tr key={r.user_id} style={{ opacity: isActive ? 1 : 0.6 }}>
                          <td>{r.finish_position || (isActive ? '-' : 'Out')}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {p.avatar_url ? (
                                <img src={p.avatar_url} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {(p.display_name || '?')[0].toUpperCase()}
                                </div>
                              )}
                              <span style={{ fontWeight: r.user_id === currentUserId ? 700 : 500, color: r.user_id === currentUserId ? '#F7C52A' : '#E4E6EB' }}>
                                {p.display_name || 'Unknown'} {r.user_id === currentUserId && '(You)'}
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', color: '#B0B3B8' }}>{r.rebuys_used > 0 ? r.rebuys_used : '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#31A24C' }}>{r.payout_amount ? fmtChips(r.payout_amount) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Col: Settings & Bounty */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Bounty State */}
            {details?.bountyState && (
              <div style={{ background: '#242526', padding: '20px', borderRadius: '12px', border: '1px solid rgba(247,197,42,0.3)' }}>
                <h3 style={{ fontSize: '16px', margin: '0 0 16px 0', color: '#F7C52A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🎯 Bounty Tracker {details.bountyState.isHistorical && '(Final)'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#B0B3B8' }}>Bounty Pool</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{fmtChips(details.bountyState.totalBountyPool)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#B0B3B8' }}>Awarded</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#31A24C' }}>{fmtChips(details.bountyState.totalBountiesAwarded)}</div>
                  </div>
                </div>
                {details.bountyState.mysteryPhaseActive && (
                  <div style={{ background: 'rgba(168,85,247,0.1)', padding: '12px', borderLeft: '3px solid #a855f7', borderRadius: '4px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#a855f7' }}>✨ Mystery Phase Active!</div>
                    <div style={{ fontSize: '12px', color: '#E4E6EB', marginTop: '4px' }}>Remaining Envelopes: {details.bountyState.mysteryEnvelopesRemaining || '?'}</div>
                  </div>
                )}
              </div>
            )}

            {/* Structure Summary */}
            <div style={{ background: '#242526', padding: '20px', borderRadius: '12px', border: '1px solid #3A3B3C' }}>
              <h3 style={{ fontSize: '16px', margin: '0 0 16px 0' }}>Structure</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Speed</span>
                  <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{tourn.settings?.blind_structure_speed || 'Standard'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Blinds Up</span>
                  <span style={{ fontWeight: 600 }}>{tourn.settings?.blinds_up_minutes || 3} min</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Action Time</span>
                  <span style={{ fontWeight: 600 }}>{tourn.settings?.action_time || 15} sec</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Late Reg Level</span>
                  <span style={{ fontWeight: 600 }}>Level {tourn.late_reg_levels || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Rebuys</span>
                  <span style={{ fontWeight: 600 }}>{tourn.rebuy_enabled ? `${tourn.rebuy_levels} max (${fmtChips(tourn.rebuy_cost)})` : 'None'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#B0B3B8' }}>Add-on</span>
                  <span style={{ fontWeight: 600 }}>{tourn.addon_enabled ? `${fmtChips(tourn.addon_chips)} chips (${fmtChips(tourn.addon_cost)})` : 'None'}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default function ClubArenaTournamentsPage() {
  useTrainingBus('club-arena-tournaments');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('active'); // active | completed | my_events
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [role, setRole] = useState('player');
  const [userId, setUserId] = useState(null);

  const [selectedTourn, setSelectedTourn] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Load Tournaments ───────────────────────────────────────
  const loadTournaments = useCallback(async (cId) => {
    try {
      setLoading(true);
      setError(null);
      const targetClubId = cId || clubId;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }
      
      const res = await apiCall('/api/club-arena/tournaments', { action: 'list', clubId: targetClubId });
      if (mountedRef.current) {
        setTournaments(res.tournaments || []);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId]);

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      setUserId(session.user.id);
      const qClub = router.query.club || router.query.clubId;
      
      const { supabase } = await import('../../../src/lib/supabase');
      let targetClub = qClub;
      
      if (!targetClub) {
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        targetClub = mem?.club_id;
      }
      
      if (targetClub && !cancelled) {
        setClubId(targetClub);
        // Get role
        const { data: memRole } = await supabase.from('club_members').select('role').eq('club_id', targetClub).eq('user_id', session.user.id).maybeSingle();
        if (memRole) setRole(memRole.role);
        
        loadTournaments(targetClub);
      } else if (!cancelled) {
        setError('No club found.'); setLoading(false);
      }
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
  }, [router.query.club, router.query.clubId]);

  // ── EventBus ───────────────────────────────────────────────
  useEffect(() => {
    const refresh = () => { if (clubId) loadTournaments(clubId); };
    // Listen for TOURNAMENT_STARTED or TOURNAMENT_REGISTERED events if added to eventBus globally later
    // For now, poll every 60s to keep lobby fresh
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [clubId, loadTournaments]);

  // ── Filtering ──────────────────────────────────────────────
  const filtered = tournaments.filter(t => {
    if (tab === 'active') return ['scheduled', 'registering', 'running', 'late_reg', 'final_table'].includes(t.status);
    if (tab === 'completed') return ['completed', 'cancelled'].includes(t.status);
    return true; // 'my_events' logic requires server-side info (simplified here for native port, could query reg table)
  });

  const isAdmin = role === 'owner' || role === 'admin' || role === 'manager';

  // ── Loading / Login ────────────────────────────────────────
  if (loading && tournaments.length === 0) {
    return (
      <HubErrorBoundary name="Tournaments">
        <SEOHead title="Tournaments | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Loading Tournaments...</div></div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="Tournaments">
      <SEOHead title="Tournaments | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Login ──────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access Tournaments.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              🏆 Tournaments
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              {isAdmin && !selectedTourn && (
                <button onClick={() => setShowCreateModal(true)} className={s.btnPrimary} style={{ background: '#31A24C' }}>+ Create</button>
              )}
              <button onClick={() => loadTournaments(clubId)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Main View Switcher ────────────────────────────── */}
          {selectedTourn ? (
            <TournamentDetailPane 
              tourn={selectedTourn} 
              clubId={clubId} 
              clubRole={role} 
              currentUserId={userId}
              onBack={() => setSelectedTourn(null)} 
              onRefreshList={() => loadTournaments(clubId)} 
            />
          ) : (
            <>
              {/* ── Tabs ──────────────────────────────────────────── */}
              <div className={s.tabs}>
                <button className={`${s.tab} ${tab === 'active' ? s.tabActive : ''}`} onClick={() => setTab('active')}>Active</button>
                <button className={`${s.tab} ${tab === 'completed' ? s.tabActive : ''}`} onClick={() => setTab('completed')}>Completed</button>
              </div>

              {/* ── Tournament Grid ──────────────────────────────── */}
              <div className={s.section}>
                {filtered.length === 0 ? (
                  <div className={s.emptyState}>
                    <span className={s.emptyIcon}>🏆</span>
                    <span className={s.emptyText}>No tournaments found.</span>
                  </div>
                ) : (
                  <div className={s.cardGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {filtered.map(t => {
                      const stat = STATUS_MAP[t.status] || { label: t.status, color: '#E4E6EB', bg: '#3A3B3C' };
                      return (
                        <div key={t.id} onClick={() => setSelectedTourn(t)} className={s.card} style={{
                          cursor: 'pointer', transition: 'transform 0.2s, background 0.2s', padding: '0', overflow: 'hidden',
                          border: `1px solid ${t.status === 'running' ? 'rgba(49,162,76,0.3)' : '#3E4042'}`,
                        }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'none'}>
                          
                          {/* Card Header */}
                          <div style={{ padding: '16px', borderBottom: '1px solid #3E4042', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, background: '#3A3B3C', color: '#E4E6EB', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                  {t.variant} {t.type}
                                </span>
                                {t.settings?.bounty_type && t.settings.bounty_type !== 'none' && (
                                  <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(247,197,42,0.15)', color: '#F7C52A', padding: '3px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                    🎯 {t.settings.bounty_type}
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: stat.color, background: stat.bg, padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>
                                {stat.label}
                              </span>
                            </div>
                            <h3 style={{ margin: 0, fontSize: '18px', color: '#E4E6EB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.name}
                            </h3>
                          </div>

                          {/* Card Body */}
                          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: '11px', color: '#B0B3B8', textTransform: 'uppercase', marginBottom: '2px' }}>Buy-in</div>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#F7C52A' }}>{fmtChips(t.buy_in)}</div>
                              </div>
                              {t.guaranteed_prize > 0 && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '11px', color: '#B0B3B8', textTransform: 'uppercase', marginBottom: '2px' }}>GTD Prize</div>
                                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#31A24C' }}>{fmtChips(t.guaranteed_prize)}</div>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #3E4042', paddingTop: '12px' }}>
                              <div>
                                <div style={{ fontSize: '11px', color: '#B0B3B8' }}>Players</div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: '#E4E6EB' }}>{t.registered_count} <span style={{ color: '#65676B' }}>/ {t.max_players || '∞'}</span></div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', color: '#B0B3B8' }}>{t.status === 'scheduled' ? 'Starts' : 'Started'}</div>
                                <div style={{ fontSize: '13px', color: '#E4E6EB' }}>{t.scheduled_start ? formatDate(t.scheduled_start) : formatDate(t.started_at)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Create Modal ─────────────────────────────────── */}
          {showCreateModal && (
            <CreateTournamentModal
              club={{ id: clubId }}
              onClose={() => setShowCreateModal(false)}
              apiCall={apiCall}
              onCreated={(res) => {
                setShowCreateModal(false);
                loadTournaments(clubId);
                // Optionally open the new tournament details
                if (res?.tournament) setSelectedTourn(res.tournament);
              }}
            />
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
