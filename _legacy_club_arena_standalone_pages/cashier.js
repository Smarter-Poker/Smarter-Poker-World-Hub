/* ═══════════════════════════════════════════════════════════════
   Club Arena Cashier — Native Hub Page (replaces iframe shell)
   3 Tabs: Wallet | Cashout | History
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
import retryAsync, { createDebouncedHandler } from '../../../src/lib/club-arena/retryAsync';
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
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};
const statusClass = (status) => {
  const map = { pending: s.statusPending, processing: s.statusWaiting, approved: s.statusApproved, completed: s.statusApproved, cancelled: s.statusRejected, denied: s.statusRejected };
  return map[status] || s.statusPending;
};

export default function ClubArenaCashierPage() {
  useTrainingBus('club-arena-cashier');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('wallet');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Wallet data
  const [balance, setBalance] = useState(0);
  const [promoBalance, setPromoBalance] = useState(0);
  const [role, setRole] = useState('player');
  const [pendingCashouts, setPendingCashouts] = useState([]);
  const [recentTxns, setRecentTxns] = useState([]);
  const [quickAmounts, setQuickAmounts] = useState([1000, 5000, 10000, 25000, 50000]);
  const [totalPending, setTotalPending] = useState(0);

  // Cashout form
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutNote, setCashoutNote] = useState('');

  // History
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Rakeback
  const [rakebackStatus, setRakebackStatus] = useState(null);
  const [rakebackHistory, setRakebackHistory] = useState([]);
  const [rakebackLoaded, setRakebackLoaded] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Distribute (admin/agent)
  const [distUserId, setDistUserId] = useState('');
  const [distAmount, setDistAmount] = useState('');
  const [distNotes, setDistNotes] = useState('');
  const [distSearch, setDistSearch] = useState('');
  const [distSearchResults, setDistSearchResults] = useState([]);
  const [distSelectedName, setDistSelectedName] = useState('');
  const [distSearching, setDistSearching] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Auto-clear success ────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // ── Load Cashier Summary ──────────────────────────────────
  const loadCashier = useCallback(async (cId) => {
    try {
      setLoading(true);
      setError(null);
      const targetClubId = cId || clubId;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }
      const res = await retryAsync(() => apiCall('/api/club-arena/cashier-info', { clubId: targetClubId, action: 'summary' }), { label: 'loadCashier' });
      if (mountedRef.current) {
        setBalance(res.balance || 0);
        setPromoBalance(res.promoBalance || 0);
        setRole(res.role || 'player');
        setPendingCashouts(res.pendingCashouts || []);
        setRecentTxns(res.recentTransactions || []);
        setQuickAmounts(res.quickAmounts || [1000, 5000, 10000, 25000, 50000]);
        setTotalPending(res.totalPendingCashout || 0);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId]);

  // ── Load History (Lazy) ────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (historyLoaded || !clubId) return;
    try {
      const res = await apiGet(`/api/club-arena/cashout-history?clubId=${clubId}`);
      if (mountedRef.current) { setHistory(res.cashouts || []); setHistoryLoaded(true); }
    } catch (err) {
      console.warn('[Cashier] History failed:', err.message);
    }
  }, [clubId, historyLoaded]);

  // ── Initial Load ───────────────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return; // Wait for Next.js to hydrate query params
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      if (qClub) {
        const resolvedClub = await resolveClubId(qClub);
        setClubId(resolvedClub); loadCashier(resolvedClub); return;
      }
      if (session) {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: membership } = await supabase
          .from('club_members').select('club_id').eq('user_id', session.user.id)
          .limit(1).maybeSingle();
        if (membership?.club_id && !cancelled) { setClubId(membership.club_id); loadCashier(membership.club_id); return; }
      }
      if (!cancelled) { setError('No club found.'); setLoading(false); }
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
  }, [router.isReady, router.query.club, router.query.clubId]);

  // ── Lazy History Loading ───────────────────────────────────
  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── Lazy Rakeback Loading ─────────────────────────────────
  useEffect(() => {
    if (tab !== 'rakeback' || rakebackLoaded || !clubId) return;
    let cancelled = false;
    (async () => {
      try {
        const [statusRes, histRes] = await Promise.all([
          apiGet(`/api/club-arena/rakeback?clubId=${clubId}&action=status`),
          apiGet(`/api/club-arena/rakeback?clubId=${clubId}&action=history`),
        ]);
        if (!cancelled && mountedRef.current) {
          setRakebackStatus(statusRes);
          setRakebackHistory(histRes.history || []);
          setRakebackLoaded(true);
        }
      } catch (err) {
        console.warn('[Cashier] Rakeback load failed:', err.message);
        if (!cancelled && mountedRef.current) setRakebackLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, rakebackLoaded, clubId]);

  // ── EventBus (debounced) ───────────────────────────────────
  useEffect(() => {
    const debouncedRefresh = createDebouncedHandler(() => { if (clubId) loadCashier(clubId); }, 300);
    const events = ['CASHOUT_APPROVED', 'CASHOUT_CANCELLED', 'CHIPS_DISTRIBUTED', 'BALANCE_UPDATED',
      'CREDIT_UPDATED', 'RAKEBACK_CLAIMED', 'CASHIER_BALANCE_CHANGED'];
    events.forEach(ev => eventBus.on(ev, debouncedRefresh));
    return () => { debouncedRefresh.cancel(); events.forEach(ev => eventBus.off(ev, debouncedRefresh)); };
  }, [clubId, loadCashier]);

  // ── Actions ────────────────────────────────────────────────
  const requestCashout = async () => {
    const amount = parseInt(cashoutAmount, 10);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    const available = balance - totalPending;
    if (amount > available) { setError(`Insufficient balance. Available: ${fmtChips(available)} chips.`); return; }
    setProcessing(true);
    try {
      await apiCall('/api/club-arena/request-cashout', { clubId, amount, note: cashoutNote || undefined });
      setSuccess(`Cashout request for ${fmtChips(amount)} chips submitted.`);
      busEmit('CASHOUT_REQUESTED', { clubId, amount });
      setCashoutAmount(''); setCashoutNote('');
      setHistoryLoaded(false);
      loadCashier(clubId);
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  const cancelCashout = async (cashoutId) => {
    if (!confirm('Cancel this cashout? Chips will be returned to your balance.')) return;
    setProcessing(true);
    try {
      await apiCall('/api/club-arena/cancel-my-cashout', { cashoutId, clubId });
      setSuccess('Cashout cancelled. Chips returned.');
      busEmit('CASHOUT_CANCELLED', { cashoutId, clubId });
      setHistoryLoaded(false);
      loadCashier(clubId);
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  // ── Rakeback Actions ───────────────────────────────────────
  const handleRakebackClaim = async () => {
    setClaiming(true);
    try {
      const res = await apiCall('/api/club-arena/rakeback', { action: 'claim', clubId });
      setSuccess(`🎁 Claimed ${fmt(res.claimed)} chips! New balance: ${fmt(res.newBalance)}`);
      setBalance(res.newBalance || balance);
      busEmit('CASHIER_BALANCE_CHANGED', { clubId, balance: res.newBalance });
      busEmit('RAKEBACK_CLAIMED', { clubId, claimed: res.claimed });
      setRakebackLoaded(false); // Trigger re-fetch
    } catch (err) { setError(err.message); }
    finally { setClaiming(false); }
  };

  const handleRakebackPeriod = async (action) => {
    if (action === 'close' && !confirm('Close the current rakeback period? This will calculate rakeback for all players.')) return;
    setProcessing(true);
    try {
      const res = await apiCall('/api/club-arena/rakeback', { action, clubId });
      setSuccess(action === 'open' ? 'Rakeback period opened!' : `Period closed. ${res.playersProcessed || 0} players processed, ${fmt(res.totalRakebackDistributed || 0)} chips distributed.`);
      setRakebackLoaded(false); // Trigger re-fetch
      // BUG FIX: Closing a period distributes chips — notify other pages
      if (action === 'close' && (res.totalRakebackDistributed || 0) > 0) {
        busEmit('CHIPS_DISTRIBUTED', { clubId });
        busEmit('CASHIER_BALANCE_CHANGED', { clubId });
      }
    } catch (err) { setError(err.message); }
    finally { setProcessing(false); }
  };

  // Hook must be called before any early return (Rules of Hooks)
  const availableForCashout = useMemo(() => balance - totalPending, [balance, totalPending]);

  // ── Loading / Login ────────────────────────────────────────
  if (loading) {
    return (
      <HubErrorBoundary name="Cashier">
        <SEOHead title="Cashier | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Loading Cashier...</div></div>
      </HubErrorBoundary>
    );
  }

  // ── Player search for distribute ─────────────────────────────
  const searchPlayers = async (query) => {
    setDistSearch(query);
    if (!query || query.length < 2) { setDistSearchResults([]); return; }
    setDistSearching(true);
    try {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data } = await supabase
        .from('club_members')
        .select('user_id, nickname, profiles!inner(display_name, username)')
        .eq('club_id', clubId)
        .eq('status', 'active')
        .or(`nickname.ilike.%${query}%,profiles.display_name.ilike.%${query}%,profiles.username.ilike.%${query}%`)
        .limit(8);
      setDistSearchResults(data || []);
    } catch { setDistSearchResults([]); }
    finally { setDistSearching(false); }
  };

  const selectDistPlayer = (member) => {
    const name = member.nickname || member.profiles?.display_name || member.profiles?.username || member.user_id;
    setDistUserId(member.user_id);
    setDistSelectedName(name);
    setDistSearch(name);
    setDistSearchResults([]);
  };

  return (
    <HubErrorBoundary name="Cashier">
      <SEOHead title="Cashier | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Success ────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Cashier.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              💰 Cashier
              <span className={s.unionCode}>{role.toUpperCase()}</span>
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadCashier(clubId)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className={s.tabs}>
            {[
              { id: 'wallet', label: 'Wallet' },
              { id: 'cashout', label: 'Cashout', badge: pendingCashouts.length || null },
              { id: 'history', label: 'History' },
              { id: 'rakeback', label: '🎁 Rakeback', badge: rakebackStatus?.pendingRakeback > 0 ? 1 : null },
              ...(['owner', 'admin', 'agent', 'super_agent'].includes(role) ? [{ id: 'distribute', label: '💸 Distribute' }] : []),
            ].map(t => (
              <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge ? <span className={s.tabBadge}>{t.badge}</span> : null}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: WALLET                                      */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'wallet' && (
            <>
              {/* Balance Cards */}
              <div className={s.walletGrid}>
                <div className={s.walletChips}>
                  <div className={s.walletLabel}>💰 Chip Balance</div>
                  <div className={s.walletAmount}>{fmt(balance)}</div>
                </div>
                <div className={s.walletPromo}>
                  <div className={s.walletLabel}>🎁 Promo Balance</div>
                  <div className={s.walletAmount}>{fmt(promoBalance)}</div>
                </div>
                {totalPending > 0 && (
                  <div className={s.walletBBJ}>
                    <div className={s.walletLabel}>⏳ Pending Cashouts</div>
                    <div className={s.walletAmount}>{fmt(totalPending)}</div>
                  </div>
                )}
                <div className={s.walletRake}>
                  <div className={s.walletLabel}>✅ Available</div>
                  <div className={s.walletAmount}>{fmt(availableForCashout)}</div>
                </div>
              </div>

              {/* Pending Cashout Requests */}
              {pendingCashouts.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>⏳ Pending Cashout Requests</div>
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Amount</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
                      <tbody>
                        {pendingCashouts.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(c.amount)}</td>
                            <td><span className={`${s.statusBadge} ${statusClass(c.status)}`}>{c.status}</span></td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(c.created_at)}</td>
                            <td>
                              {c.status === 'pending' && (
                                <button onClick={() => cancelCashout(c.id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Cancel</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Transactions */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Recent Transactions</div>
                {recentTxns.length === 0 ? (
                  <div className={s.emptyState}><span className={s.emptyIcon}>📋</span><span className={s.emptyText}>No recent transactions</span></div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Type</th><th>Amount</th><th>Notes</th><th>Time</th></tr></thead>
                      <tbody>
                        {recentTxns.map((tx, i) => (
                          <tr key={tx.id || i}>
                            <td><span className={`${s.statusBadge} ${tx.direction === 'in' ? s.statusApproved : s.statusRejected}`}>{tx.transaction_type || 'transfer'}</span></td>
                            <td style={{ fontWeight: 700, color: tx.direction === 'in' ? '#31A24C' : '#E41E3F' }}>{tx.displayAmount}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.notes || '—'}</td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(tx.created_at)}</td>
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
          {/*  TAB: CASHOUT                                     */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'cashout' && (
            <>
              {/* Balance Summary */}
              <div className={s.statsGrid}>
                <div className={s.statCard}><div className={s.statValue}>{fmt(balance)}</div><div className={s.statLabel}>Chip Balance</div></div>
                <div className={s.statCard}><div className={s.statValueRed}>{fmt(totalPending)}</div><div className={s.statLabel}>Pending</div></div>
                <div className={s.statCard}><div className={s.statValueGreen}>{fmt(availableForCashout)}</div><div className={s.statLabel}>Available</div></div>
              </div>

              {/* Cashout Request Form */}
              <div className={s.section}>
                <div className={s.sectionTitle}>Request Cashout</div>
                <div className={s.sectionSubtitle}>Submit a cashout request to your agent. Chips will be locked until processed.</div>

                {/* Quick Amount Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {quickAmounts.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setCashoutAmount(String(Math.min(amt, availableForCashout)))}
                      className={s.btnGhost}
                      style={{ flex: '1', minWidth: '70px' }}
                      disabled={amt > availableForCashout}
                    >
                      {fmtChips(amt)}
                    </button>
                  ))}
                  <button onClick={() => setCashoutAmount(String(availableForCashout))} className={s.btnGold} style={{ flex: '1', minWidth: '70px' }}>
                    MAX
                  </button>
                </div>

                {/* Amount Input */}
                <div className={s.formRow}>
                  <div className={s.formGroup}>
                    <label className={s.formLabel}>Cashout Amount</label>
                    <input
                      className={s.formInput}
                      type="number"
                      placeholder="Enter amount..."
                      value={cashoutAmount}
                      onChange={e => setCashoutAmount(e.target.value)}
                      max={availableForCashout}
                    />
                  </div>
                  <div className={s.formGroup}>
                    <label className={s.formLabel}>Note (optional)</label>
                    <input className={s.formInput} placeholder="e.g. Venmo preferred..." value={cashoutNote} onChange={e => setCashoutNote(e.target.value)} />
                  </div>
                </div>

                {/* Validation / Submit */}
                {parseInt(cashoutAmount, 10) > availableForCashout && (
                  <div className={s.error} style={{ marginBottom: '12px' }}>Amount exceeds available balance ({fmt(availableForCashout)}).</div>
                )}
                <button
                  onClick={requestCashout}
                  className={s.btnPrimary}
                  disabled={processing || !cashoutAmount || parseInt(cashoutAmount, 10) <= 0 || parseInt(cashoutAmount, 10) > availableForCashout}
                  style={{ width: '100%', padding: '14px', fontSize: '15px' }}
                >
                  {processing ? 'Submitting...' : `💰 Request Cashout — ${cashoutAmount ? fmtChips(parseInt(cashoutAmount, 10)) : '0'} chips`}
                </button>
              </div>

              {/* Active Pending Requests */}
              {pendingCashouts.length > 0 && (
                <div className={s.section}>
                  <div className={s.sectionTitle}>Active Requests ({pendingCashouts.length})</div>
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead><tr><th>Amount</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead>
                      <tbody>
                        {pendingCashouts.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700 }}>{fmtChips(c.amount)}</td>
                            <td><span className={`${s.statusBadge} ${statusClass(c.status)}`}>{c.status}</span></td>
                            <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(c.created_at)}</td>
                            <td>{c.status === 'pending' && <button onClick={() => cancelCashout(c.id)} className={`${s.btnDanger} ${s.btnSmall}`} disabled={processing}>Cancel</button>}</td>
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
          {/*  TAB: HISTORY                                     */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'history' && (
            <>
              {!historyLoaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[1,2,3,4].map(i => <div key={i} className={s.shimmerLine} style={{ height: '50px', borderRadius: '8px' }} />)}
                </div>
              ) : history.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>📜</span><span className={s.emptyText}>No cashout history</span></div>
              ) : (
                <>
                  {/* Summary Stats */}
                  <div className={s.statsGrid}>
                    <div className={s.statCard}>
                      <div className={s.statValueBlue}>{fmt(history.length)}</div>
                      <div className={s.statLabel}>Total Requests</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueGreen}>{fmtChips(history.filter(h => h.status === 'approved' || h.status === 'completed').reduce((sum, h) => sum + (h.amount || 0), 0))}</div>
                      <div className={s.statLabel}>Completed</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueGold}>{fmt(history.filter(h => h.status === 'pending' || h.status === 'processing').length)}</div>
                      <div className={s.statLabel}>Pending</div>
                    </div>
                    <div className={s.statCard}>
                      <div className={s.statValueRed}>{fmt(history.filter(h => h.status === 'cancelled' || h.status === 'denied').length)}</div>
                      <div className={s.statLabel}>Cancelled</div>
                    </div>
                  </div>

                  {/* History Table */}
                  <div className={s.section}>
                    <div className={s.sectionTitle}>Cashout Request History</div>
                    <div className={s.tableScroll}>
                      <table className={s.dataTable}>
                        <thead>
                          <tr>
                            {['owner', 'admin', 'super_agent', 'agent'].includes(role) && <th>Player</th>}
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map(h => (
                            <tr key={h.id}>
                              {['owner', 'admin', 'super_agent', 'agent'].includes(role) && (
                                <td style={{ fontWeight: 600 }}>{h.player_profile?.display_name || h.player_profile?.username || h.player_id?.substring(0, 8) || '—'}</td>
                              )}
                              <td style={{ fontWeight: 700, color: h.status === 'approved' || h.status === 'completed' ? '#31A24C' : '#E4E6EB' }}>{fmtChips(h.amount)}</td>
                              <td><span className={`${s.statusBadge} ${statusClass(h.status)}`}>{h.status}</span></td>
                              <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(h.created_at)}</td>
                              <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{timeAgo(h.updated_at)}</td>
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

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: RAKEBACK                                    */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'rakeback' && (
            <>
              {!rakebackLoaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[1,2,3].map(i => <div key={i} className={s.shimmerLine} style={{ height: '60px', borderRadius: '8px' }} />)}
                </div>
              ) : (
                <>
                    {/* Rakeback Stats */}
                    <div className={s.statsGrid}>
                      <div className={s.statCard}>
                        <div className={s.statValueGold}>{fmt(rakebackStatus?.pendingRakeback || 0)}</div>
                        <div className={s.statLabel}>Pending Rakeback</div>
                      </div>
                      <div className={s.statCard}>
                        <div className={s.statValue}>{((rakebackStatus?.rakebackRate || 0.10) * 100).toFixed(0)}%</div>
                        <div className={s.statLabel}>Rakeback Rate</div>
                      </div>
                      <div className={s.statCard}>
                        <div className={s.statValueBlue}>{rakebackStatus?.pendingCount || 0}</div>
                        <div className={s.statLabel}>Unclaimed Periods</div>
                      </div>
                    </div>

                    {/* Active Period Info */}
                    <div className={s.section}>
                      {rakebackStatus?.activePeriod ? (
                        <div className={s.emptyState} style={{ borderLeft: '3px solid #31A24C' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px' }}>🟢</span>
                            <span style={{ fontWeight: 700, color: '#31A24C' }}>Period Open</span>
                            <span style={{ fontSize: '12px', color: '#B0B3B8' }}>Since {new Date(rakebackStatus.activePeriod.period_start).toLocaleDateString()}</span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#B0B3B8', marginTop: '8px' }}>Rake is being tracked. Close the period to calculate and distribute rakeback.</div>
                        </div>
                      ) : (
                        <div className={s.emptyState}>
                          <span className={s.emptyIcon}>⏸️</span>
                          <span style={{ fontWeight: 700, color: '#B0B3B8' }}>No active rakeback period</span>
                          <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>An admin must open a period to begin tracking rake for rakeback calculations.</div>
                        </div>
                      )}
                    </div>

                    {/* Claim Button */}
                    {(rakebackStatus?.pendingRakeback || 0) > 0 && (
                      <div className={s.section} style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: '#F7C52A', marginBottom: '8px' }}>{fmt(rakebackStatus.pendingRakeback)} chips</div>
                        <div style={{ fontSize: '14px', color: '#B0B3B8', marginBottom: '16px' }}>Available to claim from {rakebackStatus.pendingCount} period(s)</div>
                        <button onClick={handleRakebackClaim} className={s.btnPrimary} disabled={claiming} style={{ padding: '12px 32px', fontSize: '16px' }}>
                          {claiming ? '⏳ Claiming...' : '🎁 Claim Rakeback'}
                        </button>
                      </div>
                    )}

                    {/* Admin Period Controls */}
                    {['owner', 'admin'].includes(rakebackStatus?.role) && (
                      <div className={s.section}>
                        <div className={s.sectionTitle}>Period Management</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {!rakebackStatus?.activePeriod ? (
                            <button onClick={() => handleRakebackPeriod('open')} className={s.btnPrimary} disabled={processing}>📂 Open New Period</button>
                          ) : (
                            <button onClick={() => handleRakebackPeriod('close')} className={s.btnDanger} disabled={processing}>🔒 Close Period</button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* History */}
                    {rakebackHistory.length > 0 && (
                      <div className={s.section} style={{ marginTop: '16px' }}>
                        <div className={s.sectionTitle}>Rakeback History</div>
                        <div className={s.tableScroll}>
                          <table className={s.dataTable}>
                            <thead><tr><th>Period</th><th>Rake Paid</th><th>Rakeback</th><th>Status</th></tr></thead>
                            <tbody>
                              {rakebackHistory.map(r => (
                                <tr key={r.id}>
                                  <td style={{ fontSize: '12px', color: '#B0B3B8' }}>{new Date(r.period_start || r.created_at).toLocaleDateString()} — {r.period_end ? new Date(r.period_end).toLocaleDateString() : 'Now'}</td>
                                  <td style={{ fontWeight: 600 }}>{fmtChips(r.rake_contributed)}</td>
                                  <td style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(r.rakeback_amount)}</td>
                                  <td><span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '12px', textTransform: 'uppercase', background: r.status === 'claimed' ? 'rgba(49,162,76,0.15)' : r.status === 'closed' ? 'rgba(247,197,42,0.15)' : '#3A3B3C', color: r.status === 'claimed' ? '#31A24C' : r.status === 'closed' ? '#F7C52A' : '#B0B3B8' }}>{r.status}</span></td>
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

          {/* ── Distribute Tab ──────────────────────────────── */}
          {tab === 'distribute' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div style={{ background: '#242526', borderRadius: '12px', padding: '20px', border: '1px solid #3A3B3C' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#E4E6EB', marginBottom: '16px' }}>💸 Distribute Chips to Player</div>
                <div style={{ fontSize: '12px', color: '#B0B3B8', marginBottom: '16px', lineHeight: 1.5 }}>
                  Send chips from the club treasury to a player. The player must be an active member of the club.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#B0B3B8', marginBottom: '6px', fontWeight: 600 }}>Player User ID</label>
                    <input value={distUserId} onChange={e => setDistUserId(e.target.value)}
                      placeholder="UUID of the player" style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#B0B3B8', marginBottom: '6px', fontWeight: 600 }}>Amount</label>
                    <input type="number" value={distAmount} onChange={e => setDistAmount(e.target.value)}
                      placeholder="0" min="1" style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#B0B3B8', marginBottom: '6px', fontWeight: 600 }}>Notes (optional)</label>
                    <input value={distNotes} onChange={e => setDistNotes(e.target.value)}
                      placeholder="Reason for distribution..." style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  </div>
                  <button className={s.btnPrimary} disabled={processing || !distUserId || !distAmount}
                    style={{ padding: '12px', marginTop: '4px' }}
                    onClick={async () => {
                      setProcessing(true); setError(null);
                      try {
                        await apiCall('/api/club-arena/distribute-chips', { clubId, toUserId: distUserId, amount: Number(distAmount), notes: distNotes || undefined });
                        setSuccess(`Distributed ${fmtChips(distAmount)} chips!`);
                        busEmit('CHIPS_DISTRIBUTED', { clubId });
                        busEmit('CASHIER_BALANCE_CHANGED', { clubId });
                        setDistUserId(''); setDistAmount(''); setDistNotes('');
                        loadCashier(clubId);
                      } catch (err) { setError(err.message); }
                      finally { setProcessing(false); }
                    }}>
                    {processing ? 'Distributing...' : `Send ${distAmount ? fmtChips(distAmount) : '0'} chips`}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
