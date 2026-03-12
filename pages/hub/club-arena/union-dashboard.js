/* ═══════════════════════════════════════════════════════════════
   Union Dashboard — Native Hub Page (replaces iframe shell)
   6 Tabs: Overview | Clubs | Agents | Wallet | Applications | Settings
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { apiCall, apiGet } from '../../../src/lib/club-arena/apiClient';
import { busEmit, eventBus } from '../../../src/engine/EventBus';
import s from '../../../src/styles/UnionDashboard.module.css';

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
const statusClass = (status) => {
  const map = { pending: s.statusPending, approved: s.statusApproved, rejected: s.statusRejected, active: s.statusApproved, suspended: s.statusRejected, running: s.statusRunning, scheduled: s.statusScheduled, waiting: s.statusWaiting, closed: s.statusClosed, open: s.statusRunning };
  return map[status] || s.statusPending;
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

export default function UnionDashboardPage() {
  useTrainingBus('arena-union-dashboard');

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [data, setData] = useState(null);
  const [unionId, setUnionId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Wallet state
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [transferForm, setTransferForm] = useState({ clubId: '', amount: '', notes: '' });
  const [rakeAmount, setRakeAmount] = useState('');

  // Applications state
  const [apps, setApps] = useState([]);
  const [appsFilter, setAppsFilter] = useState('pending');
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsLoaded, setAppsLoaded] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);

  // Settings state
  const [settingsForm, setSettingsForm] = useState({});
  const [adminSearch, setAdminSearch] = useState('');
  const [adminResults, setAdminResults] = useState([]);

  // Commission edit
  const [editCommClub, setEditCommClub] = useState(null);
  const [editCommRate, setEditCommRate] = useState('');

  // Announcement
  const [annMsg, setAnnMsg] = useState('');
  const [annClub, setAnnClub] = useState('');

  // Commission history (lazy)
  const [commHistory, setCommHistory] = useState(null);
  const commHistoryLoaded = useRef(false);

  // Search / Filter
  const [clubSearch, setClubSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');

  // Transaction pagination
  const [txPage, setTxPage] = useState(1);
  const TX_PER_PAGE = 25;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Auto-clear success ────────────────────────────────────
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // ── Load Dashboard Data ───────────────────────────────────
  const loadDashboard = useCallback(async (uid) => {
    try {
      setLoading(true);
      setError(null);
      const id = uid || unionId;
      if (!id) {
        // Discover user's union
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError('Please log in'); setLoading(false); return; }
        const { data: adminRow } = await supabase.from('union_admins').select('union_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        if (!adminRow) { setError('You are not a union admin. No unions found for your account.'); setLoading(false); return; }
        setUnionId(adminRow.union_id);
        const res = await apiGet(`/api/club-arena/union-dashboard?unionId=${adminRow.union_id}`);
        if (mountedRef.current) setData(res);
      } else {
        const res = await apiGet(`/api/club-arena/union-dashboard?unionId=${id}`);
        if (mountedRef.current) setData(res);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [unionId]);

  useEffect(() => { loadDashboard(); }, []);

  // ── Load Wallet ───────────────────────────────────────────
  const loadWallet = useCallback(async () => {
    if (!unionId) return;
    setWalletLoading(true);
    try {
      const res = await apiCall('/api/club-arena/union-wallet', { action: 'get_balances', unionId });
      if (mountedRef.current) setWalletData(res);
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setWalletLoading(false);
    }
  }, [unionId]);

  // ── Load Applications ─────────────────────────────────────
  const loadApps = useCallback(async (filter) => {
    if (!unionId) return;
    setAppsLoading(true);
    try {
      const res = await apiCall('/api/club-arena/union-application', { action: 'list', unionId, statusFilter: filter || appsFilter });
      if (mountedRef.current) { setApps(res.applications || []); setAppsLoaded(true); }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setAppsLoading(false);
    }
  }, [unionId, appsFilter]);

  // ── Load Leave Requests ───────────────────────────────────
  const loadLeave = useCallback(async () => {
    if (!unionId) return;
    try {
      const res = await apiCall('/api/club-arena/manage-union', { action: 'list_leave', unionId });
      if (mountedRef.current) setLeaveRequests(res.leaveRequests || []);
    } catch (err) { /* non-critical */ }
  }, [unionId]);

  // ── Load Commission History (lazy) ────────────────────────
  const loadCommHistory = useCallback(async () => {
    if (!unionId || commHistoryLoaded.current) return;
    try {
      const res = await apiGet(`/api/club-arena/union-dashboard?unionId=${unionId}&include=commissions`);
      if (mountedRef.current && res.commissionHistory) {
        setCommHistory(res.commissionHistory);
        commHistoryLoaded.current = true;
      }
    } catch (_) {}
  }, [unionId]);

  // Tab change handler
  useEffect(() => {
    if (!unionId) return;
    if (tab === 'wallet' && !walletData) loadWallet();
    if (tab === 'applications' && !appsLoaded) { loadApps(); loadLeave(); }
  }, [tab, unionId]);

  // ── Auto-Refresh Polling (45s on Overview tab) ────────────
  useEffect(() => {
    if (!unionId || tab !== 'overview') return;
    const interval = setInterval(() => {
      if (!document.hidden) loadDashboard(unionId);
    }, 45000);
    return () => clearInterval(interval);
  }, [unionId, tab, loadDashboard]);

  // ── EventBus LISTENERS — auto-refresh on incoming events ──
  useEffect(() => {
    if (!unionId || typeof eventBus?.on !== 'function') return;
    const refresh = () => { if (mountedRef.current) loadDashboard(unionId); };
    const refreshWallet = () => { if (mountedRef.current) { setWalletData(null); loadWallet(); } };
    const refreshApps = () => { if (mountedRef.current) { setAppsLoaded(false); loadApps(); } };
    const unsubs = [
      ...['union:club-removed', 'union:commission-updated', 'union:admin-changed',
          'union:tournament-created', 'union:table-created'].map(e => eventBus.on(e, refresh)),
      eventBus.on('union:wallet-transfer', refreshWallet),
      eventBus.on('union:application-reviewed', refreshApps),
    ];
    return () => unsubs.forEach(fn => fn?.());
  }, [unionId, loadDashboard, loadWallet, loadApps]);

  // ── Filtered Lists (search/filter) ────────────────────────
  const filteredClubs = useMemo(() => {
    if (!clubSearch.trim()) return data?.clubs || [];
    const q = clubSearch.toLowerCase();
    return (data?.clubs || []).filter(c => c.name?.toLowerCase().includes(q) || String(c.club_id).includes(q));
  }, [data?.clubs, clubSearch]);

  const filteredAgents = useMemo(() => {
    const agents = data?.agents || [];
    if (!agentSearch.trim()) return agents;
    const q = agentSearch.toLowerCase();
    return agents.filter(a =>
      a.profile?.display_name?.toLowerCase().includes(q) ||
      a.profile?.username?.toLowerCase().includes(q) ||
      a.role?.toLowerCase().includes(q)
    );
  }, [data?.agents, agentSearch]);

  // ── CSV Export Helpers ────────────────────────────────────
  const downloadCSV = (filename, headers, rows) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAgents = () => {
    const agents = data?.agents || [];
    const clubs = data?.clubs || [];
    const headers = ['Agent', 'Club', 'Role', 'Commission', 'Players', 'Earnings', 'Credit', 'Status'];
    const rows = agents.map(a => {
      const club = clubs.find(c => c.id === a.club_id);
      return [a.profile?.display_name || a.profile?.username || a.user_id, club?.name || 'Unknown', a.role, ((a.commission_rate || 0) * 100).toFixed(1) + '%', a.active_player_count || 0, a.lifetime_earnings || 0, a.is_prepaid ? 'Prepaid' : (a.credit_used || 0), a.status];
    });
    downloadCSV(`union_agents_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const exportTransactions = () => {
    const txns = walletData?.recentTransactions || [];
    const headers = ['Type', 'Wallet', 'Direction', 'Amount', 'Club', 'Notes', 'Date'];
    const rows = txns.map(tx => [tx.tx_type, tx.wallet, tx.direction, tx.amount, tx.clubs?.name || '-', tx.notes || '-', tx.created_at]);
    downloadCSV(`union_transactions_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const exportSettlements = () => {
    const periods = data?.recentPeriods || [];
    const clubs = data?.clubs || [];
    const headers = ['Club', 'Period', 'Rake', 'Hands', 'Status', 'Date'];
    const rows = periods.map(p => {
      const club = clubs.find(c => c.id === p.club_id);
      return [club?.name || 'Unknown', p.period_number, p.total_rake_collected, p.total_hands_dealt, p.status, p.created_at];
    });
    downloadCSV(`union_settlements_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // ── Mutation Helpers ──────────────────────────────────────
  const doAction = async (endpoint, body, successMsg, { silent = false, busEvent = null, invalidateWallet = false } = {}) => {
    setProcessing(true);
    setError(null);
    try {
      const res = await apiCall(endpoint, body);
      if (!silent) setSuccess(successMsg || res.message || 'Done');
      if (busEvent) busEmit(busEvent, { unionId, action: body?.action, ...res });
      if (invalidateWallet) setWalletData(null);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setProcessing(false);
    }
  };

  // ── Render Guard ──────────────────────────────────────────
  if (loading) {
    return (
      <HubErrorBoundary name="Union Dashboard">
        <SEOHead title="Union Dashboard | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Loading Union Dashboard...</div></div>
      </HubErrorBoundary>
    );
  }

  if (error && !data) {
    return (
      <HubErrorBoundary name="Union Dashboard">
        <SEOHead title="Union Dashboard | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.inner}><div className={s.error}>{error}</div></div></div>
      </HubErrorBoundary>
    );
  }

  const { union, stats, clubs = [], agents = [], admins = [], recentPeriods = [], activityFeed = [], wallets, pendingApplications = 0, pendingLeaveRequests = 0, adminRole } = data || {};
  const isLead = adminRole === 'union_lead';

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <HubErrorBoundary name="Union Dashboard">
      <SEOHead title={`${union?.name || 'Union'} Dashboard | Smarter.Poker`} />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* Messages */}
          {error && <div className={s.error}>{error}</div>}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* Header */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              {union?.name || 'Union Dashboard'}
              {union?.code && <span className={s.unionCode}>{union.code}</span>}
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena/union-games" style={{ textDecoration: 'none' }}><button className={s.btnPrimary}>🎮 Games</button></Link>
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button className={s.btnGhost} onClick={() => loadDashboard(unionId)} disabled={processing}>Refresh</button>
            </div>
          </div>

          {/* Alert Banners */}
          {pendingApplications > 0 && (
            <div className={s.alertBanner} onClick={() => setTab('applications')}>
              <span className={s.alertCount}>{pendingApplications}</span>
              pending club application{pendingApplications !== 1 ? 's' : ''} — click to review
            </div>
          )}
          {pendingLeaveRequests > 0 && (
            <div className={s.alertBanner} onClick={() => setTab('applications')}>
              <span className={s.alertCount}>{pendingLeaveRequests}</span>
              pending leave request{pendingLeaveRequests !== 1 ? 's' : ''} — click to review
            </div>
          )}

          {/* Tabs */}
          <div className={s.tabs}>
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'clubs', label: `Clubs (${stats?.totalClubs || 0})` },
              { id: 'agents', label: `Agents (${stats?.totalAgents || 0})` },
              { id: 'wallet', label: 'Wallet' },
              { id: 'applications', label: 'Applications', badge: pendingApplications || null },
              { id: 'settings', label: 'Settings' },
            ].map(t => (
              <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge > 0 && <span className={s.tabBadge}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
          {tab === 'overview' && (
            <>
              {/* Stats Grid */}
              <div className={s.statsGrid}>
                <div className={s.statCard}><div className={s.statValueBlue}>{fmt(stats?.totalClubs)}</div><div className={s.statLabel}>Clubs</div></div>
                <div className={s.statCard}><div className={s.statValue}>{fmt(stats?.totalMembers)}</div><div className={s.statLabel}>Total Members</div></div>
                <div className={s.statCard}><div className={s.statValueGreen}>{fmt(stats?.totalAgents)}</div><div className={s.statLabel}>Active Agents</div></div>
                <div className={s.statCard}><div className={s.statValue}>{fmt(stats?.totalSeatedPlayers)}</div><div className={s.statLabel}>Seated Players</div></div>
                <div className={s.statCard}><div className={s.statValueBlue}>{fmt(stats?.totalActiveTables)}</div><div className={s.statLabel}>Active Tables</div></div>
                <div className={s.statCard}><div className={s.statValueGold}>{fmt(stats?.runningTournaments)}</div><div className={s.statLabel}>Running Tourneys</div></div>
              </div>

              {/* Wallets Summary */}
              <div className={s.walletGrid}>
                <div className={s.walletChips}><div className={s.walletLabel}>Chip Balance</div><div className={s.walletAmount}>{fmt(wallets?.chip_balance)}</div></div>
                <div className={s.walletRake}><div className={s.walletLabel}>Rake Wallet</div><div className={s.walletAmount}>{fmt(wallets?.rake_wallet)}</div></div>
                <div className={s.walletBBJ}><div className={s.walletLabel}>BBJ Pool</div><div className={s.walletAmount}>{fmt(wallets?.bbj_wallet)}</div></div>
                <div className={s.walletPromo}><div className={s.walletLabel}>Promo Wallet</div><div className={s.walletAmount}>{fmt(wallets?.promo_wallet)}</div></div>
              </div>

              {/* Financial Summary */}
              <div className={s.statsGrid}>
                <div className={s.statCard}><div className={s.statValueGreen}>{fmt(stats?.totalRake)}</div><div className={s.statLabel}>Lifetime Rake</div></div>
                <div className={s.statCard}><div className={s.statValue}>{fmt(stats?.totalTreasury)}</div><div className={s.statLabel}>Total Treasury</div></div>
                <div className={s.statCard}><div className={s.statValueGold}>{fmt(stats?.totalLifetimeEarnings)}</div><div className={s.statLabel}>Agent Earnings</div></div>
                <div className={s.statCard}><div className={s.statValueRed}>{fmt(stats?.totalCreditExposure)}</div><div className={s.statLabel}>Credit Exposure</div></div>
                <div className={s.statCard}><div className={s.statValue}>{pct(stats?.unionHoldRate)}</div><div className={s.statLabel}>Hold Rate</div></div>
                <div className={s.statCard}><div className={s.statValueGreen}>{fmt(stats?.estimatedUnionHold)}</div><div className={s.statLabel}>Est. Hold</div></div>
              </div>

              {/* Activity Feed */}
              {activityFeed.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Recent Activity</div>
                  <div className={s.feedList}>
                    {activityFeed.map(item => (
                      <div key={item.id} className={s.feedItem}>
                        <div className={s.feedDot} style={{ background: item.color || '#B0B3B8' }} />
                        <div className={s.feedText}>{item.text}</div>
                        <div className={s.feedTime}>{item.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Broadcast Announcement */}
              {isLead && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Broadcast Announcement</div>
                  <div className={s.formRow}>
                    <div className={s.formGroup}>
                      <label className={s.formLabel}>Message (max 500 chars)</label>
                      <textarea className={s.formTextarea} value={annMsg} onChange={e => setAnnMsg(e.target.value)} maxLength={500} placeholder="Type an announcement to send to all clubs..." />
                    </div>
                  </div>
                  <div className={s.formRow}>
                    <div className={s.formGroup} style={{ maxWidth: 250 }}>
                      <label className={s.formLabel}>Target (optional)</label>
                      <select className={s.formSelect} value={annClub} onChange={e => setAnnClub(e.target.value)}>
                        <option value="">All Clubs</option>
                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <button className={s.btnPrimary} disabled={processing || !annMsg.trim()} onClick={async () => {
                      const res = await doAction('/api/club-arena/manage-union', {
                        action: 'union_announcement', unionId, message: annMsg, clubId: annClub || undefined
                      }, 'Announcement sent');
                      if (res) setAnnMsg('');
                    }}>Send Announcement</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════ CLUBS TAB ═════════════════════ */}
          {tab === 'clubs' && (
            <>
              {/* Search */}
              <div className={s.formRow} style={{ marginBottom: 12 }}>
                <div className={s.formGroup} style={{ maxWidth: 300 }}>
                  <input className={s.formInput} value={clubSearch} onChange={e => setClubSearch(e.target.value)} placeholder="Search clubs by name or ID..." />
                </div>
                <span style={{ fontSize: 13, color: '#B0B3B8', alignSelf: 'center' }}>{filteredClubs.length} club{filteredClubs.length !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.cardGrid}>
                {filteredClubs.map(club => (
                  <div key={club.id} className={s.card}>
                    <div className={s.cardHeader}>
                      <div>
                        <div className={s.cardName}>{club.name}</div>
                        <div style={{ fontSize: 12, color: '#B0B3B8' }}>ID: {club.club_id}</div>
                      </div>
                      <span className={`${s.cardBadge} ${s.badgeActive}`}>{pct(club.club_commission_rate)} comm</span>
                    </div>
                    <div className={s.cardMeta}>
                      <span className={s.cardMetaItem}>{fmt(club.member_count)} members</span>
                      <span className={s.cardMetaItem}>{fmt(club.active_tables)} tables</span>
                      <span className={s.cardMetaItem}>{fmt(club.seated_players)} seated</span>
                      <span className={s.cardMetaItem}>{fmt(club.total_rake)} rake</span>
                    </div>
                    {isLead && (
                      <div className={s.cardActions}>
                        <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => { setEditCommClub(club); setEditCommRate(String((club.club_commission_rate || 0.9) * 100)); }}>Edit Rate</button>
                        <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                          if (!confirm(`Remove ${club.name} from the union?`)) return;
                          const res = await doAction('/api/club-arena/manage-union', { action: 'remove_club', unionId, clubId: club.id }, `${club.name} removed`, { busEvent: 'union:club-removed' });
                          if (res) loadDashboard(unionId);
                        }}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {filteredClubs.length === 0 && (
                <div className={s.emptyState}><span className={s.emptyIcon}>🏢</span><div className={s.emptyText}>{clubSearch ? 'No clubs match your search' : 'No clubs in this union yet'}</div></div>
              )}

              {/* Edit Commission Modal */}
              {editCommClub && (
                <div className={s.modalOverlay} onClick={() => setEditCommClub(null)}>
                  <div className={s.modal} onClick={e => e.stopPropagation()}>
                    <div className={s.modalTitle}>Edit Commission — {editCommClub.name}</div>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Commission Rate (%)</label>
                        <input className={s.formInput} type="number" min="1" max="100" value={editCommRate} onChange={e => setEditCommRate(e.target.value)} />
                      </div>
                    </div>
                    <div className={s.formRow}>
                      <button className={s.btnPrimary} disabled={processing} onClick={async () => {
                        const rate = parseFloat(editCommRate) / 100;
                        if (rate < 0.01 || rate > 1) { setError('Rate must be 1-100%'); return; }
                        const res = await doAction('/api/club-arena/manage-union', { action: 'update_club_commission', unionId, clubId: editCommClub.id, commissionRate: rate }, 'Commission updated', { busEvent: 'union:commission-updated' });
                        if (res) { setEditCommClub(null); loadDashboard(unionId); }
                      }}>Save</button>
                      <button className={s.btnGhost} onClick={() => setEditCommClub(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════ AGENTS TAB ════════════════════ */}
          {tab === 'agents' && (
            <>
              <div className={s.statsGrid}>
                <div className={s.statCard}><div className={s.statValueGreen}>{fmt(stats?.totalAgents)}</div><div className={s.statLabel}>Active</div></div>
                <div className={s.statCard}><div className={s.statValueRed}>{fmt(stats?.totalSuspendedAgents)}</div><div className={s.statLabel}>Suspended</div></div>
                <div className={s.statCard}><div className={s.statValue}>{fmt(stats?.totalAgentPlayers)}</div><div className={s.statLabel}>Agent Players</div></div>
                <div className={s.statCard}><div className={s.statValueGold}>{fmt(stats?.totalWeeklyRake)}</div><div className={s.statLabel}>Weekly Rake</div></div>
              </div>

              <div className={s.section}>
                <div className={s.sectionTitle}>
                  All Agents ({filteredAgents.length})
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    {!commHistory && <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={loadCommHistory}>Commission History</button>}
                    <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={exportAgents}>📥 Export CSV</button>
                  </div>
                </div>
                {/* Agent Search */}
                <div className={s.formRow} style={{ marginBottom: 8 }}>
                  <div className={s.formGroup} style={{ maxWidth: 300 }}>
                    <input className={s.formInput} value={agentSearch} onChange={e => setAgentSearch(e.target.value)} placeholder="Search agents by name or role..." />
                  </div>
                </div>
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead><tr>
                      <th>Agent</th><th>Club</th><th>Role</th><th>Commission</th><th>Players</th><th>Earnings</th><th>Credit</th><th>Status</th>
                    </tr></thead>
                    <tbody>
                      {filteredAgents.map(agent => {
                        const club = clubs.find(c => c.id === agent.club_id);
                        return (
                          <tr key={agent.id}>
                            <td>{agent.profile?.display_name || agent.profile?.username || agent.user_id?.slice(0, 8)}</td>
                            <td>{club?.name || 'Unknown'}</td>
                            <td>{agent.role}</td>
                            <td>{pct(agent.commission_rate)}</td>
                            <td>{fmt(agent.active_player_count)}</td>
                            <td style={{ color: '#31A24C' }}>{fmt(agent.lifetime_earnings)}</td>
                            <td style={{ color: agent.credit_used > 0 ? '#E41E3F' : '#B0B3B8' }}>{agent.is_prepaid ? 'Prepaid' : fmt(agent.credit_used)}</td>
                            <td><span className={`${s.statusBadge} ${agent.status === 'active' ? s.statusApproved : s.statusRejected}`}>{agent.status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filteredAgents.length === 0 && <div className={s.emptyState}><span className={s.emptyIcon}>👤</span><div className={s.emptyText}>{agentSearch ? 'No agents match your search' : 'No agents found'}</div></div>}
              </div>

              {/* Commission History */}
              {commHistory && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Recent Commission Payouts</div>
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Agent</th><th>Club</th><th>Rake</th><th>Rate</th><th>Commission</th><th>When</th></tr></thead>
                      <tbody>
                        {commHistory.slice(0, 50).map(row => {
                          const club = clubs.find(c => c.id === row.club_id);
                          return (
                            <tr key={row.id}>
                              <td>{row.agent_name || row.agent_user_id?.slice(0, 8)}</td>
                              <td>{club?.name || 'Unknown'}</td>
                              <td>{fmt(row.gross_rake)}</td>
                              <td>{pct(row.commission_rate)}</td>
                              <td style={{ color: '#31A24C' }}>{fmt(row.commission_amount)}</td>
                              <td>{timeAgo(row.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════ WALLET TAB ════════════════════ */}
          {tab === 'wallet' && (
            <>
              {walletLoading && <div className={s.loading}>Loading wallet...</div>}

              {walletData && (
                <>
                  <div className={s.walletGrid}>
                    <div className={s.walletChips}><div className={s.walletLabel}>Chip Balance</div><div className={s.walletAmount}>{fmt(walletData.wallets?.chip_balance)}</div></div>
                    <div className={s.walletRake}><div className={s.walletLabel}>Rake Wallet</div><div className={s.walletAmount}>{fmt(walletData.wallets?.rake_wallet)}</div></div>
                    <div className={s.walletBBJ}><div className={s.walletLabel}>BBJ Pool</div><div className={s.walletAmount}>{fmt(walletData.wallets?.bbj_wallet)}</div></div>
                    <div className={s.walletPromo}><div className={s.walletLabel}>Promo Wallet</div><div className={s.walletAmount}>{fmt(walletData.wallets?.promo_wallet)}</div></div>
                  </div>

                  {/* Send to Club */}
                  {isLead && (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>Send Chips to Club</div>
                      <div className={s.formRow}>
                        <div className={s.formGroup}>
                          <label className={s.formLabel}>Club</label>
                          <select className={s.formSelect} value={transferForm.clubId} onChange={e => setTransferForm(f => ({ ...f, clubId: e.target.value }))}>
                            <option value="">Select club...</option>
                            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div className={s.formGroup}>
                          <label className={s.formLabel}>Amount</label>
                          <input className={s.formInput} type="number" min="1" value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} placeholder="10000" />
                        </div>
                        <div className={s.formGroup}>
                          <label className={s.formLabel}>Notes</label>
                          <input className={s.formInput} value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                        </div>
                        <button className={s.btnPrimary} disabled={processing || !transferForm.clubId || !transferForm.amount} onClick={async () => {
                          const res = await doAction('/api/club-arena/union-wallet', {
                            action: 'send_to_club', unionId, clubId: transferForm.clubId, amount: parseInt(transferForm.amount), notes: transferForm.notes || undefined
                          }, undefined, { busEvent: 'union:wallet-transfer', invalidateWallet: true });
                          if (res) { setTransferForm({ clubId: '', amount: '', notes: '' }); loadWallet(); }
                        }}>Send</button>
                      </div>
                    </div>
                  )}

                  {/* Move Rake to Chips */}
                  {isLead && walletData.wallets?.rake_wallet > 0 && (
                    <div className={s.section}>
                      <div className={s.sectionTitle}>Move Rake to Chip Balance</div>
                      <div className={s.sectionSubtitle}>Available: {fmt(walletData.wallets?.rake_wallet)} in rake wallet</div>
                      <div className={s.formRow}>
                        <div className={s.formGroup} style={{ maxWidth: 200 }}>
                          <input className={s.formInput} type="number" min="1" max={walletData.wallets?.rake_wallet} value={rakeAmount} onChange={e => setRakeAmount(e.target.value)} placeholder="Amount" />
                        </div>
                        <button className={s.btnSuccess} disabled={processing || !rakeAmount} onClick={async () => {
                          const res = await doAction('/api/club-arena/union-wallet', { action: 'move_rake_to_chips', unionId, amount: parseInt(rakeAmount) }, undefined, { busEvent: 'union:wallet-transfer', invalidateWallet: true });
                          if (res) { setRakeAmount(''); loadWallet(); }
                        }}>Convert</button>
                      </div>
                    </div>
                  )}

                  {/* Transaction History */}
                  <div className={s.section}>
                    <div className={s.sectionTitle}>
                      Transaction History
                      {(walletData.recentTransactions || []).length > 0 && <button className={`${s.btnGhost} ${s.btnSmall}`} style={{ marginLeft: 'auto' }} onClick={exportTransactions}>📥 Export CSV</button>}
                    </div>
                    <div className={s.tableScroll}>
                      <table className={s.dataTable}>
                        <thead><tr><th>Type</th><th>Wallet</th><th>Dir</th><th>Amount</th><th>Club</th><th>Notes</th><th>When</th></tr></thead>
                        <tbody>
                          {(walletData.recentTransactions || []).slice(0, txPage * TX_PER_PAGE).map(tx => (
                            <tr key={tx.id}>
                              <td>{tx.tx_type}</td>
                              <td>{tx.wallet}</td>
                              <td style={{ color: tx.direction === 'credit' ? '#31A24C' : '#E41E3F' }}>{tx.direction}</td>
                              <td>{fmt(tx.amount)}</td>
                              <td>{tx.clubs?.name || '-'}</td>
                              <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.notes || '-'}</td>
                              <td>{timeAgo(tx.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(walletData.recentTransactions || []).length > txPage * TX_PER_PAGE && (
                      <button className={s.btnGhost} style={{ marginTop: 8, width: '100%' }} onClick={() => setTxPage(p => p + 1)}>Load More ({(walletData.recentTransactions || []).length - txPage * TX_PER_PAGE} remaining)</button>
                    )}
                    {(!walletData.recentTransactions || walletData.recentTransactions.length === 0) && (
                      <div className={s.emptyState}><span className={s.emptyIcon}>📋</span><div className={s.emptyText}>No transactions yet</div></div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ══════════════════ APPLICATIONS TAB ══════════════ */}
          {tab === 'applications' && (
            <>
              <div className={s.formRow} style={{ marginBottom: 16 }}>
                <div className={s.formGroup} style={{ maxWidth: 200 }}>
                  <label className={s.formLabel}>Status Filter</label>
                  <select className={s.formSelect} value={appsFilter} onChange={e => { setAppsFilter(e.target.value); loadApps(e.target.value); }}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="all">All</option>
                  </select>
                </div>
                <button className={s.btnGhost} onClick={() => loadApps()} disabled={appsLoading}>Refresh</button>
              </div>

              {appsLoading && <div className={s.loading}>Loading applications...</div>}

              {!appsLoading && apps.length > 0 && (
                <div className={s.cardGrid}>
                  {apps.map(app => (
                    <div key={app.id} className={s.card}>
                      <div className={s.cardHeader}>
                        <div>
                          <div className={s.cardName}>{app.club_name}</div>
                          <div style={{ fontSize: 12, color: '#B0B3B8' }}>Code: {app.club_code} — {app.member_count || 0} members</div>
                        </div>
                        <span className={`${s.statusBadge} ${statusClass(app.status)}`}>{app.status}</span>
                      </div>
                      {app.message && <div style={{ fontSize: 13, color: '#B0B3B8', margin: '8px 0', fontStyle: 'italic' }}>"{app.message}"</div>}
                      <div style={{ fontSize: 12, color: '#B0B3B8' }}>Applied {timeAgo(app.applied_at)}</div>
                      {app.status === 'pending' && isLead && (
                        <div className={s.cardActions}>
                          <button className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                            const res = await doAction('/api/club-arena/union-application', { action: 'approve', applicationId: app.id }, `${app.club_name} approved`, { busEvent: 'union:application-reviewed' });
                            if (res) { setAppsLoaded(false); loadApps(); }
                          }}>Approve</button>
                          <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                            if (!confirm(`Reject ${app.club_name}'s application?`)) return;
                            const res = await doAction('/api/club-arena/union-application', { action: 'reject', applicationId: app.id }, `${app.club_name} rejected`, { busEvent: 'union:application-reviewed' });
                            if (res) { setAppsLoaded(false); loadApps(); }
                          }}>Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!appsLoading && apps.length === 0 && (
                <div className={s.emptyState}><span className={s.emptyIcon}>📝</span><div className={s.emptyText}>No {appsFilter} applications</div></div>
              )}

              {/* Leave Requests */}
              {leaveRequests.length > 0 && (
                <div className={s.section} style={{ marginTop: 24 }}>
                  <div className={s.sectionTitle}>Pending Leave Requests</div>
                  <div className={s.cardGrid}>
                    {leaveRequests.map(lr => (
                      <div key={lr.id} className={s.card}>
                        <div className={s.cardName}>{lr.club_name}</div>
                        {lr.reason && <div style={{ fontSize: 13, color: '#B0B3B8', margin: '6px 0' }}>Reason: {lr.reason}</div>}
                        <div style={{ fontSize: 12, color: '#B0B3B8' }}>Requested {timeAgo(lr.requested_at)}</div>
                        {isLead && (
                          <div className={s.cardActions}>
                            <button className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                              const res = await doAction('/api/club-arena/manage-union', { action: 'approve_leave', unionId, leaveRequestId: lr.id }, `${lr.club_name} leave approved`);
                              if (res) { loadLeave(); loadDashboard(unionId); }
                            }}>Approve Leave</button>
                            <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                              const res = await doAction('/api/club-arena/manage-union', { action: 'deny_leave', unionId, leaveRequestId: lr.id }, `${lr.club_name} leave denied`);
                              if (res) loadLeave();
                            }}>Deny</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════ SETTINGS TAB ══════════════════ */}
          {tab === 'settings' && (
            <>
              {/* Union Settings */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Union Settings</div>
                {isLead ? (
                  <>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Union Name</label>
                        <input className={s.formInput} value={settingsForm.name ?? union?.name ?? ''} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                    </div>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Description</label>
                        <textarea className={s.formTextarea} value={settingsForm.description ?? union?.description ?? ''} onChange={e => setSettingsForm(f => ({ ...f, description: e.target.value }))} />
                      </div>
                    </div>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Union Rake Hold (%)</label>
                        <input className={s.formInput} type="number" min="0" max="50" step="0.1"
                          value={settingsForm.union_rake_hold ?? ((union?.settings?.union_rake_hold || 0.1) * 100)}
                          onChange={e => setSettingsForm(f => ({ ...f, union_rake_hold: e.target.value }))} />
                      </div>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Default Agent Commission (%)</label>
                        <input className={s.formInput} type="number" min="0" max="100" step="0.1"
                          value={settingsForm.default_agent_commission ?? ((union?.settings?.default_agent_commission || 0.5) * 100)}
                          onChange={e => setSettingsForm(f => ({ ...f, default_agent_commission: e.target.value }))} />
                      </div>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>Default Club Commission (%)</label>
                        <input className={s.formInput} type="number" min="1" max="100" step="0.1"
                          value={settingsForm.default_club_commission_rate ?? ((union?.settings?.default_club_commission_rate || 0.9) * 100)}
                          onChange={e => setSettingsForm(f => ({ ...f, default_club_commission_rate: e.target.value }))} />
                      </div>
                    </div>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>BBJ Main (%)</label>
                        <input className={s.formInput} type="number" min="0" max="100"
                          value={settingsForm.bbj_main_pct ?? (union?.settings?.bbj_main_pct ?? 50)}
                          onChange={e => setSettingsForm(f => ({ ...f, bbj_main_pct: e.target.value }))} />
                      </div>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>BBJ Backup (%)</label>
                        <input className={s.formInput} type="number" min="0" max="100"
                          value={settingsForm.bbj_backup_pct ?? (union?.settings?.bbj_backup_pct ?? 25)}
                          onChange={e => setSettingsForm(f => ({ ...f, bbj_backup_pct: e.target.value }))} />
                      </div>
                      <div className={s.formGroup}>
                        <label className={s.formLabel}>BBJ Promo (%)</label>
                        <input className={s.formInput} type="number" min="0" max="100"
                          value={settingsForm.bbj_promo_pct ?? (union?.settings?.bbj_promo_pct ?? 25)}
                          onChange={e => setSettingsForm(f => ({ ...f, bbj_promo_pct: e.target.value }))} />
                      </div>
                    </div>
                    <button className={s.btnPrimary} disabled={processing} onClick={async () => {
                      const updates = {};
                      if (settingsForm.name) updates.name = settingsForm.name;
                      if (settingsForm.description !== undefined) updates.description = settingsForm.description;
                      const settings = {};
                      if (settingsForm.union_rake_hold) settings.union_rake_hold = parseFloat(settingsForm.union_rake_hold) / 100;
                      if (settingsForm.default_agent_commission) settings.default_agent_commission = parseFloat(settingsForm.default_agent_commission) / 100;
                      if (settingsForm.default_club_commission_rate) settings.default_club_commission_rate = parseFloat(settingsForm.default_club_commission_rate) / 100;
                      if (settingsForm.bbj_main_pct !== undefined) settings.bbj_main_pct = parseInt(settingsForm.bbj_main_pct);
                      if (settingsForm.bbj_backup_pct !== undefined) settings.bbj_backup_pct = parseInt(settingsForm.bbj_backup_pct);
                      if (settingsForm.bbj_promo_pct !== undefined) settings.bbj_promo_pct = parseInt(settingsForm.bbj_promo_pct);
                      if (Object.keys(settings).length > 0) updates.settings = settings;
                      // Confirmation dialog for financial settings changes
                      const hasFinancialChanges = settings.union_rake_hold !== undefined || settings.default_agent_commission !== undefined || settings.default_club_commission_rate !== undefined;
                      if (hasFinancialChanges) {
                        const summary = [];
                        if (settings.union_rake_hold !== undefined) summary.push(`Rake Hold: ${(settings.union_rake_hold * 100).toFixed(1)}%`);
                        if (settings.default_agent_commission !== undefined) summary.push(`Agent Comm: ${(settings.default_agent_commission * 100).toFixed(1)}%`);
                        if (settings.default_club_commission_rate !== undefined) summary.push(`Club Comm: ${(settings.default_club_commission_rate * 100).toFixed(1)}%`);
                        if (!confirm(`Confirm financial settings changes?\n\n${summary.join('\n')}\n\nThese changes affect all clubs and agents in the union.`)) return;
                      }
                      const res = await doAction('/api/club-arena/manage-union', { action: 'update_settings', unionId, ...updates }, 'Settings saved', { busEvent: 'union:settings-updated' });
                      if (res) loadDashboard(unionId);
                    }}>Save Settings</button>
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: '#B0B3B8' }}>
                    <div>Rake Hold: {pct(union?.settings?.union_rake_hold)}</div>
                    <div>Agent Commission: {pct(union?.settings?.default_agent_commission)}</div>
                    <div>Club Commission: {pct(union?.settings?.default_club_commission_rate)}</div>
                  </div>
                )}
              </div>

              {/* Admin Management */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Union Admins</div>
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead><tr><th>Admin</th><th>Role</th><th>Since</th>{isLead && <th>Actions</th>}</tr></thead>
                    <tbody>
                      {(admins || []).map(admin => (
                        <tr key={admin.user_id}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {admin.profile?.avatar_url && <img src={admin.profile.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
                            {admin.profile?.display_name || admin.profile?.username || admin.user_id?.slice(0, 8)}
                          </td>
                          <td><span className={`${s.statusBadge} ${admin.role === 'union_lead' ? s.statusRunning : s.statusApproved}`}>{admin.role}</span></td>
                          <td>{timeAgo(admin.created_at)}</td>
                          {isLead && (
                            <td>
                              {admin.role !== 'union_lead' && (
                                <button className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                                  if (!confirm('Remove this admin?')) return;
                                  const res = await doAction('/api/club-arena/manage-union', { action: 'remove_admin', unionId, adminUserId: admin.user_id }, 'Admin removed');
                                  if (res) loadDashboard(unionId);
                                }}>Remove</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Admin */}
                {isLead && (
                  <div style={{ marginTop: 16 }}>
                    <div className={s.sectionSubtitle}>Add Admin</div>
                    <div className={s.formRow}>
                      <div className={s.formGroup}>
                        <input className={s.formInput} value={adminSearch} onChange={e => setAdminSearch(e.target.value)} placeholder="Search by username..." />
                      </div>
                      <button className={s.btnGhost} disabled={processing || adminSearch.length < 2} onClick={async () => {
                        setProcessing(true); setError(null);
                        try {
                          const res = await apiCall('/api/club-arena/manage-union', { action: 'search_user', unionId, query: adminSearch });
                          if (res?.users) setAdminResults(res.users);
                        } catch (err) { setError(err.message); }
                        finally { setProcessing(false); }
                      }}>Search</button>
                    </div>
                    {adminResults.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {adminResults.map(u => (
                          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#18191A', borderRadius: 8 }}>
                            <span>{u.display_name || u.username || u.id.slice(0, 8)}</span>
                            <button className={`${s.btnSuccess} ${s.btnSmall}`} disabled={processing} onClick={async () => {
                              const res = await doAction('/api/club-arena/manage-union', { action: 'add_admin', unionId, adminUserId: u.id }, `${u.display_name || u.username} added as admin`, { busEvent: 'union:admin-changed' });
                              if (res) { setAdminResults([]); setAdminSearch(''); loadDashboard(unionId); }
                            }}>Add Admin</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Settlement Periods */}
              {recentPeriods.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>
                    Recent Settlement Periods
                    <button className={`${s.btnGhost} ${s.btnSmall}`} style={{ marginLeft: 'auto' }} onClick={exportSettlements}>📥 Export CSV</button>
                  </div>
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Club</th><th>Period</th><th>Rake</th><th>Hands</th><th>Status</th><th>Date</th></tr></thead>
                      <tbody>
                        {recentPeriods.slice(0, 20).map(p => {
                          const club = clubs.find(c => c.id === p.club_id);
                          return (
                            <tr key={p.id}>
                              <td>{club?.name || 'Unknown'}</td>
                              <td>#{p.period_number}</td>
                              <td style={{ color: '#31A24C' }}>{fmt(p.total_rake_collected)}</td>
                              <td>{fmt(p.total_hands_dealt)}</td>
                              <td><span className={`${s.statusBadge} ${statusClass(p.status)}`}>{p.status}</span></td>
                              <td>{timeAgo(p.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
