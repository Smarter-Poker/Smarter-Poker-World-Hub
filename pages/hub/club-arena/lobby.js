/* ═══════════════════════════════════════════════════════════════
   Club Arena Lobby — Native Hub Page (replaces iframe shell)
   Table grid, BBJ ticker, waitlist, announcements
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiGet } from '../../../src/lib/club-arena/apiClient';
import { eventBus } from '../../../src/engine/EventBus';
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
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const GAME_LABELS = {
  nlh: 'NLH', plo4: 'PLO4', plo5: 'PLO5', flh: 'FLH', nlh_bomb: 'Bomb Pot',
  nlh_6plus: '6+', nlh_ante: 'Ante', sdh: 'Short Deck', ofc: 'OFC',
};
const STATUS_COLORS = {
  active: '#31A24C', playing: '#31A24C', waiting: '#F5A623',
  between_hands: '#4599FF', inactive: '#6B7280', closed: '#FA383E',
};

export default function ClubArenaLobbyPage() {
  useTrainingBus('club-arena-lobby');
  const router = useRouter();

  // ── State ───────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [clubName, setClubName] = useState('');
  const [role, setRole] = useState('player');

  // Data
  const [tables, setTables] = useState([]);
  const [summary, setSummary] = useState(null);
  const [bbj, setBbj] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [waitlistPositions, setWaitlistPositions] = useState({});

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Load Lobby Data ────────────────────────────────────────
  const loadLobby = useCallback(async (cId) => {
    try {
      setLoading(true);
      setError(null);
      const targetClubId = cId || clubId;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }

      const { supabase } = await import('../../../src/lib/supabase');

      // Parallel fetch: tables (direct Supabase — works for ALL members), BBJ, announcements, member count
      const results = await Promise.allSettled([
        supabase.from('tables')
          .select('id, name, status, current_players, max_players, game_variant, small_blind, big_blind, min_buy_in, max_buy_in')
          .eq('club_id', targetClubId)
          .order('status', { ascending: true }),
        apiGet(`/api/club-arena/bbj?clubId=${targetClubId}`),
        apiGet(`/api/club-arena/announcements?clubId=${targetClubId}`),
        supabase.from('club_members')
          .select('user_id', { count: 'exact', head: false })
          .eq('club_id', targetClubId)
          .eq('status', 'active'),
      ]);

      if (mountedRef.current) {
        // Tables (direct query — no admin role needed)
        if (results[0].status === 'fulfilled') {
          const { data: tableData, error: tErr } = results[0].value;
          if (!tErr) {
            setTables(tableData || []);
            const active = (tableData || []).filter(t => ['active', 'playing', 'waiting', 'between_hands'].includes(t.status));
            const totalSeated = active.reduce((s, t) => s + (t.current_players || 0), 0);
            // Build summary from tables data
            const memberCount = results[3]?.status === 'fulfilled' ? (results[3].value?.count || results[3].value?.data?.length || 0) : 0;
            setSummary({
              activeTables: active.length,
              totalSeated,
              totalMembers: memberCount,
              online: totalSeated, // best approximation from table data
            });
          }
        }
        // BBJ
        if (results[1].status === 'fulfilled') {
          setBbj(results[1].value);
        }
        // Announcements
        if (results[2].status === 'fulfilled') {
          const anns = results[2].value.announcements || [];
          setAnnouncements(anns.filter(a => a.pinned).slice(0, 3));
        }
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId]);

  // ── Initial Load + Auth ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      const { supabase } = await import('../../../src/lib/supabase');

      let targetClub = qClub;
      let memberRole = 'player';
      let name = '';

      if (!targetClub) {
        const { data: membership } = await supabase
          .from('club_members').select('club_id, role').eq('user_id', session.user.id)
          .limit(1).maybeSingle();
        if (membership?.club_id) { targetClub = membership.club_id; memberRole = membership.role || 'player'; }
      } else {
        const { data: membership } = await supabase
          .from('club_members').select('role').eq('club_id', targetClub).eq('user_id', session.user.id)
          .maybeSingle();
        memberRole = membership?.role || 'player';
      }

      if (targetClub) {
        const { data: clubInfo } = await supabase
          .from('clubs').select('name').eq('id', targetClub).maybeSingle();
        name = clubInfo?.name || '';
      }

      if (targetClub && !cancelled) {
        setClubId(targetClub);
        setRole(memberRole);
        setClubName(name);
        loadLobby(targetClub);
      } else if (!cancelled) {
        setError('No club found. Join or create a club first.');
        setLoading(false);
      }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }

      const timeout = setTimeout(() => {
        if (!cancelled) { setError('login_required'); setLoading(false); }
      }, 3000);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        clearTimeout(timeout);
        if (sess && !cancelled) await init(sess);
        else if (!cancelled) { setError('login_required'); setLoading(false); }
        subscription?.unsubscribe();
      });
      authUnsub = subscription;
    })();

    return () => { cancelled = true; authUnsub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId, loadLobby]);

  // ── Auto-refresh every 30s ──────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    const interval = setInterval(() => loadLobby(clubId), 30000);
    return () => clearInterval(interval);
  }, [clubId, loadLobby]);

  // ── Visibility refresh ──────────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    const h = () => { if (document.visibilityState === 'visible') loadLobby(clubId); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [clubId, loadLobby]);

  // ── EventBus: cross-page sync ───────────────────────────────
  useEffect(() => {
    const refresh = () => { if (clubId) loadLobby(clubId); };
    const events = ['TABLE_CREATED', 'ANNOUNCEMENT_CREATED', 'PLAYER_KICKED'];
    events.forEach(ev => eventBus.on(ev, refresh));
    return () => events.forEach(ev => eventBus.off(ev, refresh));
  }, [clubId, loadLobby]);

  // ── Sorted tables ──────────────────────────────────────────
  const activeTables = tables.filter(t => ['active', 'playing', 'waiting', 'between_hands'].includes(t.status));
  const inactiveTables = tables.filter(t => !['active', 'playing', 'waiting', 'between_hands'].includes(t.status));

  return (
    <HubErrorBoundary name="Lobby">
      <SEOHead title={clubName ? `${clubName} Lobby | Smarter.Poker` : 'Club Lobby | Smarter.Poker'} />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error States ──────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Lobby.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : (
            <>
              {/* ── Page Header ────────────────────────────────── */}
              <div className={s.pageHeader}>
                <div className={s.pageTitle}>
                  🏠 {clubName || 'Club Lobby'}
                  {summary && <span className={s.unionCode}>{fmt(summary.online)} online</span>}
                </div>
                <div className={s.headerActions}>
                  <button onClick={() => loadLobby(clubId)} className={s.btnGhost}>↻ Refresh</button>
                  {['owner', 'admin', 'super_agent'].includes(role) && (
                    <Link href={`/hub/club-arena/admin?club=${clubId}`} style={{ textDecoration: 'none' }}>
                      <button className={s.btnGhost}>⚙️ Admin</button>
                    </Link>
                  )}
                </div>
              </div>

              {/* ── Loading Skeleton ────────────────────────────── */}
              {loading ? (
                <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {[1,2,3,4].map(i => <div key={i} className={s.shimmerLine} style={{ flex: '1 1 120px', height: '70px', borderRadius: '10px' }} />)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {[1,2,3,4,5,6].map(i => <div key={i} className={s.shimmerLine} style={{ height: '140px', borderRadius: '12px' }} />)}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Pinned Announcements ────────────────────────── */}
                  {announcements.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      {announcements.map(a => (
                        <div key={a.id} style={{ background: 'rgba(69,153,255,0.08)', border: '1px solid rgba(69,153,255,0.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                          <span style={{ fontSize: '18px', flexShrink: 0 }}>📢</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#E4E6EB', marginBottom: '2px' }}>{a.title}</div>
                            {a.content && <div style={{ fontSize: '13px', color: '#B0B3B8', lineHeight: 1.4 }}>{a.content.substring(0, 200)}{a.content.length > 200 ? '...' : ''}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Stats Bar + BBJ ────────────────────────────── */}
                  <div className={s.statsGrid} style={{ marginBottom: '20px' }}>
                    {summary && (
                      <>
                        <div className={s.statCard}><div className={s.statValueGreen}>{fmt(summary.activeTables)}</div><div className={s.statLabel}>Active Tables</div></div>
                        <div className={s.statCard}><div className={s.statValueBlue}>{fmt(summary.totalSeated)}</div><div className={s.statLabel}>Players Seated</div></div>
                        <div className={s.statCard}><div className={s.statValue}>{fmt(summary.totalMembers)}</div><div className={s.statLabel}>Total Members</div></div>
                        <div className={s.statCard}><div className={s.statValueGreen}>{fmt(summary.online)}</div><div className={s.statLabel}>Online Now</div></div>
                      </>
                    )}
                    {bbj?.pool && (
                      <div className={s.statCard} style={{ borderColor: 'rgba(247,197,42,0.3)' }}>
                        <div className={s.statValueGold} style={{ fontSize: '22px' }}>💰 {fmtChips(bbj.pool.amount)}</div>
                        <div className={s.statLabel}>Bad Beat Jackpot</div>
                        {bbj.hourlyRate > 0 && <div style={{ fontSize: '10px', color: '#F5A623', marginTop: '2px' }}>+{fmtChips(bbj.hourlyRate)}/hr</div>}
                      </div>
                    )}
                  </div>

                  {/* ── Active Tables Grid ──────────────────────────── */}
                  {activeTables.length === 0 && inactiveTables.length === 0 ? (
                    <div className={s.emptyState} style={{ padding: '60px 20px' }}>
                      <span className={s.emptyIcon}>🎰</span>
                      <span className={s.emptyText}>No tables yet. {['owner', 'admin', 'super_agent'].includes(role) ? 'Create the first table to get started!' : 'Ask your club admin to create a table.'}</span>
                      {['owner', 'admin', 'super_agent'].includes(role) && (
                        <Link href={`/hub/club-arena/admin?club=${clubId}`} style={{ textDecoration: 'none', marginTop: '12px' }}>
                          <button className={s.btnPrimary} style={{ padding: '10px 24px' }}>+ Create Table</button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <>
                      {activeTables.length > 0 && (
                        <div className={s.section}>
                          <div className={s.sectionTitle}>🟢 Active Tables ({activeTables.length})</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                            {activeTables.map(t => {
                              const fillPct = t.max_players > 0 ? Math.round((t.current_players / t.max_players) * 100) : 0;
                              const isFull = t.current_players >= t.max_players;
                              const gameLabel = GAME_LABELS[t.game_variant] || t.game_variant?.toUpperCase() || 'NLH';
                              const statusColor = STATUS_COLORS[t.status] || '#6B7280';

                              return (
                                <Link key={t.id} href={`/hub/club-arena/table/${t.id}`} style={{ textDecoration: 'none' }}>
                                  <div style={{
                                    background: '#242526', border: `1px solid ${statusColor}33`, borderRadius: '12px',
                                    padding: '16px 20px', cursor: 'pointer', transition: 'all 0.2s',
                                  }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${statusColor}88`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = `${statusColor}33`; e.currentTarget.style.transform = 'translateY(0)'; }}
                                  >
                                    {/* Top Row: Name + Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#E4E6EB' }}>{t.name || 'Table'}</div>
                                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase', background: `${statusColor}20`, color: statusColor }}>
                                        {t.status === 'playing' ? '▶ LIVE' : t.status === 'between_hands' ? '⏸ Break' : t.status}
                                      </span>
                                    </div>

                                    {/* Stakes + Game */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '2px 8px', borderRadius: '8px', color: '#B0B3B8' }}>{gameLabel}</span>
                                      {t.small_blind != null && (
                                        <span style={{ fontSize: '12px', background: 'rgba(247,197,42,0.1)', padding: '2px 8px', borderRadius: '8px', color: '#F7C52A', fontWeight: 600 }}>
                                          {fmtChips(t.small_blind)}/{fmtChips(t.big_blind)}
                                        </span>
                                      )}
                                      {t.min_buy_in != null && (
                                        <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '2px 8px', borderRadius: '8px', color: '#B0B3B8' }}>
                                          Buy: {fmtChips(t.min_buy_in)}-{fmtChips(t.max_buy_in)}
                                        </span>
                                      )}
                                    </div>

                                    {/* Player Count Bar */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ flex: 1, height: '6px', background: '#3A3B3C', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${fillPct}%`, height: '100%', background: isFull ? '#FA383E' : fillPct > 70 ? '#F5A623' : '#31A24C', borderRadius: '3px', transition: 'width 0.3s' }} />
                                      </div>
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: isFull ? '#FA383E' : '#E4E6EB', minWidth: '40px', textAlign: 'right' }}>
                                        {t.current_players}/{t.max_players}
                                      </span>
                                    </div>

                                    {/* Full indicator */}
                                    {isFull && (
                                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#FA383E', fontWeight: 600 }}>
                                        🚫 Table Full — Join Waitlist
                                      </div>
                                    )}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Inactive Tables */}
                      {inactiveTables.length > 0 && (
                        <div className={s.section} style={{ marginTop: '16px' }}>
                          <div className={s.sectionTitle} style={{ color: '#6B7280' }}>⚫ Inactive ({inactiveTables.length})</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                            {inactiveTables.map(t => (
                              <div key={t.id} style={{ background: '#1B1C1D', border: '1px solid #2D2E30', borderRadius: '12px', padding: '14px 18px', opacity: 0.6 }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: '#B0B3B8' }}>{t.name || 'Table'}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{t.status === 'closed' ? 'Closed' : 'Inactive'} — {t.max_players} seats</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Quick Links ───────────────────────────────── */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Link href={`/hub/club-arena/players?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>👥 Players</button></Link>
                    <Link href={`/hub/club-arena/cashier?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>💰 Cashier</button></Link>
                    <Link href={`/hub/club-arena/tournaments?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏆 Tournaments</button></Link>
                    <Link href={`/hub/club-arena/hand-histories?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🎬 Hands</button></Link>
                    <Link href={`/hub/club-arena/leaderboard?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏅 Leaderboard</button></Link>
                    {['owner', 'admin'].includes(role) && (
                      <Link href={`/hub/club-arena/anti-cheat?club=${clubId}`} style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🛡️ Anti-Cheat</button></Link>
                    )}
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
