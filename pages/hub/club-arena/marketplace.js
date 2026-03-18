/* ═══════════════════════════════════════════════════════════════
   Club Arena Marketplace — Native Hub Page (replaces iframe shell)
   2 Tabs: Store | My Items
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
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export default function ClubArenaMarketplacePage() {
  useTrainingBus('club-arena-marketplace');
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [tab, setTab] = useState('store');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Marketplace Data
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [balance, setBalance] = useState(0);

  // Purchase Modal
  const [buyTarget, setBuyTarget] = useState(null);
  const [role, setRole] = useState('player');

  // Admin manage shop
  const [adminItems, setAdminItems] = useState([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Auto-clear success ────────────────────────────────────
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const loadMarketplace = useCallback(async (cId, silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const targetClubId = cId || clubId;
      if (!targetClubId) { setError('No club selected.'); setLoading(false); return; }
      const res = await apiGet(`/api/club-arena/marketplace-items?clubId=${targetClubId}`);
      if (mountedRef.current) {
        setItems(res.items || []);
        setPurchases(res.purchases || []);
        setBalance(res.balance || 0);
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [clubId]);

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
        setClubId(resolvedClub); loadMarketplace(resolvedClub); return;
      }
      if (session) {
        const { supabase } = await import('../../../src/lib/supabase');
        const { data: membership } = await supabase
          .from('club_members').select('club_id, role').eq('user_id', session.user.id)
          .limit(1).maybeSingle();
        if (membership?.club_id && !cancelled) {
          setClubId(membership.club_id);
          if (membership.role) setRole(membership.role);
          loadMarketplace(membership.club_id);
          return;
        }
      }
      if (!cancelled) { setError('No club found.'); setLoading(false); }
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
  }, [router.isReady, router.query.club, router.query.clubId]);

  // ── EventBus (debounced) ─────────────────────────────────
  useEffect(() => {
    const debouncedRefresh = createDebouncedHandler(() => { if (clubId) loadMarketplace(clubId, true); }, 300);
    const events = ['CHIPS_DISTRIBUTED', 'BALANCE_UPDATED', 'CASHIER_BALANCE_CHANGED', 'CASHOUT_APPROVED'];
    events.forEach(ev => eventBus.on(ev, debouncedRefresh));
    return () => { debouncedRefresh.cancel(); events.forEach(ev => eventBus.off(ev, debouncedRefresh)); };
  }, [clubId, loadMarketplace]);

  // ── Visibility Refresh ─────────────────────────────────────
  useEffect(() => {
    if (!clubId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadMarketplace(clubId, true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clubId, loadMarketplace]);

  // ── Actions ────────────────────────────────────────────────
  const handlePurchase = async () => {
    if (!buyTarget) return;
    setProcessing(true);
    try {
      const res = await apiCall('/api/club-arena/marketplace-purchase', { clubId, itemId: buyTarget.id });
      setSuccess(`Successfully purchased ${res.item?.name || 'item'}!`);
      setBalance(res.newBalance || (balance - buyTarget.price));
      busEmit('BALANCE_UPDATED', { clubId, balance: res.newBalance });
      setBuyTarget(null);
      loadMarketplace(clubId); // Refresh to get updated purchase history
    } catch (err) {
      // Don't close modal on error so they can read it
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // ── Loading / Login ────────────────────────────────────────
  if (loading && items.length === 0) {
    return (
      <HubErrorBoundary name="Marketplace">
        <SEOHead title="Marketplace | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}>
          <div className={s.inner} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="ca-skeleton" style={{ height: '48px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>{[1,2].map(i => <div key={i} className="ca-skeleton" style={{ height: '36px', flex: 1 }} />)}</div>
            <div className="ca-skeleton" style={{ height: '60px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>{[1,2,3,4,5,6].map(i => <div key={i} className="ca-skeleton ca-skeleton-card" />)}</div>
          </div>
        </div>
      </HubErrorBoundary>
    );
  }

  // Purchased IDs set + dictionary for rendering "My Items"
  const purchasedItemIds = new Set(purchases.map(p => p.item_id));
  const itemMap = {};
  items.forEach(i => { itemMap[i.id] = i; });

  return (
    <HubErrorBoundary name="Marketplace">
      <SEOHead title="Marketplace | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>
          {/* ── Error / Login ──────────────────────────────── */}
          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Session Expired</div>
              <div style={{ color: '#94a3b8', marginBottom: '16px' }}>Please log in to access the Marketplace.</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}
          {success && <div className={s.successMsg}>{success}</div>}

          {/* ── Purchase Modal ──────────────────────────────── */}
          {buyTarget && (
            <div className={s.modalOverlay} onClick={() => !processing && setBuyTarget(null)}>
              <div className={s.modal} onClick={e => e.stopPropagation()}>
                <div className={s.modalTitle}>Confirm Purchase</div>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'center' }}>
                  {buyTarget.image_url ? (
                    <img src={buyTarget.image_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '64px', height: '64px', borderRadius: '8px', background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                      🛒
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px', color: '#E4E6EB' }}>{buyTarget.name}</div>
                    <div style={{ fontSize: '14px', color: '#B0B3B8' }}>{buyTarget.description}</div>
                  </div>
                </div>

                <div className={s.statsGrid} style={{ marginBottom: '24px' }}>
                  <div className={s.statCard} style={{ padding: '12px' }}>
                    <div className={s.statLabel}>Item Price</div>
                    <div className={s.statValueRed}>{fmtChips(buyTarget.price)}</div>
                  </div>
                  <div className={s.statCard} style={{ padding: '12px' }}>
                    <div className={s.statLabel}>Available Chips</div>
                    <div className={s.statValueGreen}>{fmtChips(balance)}</div>
                  </div>
                </div>

                {balance < buyTarget.price && (
                  <div className={s.error} style={{ marginBottom: '16px', padding: '12px', fontSize: '14px' }}>
                    Insufficient chips. You need {fmtChips(buyTarget.price - balance)} more to purchase this item.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button onClick={() => setBuyTarget(null)} className={s.btnGhost} disabled={processing}>Cancel</button>
                  <button 
                    onClick={handlePurchase} 
                    className={s.btnPrimary} 
                    disabled={processing || balance < buyTarget.price}
                  >
                    {processing ? 'Purchasing...' : 'Confirm Purchase'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Page Header ──────────────────────────────────── */}
          <div className={s.pageHeader}>
            <div className={s.pageTitle}>
              🛒 Marketplace
              <span className={s.unionCode} style={{ background: 'rgba(49,162,76,0.15)', color: '#31A24C' }}>
                💰 {fmt(balance)} chips
              </span>
            </div>
            <div className={s.headerActions}>
              <Link href="/hub/club-arena" style={{ textDecoration: 'none' }}><button className={s.btnGhost}>🏠 Lobby</button></Link>
              <button onClick={() => loadMarketplace(clubId)} className={s.btnGhost}>↻ Refresh</button>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────── */}
          <div className={s.tabs}>
            <button className={`${s.tab} ${tab === 'store' ? s.tabActive : ''}`} onClick={() => setTab('store')}>
              Store <span className={s.tabBadge}>{items.length}</span>
            </button>
            <button className={`${s.tab} ${tab === 'my_items' ? s.tabActive : ''}`} onClick={() => setTab('my_items')}>
              My Items {purchases.length > 0 && <span className={s.tabBadge}>{purchases.length}</span>}
            </button>
            {['owner', 'admin'].includes(role) && (
              <button className={`${s.tab} ${tab === 'manage' ? s.tabActive : ''}`} onClick={() => {
                setTab('manage');
                if (!adminLoaded && clubId) {
                  apiGet(`/api/club-arena/manage-shop?clubId=${clubId}`)
                    .then(r => { setAdminItems(r.items || []); setAdminLoaded(true); })
                    .catch(err => setError(err.message));
                }
              }}>
                🛠️ Manage
              </button>
            )}
          </div>

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: STORE                                       */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'store' && (
            <div className={s.section}>
              {items.length === 0 ? (
                <div className={s.emptyState}>
                  <span className={s.emptyIcon}>🛍️</span>
                  <span className={s.emptyText}>The store is currently empty.</span>
                </div>
              ) : (
                <div className={s.cardGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                  {items.map(item => {
                    const alreadyOwned = purchasedItemIds.has(item.id);
                    return (
                      <div key={item.id} className={s.card} style={{ display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                        {/* Header / Image Area */}
                        <div style={{ height: '140px', background: item.image_url ? '#18191A' : '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ fontSize: '48px', color: '#B0B3B8' }}>🎁</div>
                          )}
                          <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, color: '#E4E6EB', textTransform: 'uppercase' }}>
                            {item.category || 'General'}
                          </div>
                        </div>

                        {/* Content Area */}
                        <div style={{ padding: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontWeight: 600, fontSize: '16px', color: '#E4E6EB', marginBottom: '4px' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#B0B3B8', marginBottom: '16px', flexGrow: 1, lineHeight: 1.4 }}>
                            {item.description || 'No description available.'}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            <div style={{ fontWeight: 700, fontSize: '16px', color: '#F7C52A' }}>
                              {fmtChips(item.price)}
                            </div>
                            <button
                              onClick={() => setBuyTarget(item)}
                              className={s.btnPrimary}
                              disabled={alreadyOwned || processing}
                              style={{ padding: '8px 16px', background: alreadyOwned ? '#3A3B3C' : undefined, color: alreadyOwned ? '#94A3B8' : undefined }}
                            >
                              {alreadyOwned ? 'Owned' : 'Buy'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/*  TAB: MY ITEMS                                    */}
          {/* ══════════════════════════════════════════════════ */}
          {tab === 'my_items' && (
            <div className={s.section}>
              {purchases.length === 0 ? (
                <div className={s.emptyState}>
                  <span className={s.emptyIcon}>📦</span>
                  <span className={s.emptyText}>You haven&apos;t purchased any items yet.</span>
                </div>
              ) : (
                <div className={s.tableScroll}>
                  <table className={s.dataTable}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Price Paid</th>
                        <th>Date Purchased</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map(p => {
                        const itemData = itemMap[p.item_id] || {};
                        return (
                          <tr key={p.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {itemData.image_url ? (
                                  <img src={itemData.image_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#3A3B3C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                                    🎁
                                  </div>
                                )}
                                <div>
                                  <div style={{ fontWeight: 600, color: '#E4E6EB' }}>{itemData.name || 'Unknown Item'}</div>
                                  <div style={{ fontSize: '12px', color: '#B0B3B8' }}>{p.item_id.substring(0,8)}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontSize: '12px', background: '#3A3B3C', padding: '4px 8px', borderRadius: '4px', color: '#E4E6EB', textTransform: 'uppercase' }}>
                                {itemData.category || 'General'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: '#F7C52A' }}>{fmtChips(p.price_paid)}</td>
                            <td style={{ fontSize: '13px', color: '#B0B3B8' }}>{timeAgo(p.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Manage Tab (Admin) ──────────────────────────── */}
          {tab === 'manage' && (
            <div className={s.section} style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div style={{ background: '#242526', borderRadius: '12px', padding: '20px', border: '1px solid #3A3B3C', marginBottom: '16px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#E4E6EB', marginBottom: '16px' }}>➕ Create Shop Item</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Item name"
                    style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  <input type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="Price (chips)" min="1"
                    style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Description (optional)"
                    style={{ width: '100%', padding: '10px 12px', background: '#18191A', border: '1px solid #3A3B3C', borderRadius: '8px', color: '#E4E6EB', fontSize: '13px' }} />
                  <button className={s.btnPrimary} disabled={processing || !newItemName || !newItemPrice}
                    style={{ padding: '12px' }}
                    onClick={async () => {
                      setProcessing(true); setError(null);
                      try {
                        await apiCall('/api/club-arena/manage-shop', { action: 'create', clubId, name: newItemName, price: Number(newItemPrice), description: newItemDesc || undefined });
                        setSuccess('Item created!');
                        setNewItemName(''); setNewItemPrice(''); setNewItemDesc('');
                        const r = await apiGet(`/api/club-arena/manage-shop?clubId=${clubId}`);
                        setAdminItems(r.items || []);
                        loadMarketplace(clubId, true);
                      } catch (err) { setError(err.message); }
                      finally { setProcessing(false); }
                    }}>
                    {processing ? 'Creating...' : 'Create Item'}
                  </button>
                </div>
              </div>

              {adminItems.length === 0 ? (
                <div className={s.emptyState}><span className={s.emptyIcon}>🛠️</span><span className={s.emptyText}>No shop items. Create one above.</span></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {adminItems.map(item => (
                    <div key={item.id} style={{ background: '#242526', border: '1px solid #3A3B3C', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: item.is_active ? '#E4E6EB' : '#6B7280' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#B0B3B8', marginTop: '2px' }}>{fmtChips(item.price)} chips • {item.purchase_count || 0} sold</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={async () => {
                          try {
                            await apiCall('/api/club-arena/manage-shop', { action: 'toggle', clubId, itemId: item.id });
                            const r = await apiGet(`/api/club-arena/manage-shop?clubId=${clubId}`);
                            setAdminItems(r.items || []);
                            loadMarketplace(clubId, true);
                          } catch (err) { setError(err.message); }
                        }} style={{ fontSize: '11px', background: item.is_active ? 'rgba(49,162,76,0.12)' : 'rgba(107,114,128,0.12)', color: item.is_active ? '#31A24C' : '#6B7280', border: `1px solid ${item.is_active ? 'rgba(49,162,76,0.25)' : 'rgba(107,114,128,0.25)'}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                          {item.is_active ? 'Active' : 'Hidden'}
                        </button>
                        <button onClick={async () => {
                          if (!confirm(`Delete "${item.name}"?`)) return;
                          try {
                            await apiCall('/api/club-arena/manage-shop', { action: 'delete', clubId, itemId: item.id });
                            const r = await apiGet(`/api/club-arena/manage-shop?clubId=${clubId}`);
                            setAdminItems(r.items || []);
                            loadMarketplace(clubId, true);
                          } catch (err) { setError(err.message); }
                        }} style={{ fontSize: '11px', background: 'rgba(250,56,62,0.12)', color: '#FA383E', border: '1px solid rgba(250,56,62,0.25)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
