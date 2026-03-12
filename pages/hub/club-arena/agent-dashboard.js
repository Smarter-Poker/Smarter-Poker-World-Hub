/* ═══════════════════════════════════════════════════════════════
   Agent Dashboard — Native Hub Page (replaces iframe shell)
   5 Tabs: Overview | Players | Cashouts | Commissions | Analytics
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import { busEmit, eventBus } from '../../../src/engine/EventBus';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
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
const statusClass = (status) => {
  const map = { pending: s.statusPending, approved: s.statusApproved, rejected: s.statusRejected, active: s.statusApproved, suspended: s.statusRejected, paid: s.statusApproved, completed: s.statusApproved, cancelled: s.statusClosed };
  return map[status] || s.statusPending;
};

export default function AgentDashboardPage() {
  useTrainingBus('arena-agent-dashboard');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [data, setData] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Analytics state
  const [pulse, setPulse] = useState(null);
  const [trends, setTrends] = useState(null);
  const [heatMap, setHeatMap] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  // Search / Filter
  const [playerSearch, setPlayerSearch] = useState('');
  const [cashoutFilter, setCashoutFilter] = useState('pending');

  // Transaction pagination
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 20;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Auto-clear success ────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Discover Club & Load Dashboard ────────────────────────
  const loadDashboard = useCallback(async (cId) => {
    try {
      setLoading(true);
      setError(null);
      const targetClubId = cId || clubId;
      if (!targetClubId) {
        setError('No club selected. Navigate from the Club Arena lobby.');
        setLoading(false);
        return;
      }
      const res = await apiGet(`/api/club-arena/agent-dashboard?clubId=${targetClubId}`);
      if (mountedRef.current) setData(res);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId]);

  // ── Load Analytics (lazy — on tab switch) ──────────────────
  const loadAnalytics = useCallback(async () => {
    if (analyticsLoaded || !clubId) return;
    try {
      const [pulseRes, trendsRes] = await Promise.all([
        apiCall('/api/club-arena/agent-analytics', { clubId, action: 'pulse', days: 7 }),
        apiCall('/api/club-arena/agent-analytics', { clubId, action: 'trends', days: 7 }),
      ]);
      if (mountedRef.current) {
        setPulse(pulseRes.pulse || null);
        setTrends(trendsRes.trends || []);
        setAnalyticsLoaded(true);
      }
    } catch (err) {
      console.warn('[AgentDashboard] Analytics load failed:', err.message);
    }
  }, [clubId, analyticsLoaded]);

  const loadHeatMap = useCallback(async () => {
    if (heatMap || !clubId) return;
    try {
      const res = await apiCall('/api/club-arena/agent-analytics', { clubId, action: 'heat_map' });
      if (mountedRef.current) setHeatMap(res.heatMap || []);
    } catch (err) {
      console.warn('[AgentDashboard] Heat map failed:', err.message);
    }
  }, [clubId, heatMap]);

  const loadLeaderboard = useCallback(async () => {
    if (leaderboard || !clubId) return;
    try {
      const res = await apiCall('/api/club-arena/agent-analytics', { clubId, action: 'leaderboard', days: 30 });
      if (mountedRef.current) setLeaderboard(res.leaderboard || []);
    } catch (err) {
      console.warn('[AgentDashboard] Leaderboard failed:', err.message);
    }
  }, [clubId, leaderboard]);

  // ── Initial Load with Session Hydration Awareness ──────────
  useEffect(() => {
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      // Get clubId from URL query
      const qClub = router.query.club || router.query.clubId;
      if (qClub) {
        setClubId(qClub);
        loadDashboard(qClub);
        return;
      }
      // Fallback: discover user's first club
      if (session) {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: membership } = await supabase
          .from('club_members')
          .select('club_id')
          .eq('user_id', session.user.id)
          .in('role', ['agent', 'sub_agent', 'super_agent', 'owner', 'admin'])
          .limit(1)
          .maybeSingle();
        if (membership?.club_id && !cancelled) {
          setClubId(membership.club_id);
          loadDashboard(membership.club_id);
          return;
        }
      }
      if (!cancelled) {
        setError('No club found. Navigate from the Club Arena lobby.');
        setLoading(false);
      }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await init(session);
        return;
      }

      // Session not ready yet — wait for onAuthStateChange
      const timeout = setTimeout(() => {
        if (!cancelled) { setError('login_required'); setLoading(false); }
      }, 3000);

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        clearTimeout(timeout);
        if (newSession && !cancelled) {
          await init(newSession);
        } else if (!cancelled) {
          setError('login_required');
          setLoading(false);
        }
        subscription?.unsubscribe();
      });
      authUnsub = subscription;
    })();

    return () => { cancelled = true; authUnsub?.unsubscribe?.(); };
  }, [router.query.club, router.query.clubId]);

  // ── Lazy Analytics Loading ─────────────────────────────────
  useEffect(() => {
    if (tab === 'overview' || tab === 'commissions') loadAnalytics();
    if (tab === 'analytics') { loadAnalytics(); loadHeatMap(); loadLeaderboard(); }
  }, [tab, loadAnalytics, loadHeatMap, loadLeaderboard]);

  // ── EventBus Listeners ─────────────────────────────────────
  useEffect(() => {
    const refresh = () => { if (clubId) loadDashboard(clubId); };
    const events = ['CASHOUT_APPROVED', 'CASHOUT_CANCELLED', 'CHIPS_DISTRIBUTED', 'AGENT_UPDATED'];
    events.forEach(ev => eventBus.on(ev, refresh));
    return () => events.forEach(ev => eventBus.off(ev, refresh));
  }, [clubId, loadDashboard]);

  // ── Actions ────────────────────────────────────────────────
  const approveCashout = async (cashoutId) => {
    if (!confirm('Approve this cashout request?')) return;
    setProcessing(true);
    try {
      await apiCall('/api/club-arena/approve-cashout', { cashoutId, clubId });
      setSuccess('Cashout approved successfully.');
      busEmit('CASHOUT_APPROVED', { cashoutId, clubId });
      loadDashboard(clubId);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const denyCashout = async (cashoutId) => {
    if (!confirm('Deny and refund this cashout request?')) return;
    setProcessing(true);
    try {
      await apiCall('/api/club-arena/cancel-my-cashout', { cashoutId, clubId });
      setSuccess('Cashout denied and refunded.');
      busEmit('CASHOUT_CANCELLED', { cashoutId, clubId });
      loadDashboard(clubId);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Loading / Error States ─────────────────────────────────
  if (loading) {
    return (
      <HubErrorBoundary name="Agent Dashboard">
        <SEOHead title="Agent Dashboard | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Loading Agent Dashboard...</div></div>
      </HubErrorBoundary>
    );
  }

  // ── Derived Data ───────────────────────────────────────────
  const stats = data?.stats || {};
  const players = data?.players || [];
  const pendingCashouts = data?.pendingCashouts || [];
  const commissionHistory = data?.commissionHistory || [];
  const recentTransactions = data?.recentTransactions || [];
  const agents = data?.agents || [];
  const role = data?.role || 'agent';
  const membership = data?.membership || {};

  // Filtered Players
  const filteredPlayers = playerSearch
    ? players.filter(p => {
        const name = (p.profile?.display_name || p.profile?.username || p.nickname || '').toLowerCase();
        return name.includes(playerSearch.toLowerCase());
      })
    : players;

  // Paginated transactions
  const paginatedTx = recentTransactions.slice(0, txPage * TX_PER_PAGE);

  // Max commission from trends for sparkline scaling
  const maxTrend = trends ? Math.max(...trends.map(t => t.amount), 1) : 1;

  return (
    <HubErrorBoundary name="Agent Dashboard">
      <SEOHead title="Agent Dashboard | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Success Messages ─────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Agent Dashboard.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? (
            <div className={s.error}>{error}</div>
          ) : null}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              Agent Dashboard
              <span className={s.unionCode}>{role.toUpperCase()}</span>
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadDashboard(clubId)} className={s.btnGhost} disabled={processing}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Pending Cashouts Alert Banner ─────────────────── */}
          {pendingCashouts.length > 0 && tab !== 'cashouts' && (
            <div className={s.alertBanner} onClick={() => setTab('cashouts')}>
              <span className={s.alertCount}>{pendingCashouts.length}</span>
              <span>pending cashout request{pendingCashouts.length !== 1 ? 's' : ''} — {fmt(pendingCashouts.reduce((s, c) => s + (c.amount || 0), 0))} chips waiting for approval</span>
            </div>
          )}

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div className={s.tabs}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'players', label: 'Players', badge: stats.totalPlayers },
              { id: 'cashouts', label: 'Cashouts', badge: pendingCashouts.length || null },
              { id: 'commissions', label: 'Commissions' },
              { id: 'analytics', label: 'Analytics' },
            ].map(t => (
              <button
                key={t.id}
                className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`}
                onClick={() => setTab(t.id)}
              >
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
              {/* KPI Cards */}
              <div className={s.statsGrid}>
                <div className={s.statCard}>
                  <div className={s.statValueBlue}>{fmt(stats.totalPlayers)}</div>
                  <div className={s.statLabel}>Total Players</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValueGreen}>{fmt(stats.onlinePlayers)}</div>
                  <div className={s.statLabel}>Online Now</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValue}>{fmtChips(stats.totalPlayerChips)}</div>
                  <div className={s.statLabel}>Player Chips</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValueGold}>{fmt(stats.pendingCashouts)}</div>
                  <div className={s.statLabel}>Pending Cashouts</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValueRed}>{fmtChips(stats.pendingCashoutAmount)}</div>
                  <div className={s.statLabel}>Cashout Amount</div>
                </div>
                {pulse && (
                  <>
                    <div className={s.statCard}>
                      <div className={s.statValueGreen}>{fmtChips(pulse.totalCommissions)}</div>
                      <div className={s.statLabel}>7-Day Commission</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueGold}>{fmt(pulse.atRiskCount)}</div>
                      <div className={s.statLabel}>At-Risk Players</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueRed}>{fmt(pulse.churnedCount)}</div>
                      <div className={s.statLabel}>Churned Players</div>
                    </div>
                  </>
                )}
              </div>

              {/* 7-Day Commission Sparkline */}
              {trends && trends.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>7-Day Commission Trend</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '80px' }}>
                    {trends.map((t, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                          width: '100%',
                          maxWidth: '40px',
                          height: `${Math.max((t.amount / maxTrend) * 60, 4)}px`,
                          background: t.amount > 0 ? 'linear-gradient(to top, #2374E1, #4599FF)' : '#3A3B3C',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }} />
                        <span style={{ fontSize: '10px', color: '#B0B3B8' }}>{t.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Recent Transactions</div>
                {recentTransactions.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>📋</span><span className={s.emptyText}>No recent transactions</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>From / To</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTx.map((tx, i) => (
                          <tr key={tx.id || i}>
                            <td><span className={`${s.statusBadge} ${statusClass(tx.type || tx.status)}`}>{tx.type || tx.transaction_type || 'transfer'}</span></td>
                            <td style={{ fontWeight: 600 }}>{fmtChips(tx.amount)}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{tx.from_user_id?.substring(0, 8) || '—'}.. → {tx.to_user_id?.substring(0, 8) || '—'}..</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(tx.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {paginatedTx.length < recentTransactions.length && (
                  <button onClick={() => setTxPage(p => p + 1)} className={s.btnGhost} style={{ width: '100%', marginTop: '12px' }}>Load More</button>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: PLAYERS                                     */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'players' && (
            <>
              {/* Search Bar */}
              <div className={s.formRow} style={{ marginBottom: '16px' }}>
                <div className={s.formGroup}>
                  <input
                    className={s.formInput}
                    placeholder="Search players by name..."
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Player Count Summary */}
              <div className={s.statsGrid} style={{ marginBottom: '16px' }}>
                <div className={s.statCard}>
                  <div className={s.statValueBlue}>{filteredPlayers.length}</div>
                  <div className={s.statLabel}>{playerSearch ? 'Matching' : 'Total'} Players</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValueGreen}>{filteredPlayers.filter(p => p.profile?.is_online).length}</div>
                  <div className={s.statLabel}>Online Now</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValue}>{fmtChips(filteredPlayers.reduce((sum, p) => sum + (p.chip_balance || 0), 0))}</div>
                  <div className={s.statLabel}>Total Chips</div>
                </div>
              </div>

              {/* Player Grid */}
              {filteredPlayers.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>👥</span><span className={s.emptyText}>{playerSearch ? 'No players match your search' : 'No players in your downline yet'}</span></div>
              ) : (
                <div className={s.cardGrid}>
                  {filteredPlayers.map(p => {
                    const name = p.profile?.display_name || p.profile?.username || p.nickname || p.user_id.substring(0, 8);
                    const isOnline = p.profile?.is_online;
                    return (
                      <div key={p.user_id} className={s.card}>
                        <div className={s.cardHeader}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '10px', height: '10px', borderRadius: '50%',
                              background: isOnline ? '#31A24C' : '#6B7280',
                              boxShadow: isOnline ? '0 0 6px rgba(49,162,76,0.5)' : 'none',
                            }} />
                            <span className={s.cardName}>{name}</span>
                          </div>
                          <span className={`${s.cardBadge} ${p.status === 'active' ? s.badgeActive : s.badgeSuspended}`}>
                            {p.tier || p.role}
                          </span>
                        </div>
                        <div className={s.cardMeta}>
                          <span className={s.cardMetaItem}>💰 {fmtChips(p.chip_balance)}</span>
                          <span className={s.cardMetaItem}>⏱ {timeAgo(p.profile?.last_seen)}</span>
                          {p.xp ? <span className={s.cardMetaItem}>⭐ {fmt(p.xp)} XP</span> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: CASHOUTS                                    */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'cashouts' && (
            <>
              <div className={s.section}>
                <div className={s.sectionTitle}>
                  Pending Cashout Requests
                  <span className={s.unionCode}>{pendingCashouts.length} pending</span>
                </div>

                {pendingCashouts.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>✅</span><span className={s.emptyText}>No pending cashout requests</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Amount</th>
                          <th>Note</th>
                          <th>Requested</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingCashouts.map(c => (
                          <tr key={c.id}>
                            <td>{c.user_id?.substring(0, 8)}..</td>
                            <td style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(c.amount)}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.note || '—'}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(c.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => approveCashout(c.id)} className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing}>Approve</button>
                                <button onClick={() => denyCashout(c.id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Deny</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Cashout Summary */}
              <div className={s.statsGrid}>
                <div className={s.statCard}>
                  <div className={s.statValueGold}>{fmt(pendingCashouts.length)}</div>
                  <div className={s.statLabel}>Pending</div>
                </div>
                <div className={s.statCard}>
                  <div className={s.statValueRed}>{fmtChips(pendingCashouts.reduce((sum, c) => sum + (c.amount || 0), 0))}</div>
                  <div className={s.statLabel}>Total Amount</div>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: COMMISSIONS                                 */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'commissions' && (
            <>
              {/* Commission Summary Cards */}
              {pulse && (
                <div className={s.statsGrid}>
                  <div className={s.statCard}>
                    <div className={s.statValueGreen}>{fmtChips(pulse.totalCommissions)}</div>
                    <div className={s.statLabel}>7-Day Total</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValueBlue}>{fmtChips(pulse.paidCommissions)}</div>
                    <div className={s.statLabel}>Paid Out</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValueGold}>{fmtChips(pulse.pendingCommissions)}</div>
                    <div className={s.statLabel}>Pending</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValue}>{fmtChips(pulse.totalVolume)}</div>
                    <div className={s.statLabel}>Transaction Vol</div>
                  </div>
                </div>
              )}

              {/* 7-Day Trend Chart */}
              {trends && trends.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Daily Commission Breakdown</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px', marginBottom: '8px' }}>
                    {trends.map((t, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#E4E6EB', fontWeight: 600 }}>{t.amount > 0 ? fmtChips(t.amount) : ''}</span>
                        <div style={{
                          width: '100%',
                          maxWidth: '50px',
                          height: `${Math.max((t.amount / maxTrend) * 70, 4)}px`,
                          background: t.amount > 0 ? 'linear-gradient(to top, #31A24C, #86EFAC)' : '#3A3B3C',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.3s ease',
                        }} />
                        <span style={{ fontSize: '10px', color: '#B0B3B8' }}>{t.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commission History Table */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Commission History</div>
                {commissionHistory.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>💰</span><span className={s.emptyText}>No commission records yet</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Period</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissionHistory.map((c, i) => (
                          <tr key={c.id || i}>
                            <td style={{ fontWeight: 700, color: '#31A24C' }}>{fmtChips(c.amount)}</td>
                            <td><span className={`${s.statusBadge} ${statusClass(c.status)}`}>{c.status || 'recorded'}</span></td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{c.period_label || c.settlement_period_id?.substring(0, 8) || '—'}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(c.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: ANALYTICS                                   */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'analytics' && (
            <>
              {/* Pulse Summary */}
              {pulse && (
                <div className={s.statsGrid}>
                  <div className={s.statCard}>
                    <div className={s.statValueBlue}>{fmt(pulse.playerCount)}</div>
                    <div className={s.statLabel}>Total Players</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValueGreen}>{fmt(pulse.activeCount)}</div>
                    <div className={s.statLabel}>Active (5d)</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValueGold}>{fmt(pulse.atRiskCount)}</div>
                    <div className={s.statLabel}>At-Risk (5-14d)</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statValueRed}>{fmt(pulse.churnedCount)}</div>
                    <div className={s.statLabel}>Churned (14d+)</div>
                  </div>
                </div>
              )}

              {/* Player Activity Heat Map */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Player Activity Heat Map</div>
                {!heatMap ? (
                  <div className={s.loading}>Loading heat map...</div>
                ) : heatMap.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>🗺️</span><span className={s.emptyText}>No player activity data</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Player</th>
                          <th>Chips</th>
                          <th>Last Active</th>
                          <th>Days Inactive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {heatMap.map((p, i) => (
                          <tr key={p.userId || i}>
                            <td>
                              <span style={{
                                display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                                background: p.color === 'green' ? '#31A24C' : p.color === 'yellow' ? '#F7C52A' : '#E41E3F',
                                marginRight: '6px',
                              }} />
                              <span className={`${s.statusBadge} ${p.status === 'active' ? s.statusApproved : p.status === 'at_risk' ? s.statusPending : s.statusRejected}`}>
                                {p.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td>{p.name}</td>
                            <td>{fmtChips(p.chipBalance)}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(p.lastActive)}</td>
                            <td style={{ fontWeight: 600, color: p.color === 'green' ? '#31A24C' : p.color === 'yellow' ? '#F7C52A' : '#E41E3F' }}>
                              {p.daysSinceActive}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sub-Agent Leaderboard */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Agent Leaderboard (30-Day Revenue)</div>
                {!leaderboard ? (
                  <div className={s.loading}>Loading leaderboard...</div>
                ) : leaderboard.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>🏆</span><span className={s.emptyText}>No agent data available</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Agent</th>
                          <th>Commission Rate</th>
                          <th>Earnings (30d)</th>
                          <th>Players</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((a, i) => (
                          <tr key={a.agentId || i}>
                            <td style={{ fontWeight: 700, color: i === 0 ? '#F7C52A' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#B0B3B8' }}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </td>
                            <td style={{ fontWeight: 600 }}>{a.name}</td>
                            <td>{(a.commissionRate * 100).toFixed(1)}%</td>
                            <td style={{ fontWeight: 700, color: '#31A24C' }}>{fmtChips(a.earnings)}</td>
                            <td>{fmt(a.playerCount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
