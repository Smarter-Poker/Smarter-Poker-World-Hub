/* ═══════════════════════════════════════════════════════════════
   Club Arena Cashier — Native Hub Page (replaces iframe shell)
   3 Tabs: Wallet | Cashout | History
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
      const res = await apiCall('/api/club-arena/cashier-info', { clubId: targetClubId, action: 'summary' });
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
    let cancelled = false;
    let authUnsub = null;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      if (qClub) { setClubId(qClub); loadCashier(qClub); return; }
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
  }, [router.query.club, router.query.clubId]);

  // ── Lazy History Loading ───────────────────────────────────
  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── EventBus ───────────────────────────────────────────────
  useEffect(() => {
    const refresh = () => { if (clubId) loadCashier(clubId); };
    const events = ['CASHOUT_APPROVED', 'CASHOUT_CANCELLED', 'CHIPS_DISTRIBUTED', 'BALANCE_UPDATED'];
    events.forEach(ev => eventBus.on(ev, refresh));
    return () => events.forEach(ev => eventBus.off(ev, refresh));
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

  const availableForCashout = balance - totalPending;

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
              <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadCashier(clubId)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className={s.tabs}>
            {[
              { id: 'wallet', label: 'Wallet' },
              { id: 'cashout', label: 'Cashout', badge: pendingCashouts.length || null },
              { id: 'history', label: 'History' },
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
                <div className={s.loading}>Loading cashout history...</div>
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

        </div>
      </div>
    </HubErrorBoundary>
  );
}
