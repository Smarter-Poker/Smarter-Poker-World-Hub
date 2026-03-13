/* ═══════════════════════════════════════════════════════════════
   Club Arena XMTT — Native Hub Page (replaces iframe)
   Cross-club / multi-table tournament lobby
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
import s from '../../../src/styles/UnionDashboard.module.css';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};
const formatDate = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function StatusBadge({ status }) {
  const c = {
    registering: { bg: '#31A24C22', color: '#31A24C', label: 'REG OPEN' },
    running: { bg: '#F5A62322', color: '#F5A623', label: 'RUNNING' },
    completed: { bg: '#3A3B3C', color: '#B0B3B8', label: 'COMPLETE' },
    cancelled: { bg: '#FA383E22', color: '#FA383E', label: 'CANCELLED' },
  }[status] || { bg: '#3A3B3C', color: '#B0B3B8', label: status?.toUpperCase() || '—' };
  return <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', background: c.bg, color: c.color }}>{c.label}</span>;
}

export default function ClubArenaXMTTPage() {
  useTrainingBus('club-arena-xmtt');
  const router = useRouter();

  const [clubId, setClubId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [tournaments, setTournaments] = useState([]);
  const [filter, setFilter] = useState('all'); // all | registering | running | completed
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadTournaments = useCallback(async (cId) => {
    try {
      const res = await apiCall('/api/club-arena/tournaments', { action: 'list', clubId: cId });
      if (mountedRef.current) setTournaments(res.tournaments || []);
    } catch (err) {
      console.error('[xmtt] load fail:', err);
    }
  }, []);

  const loadDetail = useCallback(async (tournamentId, cId) => {
    try {
      setDetailLoading(true);
      const res = await apiCall('/api/club-arena/tournament-detail', { action: 'full', tournamentId, clubId: cId });
      if (mountedRef.current) setDetail(res);
    } catch (err) {
      console.error('[xmtt] detail fail:', err);
    } finally {
      if (mountedRef.current) setDetailLoading(false);
    }
  }, []);

  // Auth + init
  useEffect(() => {
    let cancelled = false;
    let authSub = null;

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
        await loadTournaments(targetClub);
        setLoading(false);
      } else if (!cancelled) {
        setError('No club found.');
        setLoading(false);
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
      authSub = subscription;
    })();

    return () => { cancelled = true; authSub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId, loadTournaments]);

  // Auto-poll tournament list every 30s
  useEffect(() => {
    if (!clubId) return;
    const iv = setInterval(() => loadTournaments(clubId), 30000);
    return () => clearInterval(iv);
  }, [clubId, loadTournaments]);

  // EventBus — instant refresh on tournament events
  useEffect(() => {
    if (!clubId) return;
    const refresh = () => {
      loadTournaments(clubId);
      if (selectedTournament) loadDetail(selectedTournament, clubId);
    };
    const events = ['TOURNAMENT_REGISTERED', 'TOURNAMENT_STARTED', 'TOURNAMENT_COMPLETE'];
    events.forEach(ev => eventBus.on(ev, refresh));
    return () => events.forEach(ev => eventBus.off(ev, refresh));
  }, [clubId, selectedTournament, loadTournaments, loadDetail]);

  // Auto-refresh detail panel every 15s when viewing a running tournament
  useEffect(() => {
    if (!selectedTournament || !clubId) return;
    const selected = tournaments.find(t => t.id === selectedTournament);
    if (!selected || selected.status !== 'running') return;
    const iv = setInterval(() => loadDetail(selectedTournament, clubId), 15000);
    return () => clearInterval(iv);
  }, [selectedTournament, clubId, tournaments, loadDetail]);

  // Refresh on tab visibility change
  useEffect(() => {
    if (!clubId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadTournaments(clubId);
        if (selectedTournament) loadDetail(selectedTournament, clubId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clubId, selectedTournament, loadTournaments, loadDetail]);

  // Register / Unregister
  const handleRegister = async (tournamentId) => {
    try {
      await apiCall('/api/club-arena/tournaments', { action: 'register', clubId, tournamentId });
      busEmit('TOURNAMENT_REGISTERED', { tournamentId, clubId });
      loadTournaments(clubId);
      if (selectedTournament === tournamentId) loadDetail(tournamentId, clubId);
    } catch (err) { setActionError(err.message); setTimeout(() => setActionError(null), 5000); }
  };

  const handleUnregister = async (tournamentId) => {
    try {
      await apiCall('/api/club-arena/tournaments', { action: 'unregister', clubId, tournamentId });
      busEmit('TOURNAMENT_REGISTERED', { tournamentId, clubId });
      loadTournaments(clubId);
      if (selectedTournament === tournamentId) loadDetail(tournamentId, clubId);
    } catch (err) { setActionError(err.message); setTimeout(() => setActionError(null), 5000); }
  };

  // Filter
  const filtered = filter === 'all' ? tournaments : tournaments.filter(t => t.status === filter);

  // MTT-only filter (XMTT = cross / multi-table tournaments)
  const mttTournaments = filtered.filter(t => t.type === 'mtt' || t.type === 'xmtt' || !t.type);

  if (loading) {
    return (
      <HubErrorBoundary name="XMTT">
        <SEOHead title="XMTT Tournament Lobby | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}>
          <div className={s.inner} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="ca-skeleton" style={{ height: '48px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1,2,3,4].map(i => <div key={i} className="ca-skeleton" style={{ height: '36px', flex: 1 }} />)}
            </div>
            {[1,2,3].map(i => <div key={i} className="ca-skeleton ca-skeleton-card" />)}
          </div>
        </div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="XMTT">
      <SEOHead title="XMTT Tournament Lobby | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>

          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : (
            <>

          {/* Header */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>🏆 XMTT Tournament Lobby</div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/tournaments" style={{ textDecoration: 'none' }}>
                <button className={s.btnGhost}>📋 All Tournaments</button>
              </Link>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}>
                <button className={s.btnGhost}>🏠 Lobby</button>
              </Link>
            </div>
          </div>

          {/* Filters */}
          <div className={s.tabs} style={{ marginBottom: '20px' }}>
            {['all', 'registering', 'running', 'completed'].map(f => (
              <button key={f} className={`${s.tab} ${filter === f ? s.tabActive : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && ` (${tournaments.filter(t => t.status === f).length})`}
              </button>
            ))}
          </div>

          {/* Action Error */}
          {actionError && (
            <div style={{ background: '#FA383E22', border: '1px solid #FA383E44', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#FA383E', fontSize: '13px' }}>{actionError}</span>
              <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#FA383E', cursor: 'pointer', fontSize: '12px', padding: '2px 8px' }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Tournament List */}
            <div style={{ flex: '1 1 400px' }}>
              {mttTournaments.length === 0 ? (
                <div className={s.emptyState} style={{ padding: '40px' }}>
                  <span className={s.emptyIcon}>🏆</span>
                  <span className={s.emptyText}>No MTT tournaments found for this filter.</span>
                  <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none', marginTop: '12px' }}>
                    <button className={s.btnPrimary} style={{ padding: '8px 20px', fontSize: '13px' }}>🏠 Go to Lobby</button>
                  </Link>
                </div>
              ) : mttTournaments.map(t => (
                <div
                  key={t.id}
                  onClick={() => { setSelectedTournament(t.id); loadDetail(t.id, clubId); }}
                  style={{
                    background: selectedTournament === t.id ? '#2a2b2d' : '#242526',
                    padding: '16px', borderRadius: '10px', marginBottom: '8px',
                    border: selectedTournament === t.id ? '1px solid #4599FF' : '1px solid #3A3B3C',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{t.name || 'Tournament'}</div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#B0B3B8', flexWrap: 'wrap' }}>
                    <span>💰 Buy-in: {fmtChips(t.buy_in)}</span>
                    <span>👥 {t.registered_count || 0} / {t.max_players || '∞'}</span>
                    <span>🕐 {formatDate(t.start_time || t.created_at)}</span>
                  </div>
                  {t.status === 'registering' && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                      <button onClick={(e) => { e.stopPropagation(); handleRegister(t.id); }} className={s.btnPrimary} style={{ fontSize: '12px', padding: '6px 14px', background: '#31A24C' }}>
                        Register
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleUnregister(t.id); }} className={s.btnGhost} style={{ fontSize: '12px', padding: '6px 14px', color: '#FA383E', border: '1px solid #FA383E' }}>
                        Unregister
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Detail Panel */}
            {selectedTournament && (
              <div style={{ flex: '1 1 350px', background: '#242526', borderRadius: '12px', border: '1px solid #3A3B3C', padding: '20px', position: 'sticky', top: '20px', alignSelf: 'flex-start' }}>
                {detailLoading ? (
                  <div style={{ textAlign: 'center', color: '#B0B3B8', padding: '40px' }}>Loading details...</div>
                ) : detail ? (
                  <>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>{detail.tournament?.name || 'Tournament Details'}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                      <div><div style={{ fontSize: '11px', color: '#65676B' }}>Buy-In</div><div style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(detail.tournament?.buy_in)}</div></div>
                      <div><div style={{ fontSize: '11px', color: '#65676B' }}>Prize Pool</div><div style={{ fontWeight: 700, color: '#31A24C' }}>{fmtChips(detail.tournament?.prize_pool)}</div></div>
                      <div><div style={{ fontSize: '11px', color: '#65676B' }}>Status</div><StatusBadge status={detail.tournament?.status} /></div>
                      <div><div style={{ fontSize: '11px', color: '#65676B' }}>Players</div><div style={{ fontWeight: 700 }}>{detail.registrations?.length || 0}</div></div>
                    </div>

                    {/* Registered Players */}
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#B0B3B8' }}>Registered Players</h4>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {(detail.registrations || []).length === 0 ? (
                        <div style={{ color: '#65676B', fontSize: '13px' }}>No registrations yet</div>
                      ) : (detail.registrations || []).map((r, i) => (
                        <div key={r.user_id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #3E4042', fontSize: '13px' }}>
                          <span>{r.display_name || r.username || 'Player'}</span>
                          <span style={{ color: '#F7C52A' }}>{fmtChips(r.chip_count || r.starting_chips)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#65676B', textAlign: 'center' }}>Select a tournament</div>
                )}
              </div>
            )}
          </div>
          </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
