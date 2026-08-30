/**
 * Order History Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View past orders from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch, useRequireAuth } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';

export default function OrderHistory() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/orders');
  useTrainingBus('diamond-store-orders');
  const [loadedOrders, setOrders] = useState([]);
  const [ordersOwnerId, setOrdersOwnerId] = useState(null);
  const orders = ordersOwnerId === user?.id ? loadedOrders : [];
  const changingOwner = Boolean(user?.id) && ordersOwnerId !== user.id;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [partialError, setPartialError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Focus refreshes can arrive while a ledger page is still loading. Only the
  // newest snapshot may commit, otherwise an older response
  // can roll a just-shipped order back to "processing" on screen.
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef(null);

  const loadOrders = useCallback(async ({ append = false, cursor = null } = {}) => {
    const ownerId = user?.id;
    if (!ownerId) return;
    const requestId = ++loadRequestRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    try {
      const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const response = await authedFetch(`/api/store/order-ledger?limit=50${cursorQuery}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Could not load orders');
      }

      const data = payload.data || {};
      const nextOrders = Array.isArray(data.orders) ? data.orders : [];
      setLoadError(null);
      setPartialError(
        data.partial && Array.isArray(data.unavailableSources) && data.unavailableSources.length > 0
          ? `${data.unavailableSources.join(' And ')} Could Not Be Loaded Right Now.`
          : null
      );
      setOrders((current) => {
        if (!append) return nextOrders;
        const byKey = new Map(current.map((order) => [order.key, order]));
        nextOrders.forEach((order) => byKey.set(order.key, order));
        return Array.from(byKey.values()).sort(
          (a, b) =>
            String(b?.created_at || '').localeCompare(String(a?.created_at || '')) ||
            String(b?.key || '').localeCompare(String(a?.key || ''))
        );
      });
      setOrdersOwnerId(ownerId);
      setHasMore(Boolean(data.hasMore));
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setLoading(false);
      setLoadingMore(false);
    } catch (error) {
      if (error?.name === 'AbortError' || requestId !== loadRequestRef.current) return;
      console.warn('Error loading orders:', error);
      if (append) {
        setPartialError('Older Marketplace Records Could Not Be Loaded Right Now.');
      } else {
        setLoadError(error?.message || 'Could not load orders');
        setPartialError(null);
      }
      setLoading(false);
      setLoadingMore(false);
    } finally {
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    if (authChecking || !user?.id) return;
    loadOrders();
  }, [authChecking, loadOrders, user?.id]);
  useEffect(
    () => () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
    },
    []
  );
  // Commerce rows stay behind the private API. Refresh on focus and at a
  // bounded cadence instead of subscribing the browser to sensitive tables.
  useEffect(() => {
    if (!user?.id) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadOrders();
    };
    const timer = window.setInterval(refreshWhenVisible, 60000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadOrders, user?.id]);

  const getStatusBadge = (status) => {
    const statusStyles = {
      completed: { bg: 'rgba(0, 168, 232, 0.15)', color: '#74dcff', label: 'Completed' },
      pending: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Pending' },
      processing: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Processing' },
      paid: { bg: 'rgba(59, 130, 246, 0.15)', color: '#77c9ff', label: 'Paid — Review' },
      shipped: { bg: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff', label: 'Shipped' },
      delivered: { bg: 'rgba(0, 168, 232, 0.15)', color: '#74dcff', label: 'Delivered' },
      active: { bg: 'rgba(0, 168, 232, 0.15)', color: '#74dcff', label: 'Active' },
      trialing: { bg: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff', label: 'Trial' },
      past_due: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Past Due' },
      unpaid: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Unpaid' },
      canceled: { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', label: 'Canceled' },
      cancelled: { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', label: 'Canceled' },
      failed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Failed' },
      refunded: { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', label: 'Refunded' },
    };
    const style = statusStyles[status] || statusStyles.pending;
    return (
      <span
        style={{
          padding: '4px 12px',
          borderRadius: 0,
          fontSize: '12px',
          fontWeight: 600,
          background: style.bg,
          color: style.color,
        }}
      >
        {style.label}
      </span>
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr || isNaN(Date.parse(dateStr))) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (cents) => {
    return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
  };

  // Normalized rows carry their own currency — diamond-paid orders are not dollars
  const formatAmount = (amount, currency) => {
    if (currency === 'diamonds') return `${(Number(amount) || 0).toLocaleString()} Diamonds`;
    if (currency === 'chips') return `${(Number(amount) || 0).toLocaleString()} Legacy Chips`;
    return formatPrice(amount);
  };

  const fulfillmentSteps = (order) => {
    const rank = {
      pending: 0,
      paid: 1,
      processing: 1,
      completed: 1,
      shipped: 2,
      delivered: 3,
    };
    const currentRank = Math.max(
      rank[String(order?.status || '').toLowerCase()] ?? 0,
      order?.deliveredAt ? 3 : order?.shippedAt ? 2 : 0
    );
    const currentStep = currentRank >= 3 ? -1 : currentRank;
    return [
      { label: 'Order placed', complete: true, date: order?.created_at },
      { label: 'In production', complete: currentRank >= 1, date: null },
      { label: 'Shipped', complete: currentRank >= 2, date: order?.shippedAt },
      { label: 'Delivered', complete: currentRank >= 3, date: order?.deliveredAt },
    ].map((step, index) => ({ ...step, current: index === currentStep }));
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(orders.map((order) => String(order.status || 'pending')))).sort(),
    [orders]
  );

  const visibleOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (sourceFilter !== 'all' && (order.category || order.source) !== sourceFilter) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (!query) return true;
      return [
        order.id,
        order.title,
        order.status,
        order.source,
        ...(order.items || []).map((item) => item.name),
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [orders, searchQuery, sourceFilter, statusFilter]);

  const ledgerSummary = useMemo(
    () => ({
      records: orders.length,
      merchandise: orders.filter((order) => order.source === 'merchandise').length,
      vip: orders.filter((order) => (order.category || order.source) === 'vip').length,
      club: orders.filter((order) => (order.category || order.source) === 'club').length,
      active: orders.filter((order) =>
        ['pending', 'paid', 'processing', 'shipped', 'active', 'trialing'].includes(
          String(order.status || '').toLowerCase()
        )
      ).length,
    }),
    [orders]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setSourceFilter('all');
    setStatusFilter('all');
  };

  return (
    <PageTransition>
      <SEOHead
        title="Order History — Diamond Store"
        description="View Your Diamond Store Order History And Track Shipments."
        canonical="/hub/diamond-store/orders"
        noindex={true}
      />

      <div style={styles.container}>
        <UniversalHeader pageDepth={2} />

        <MarketplaceSubpageShell
          active="orders"
          eyebrow="Marketplace Ledger"
          title="Order History"
          description="Track Diamond Packages, Merchandise Fulfillment, And VIP Membership Activity From One Verified Commerce Record."
          actions={<Link href="/hub/diamond-store">Continue Shopping →</Link>}
        >
          {loading || changingOwner ? (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading Orders...</p>
              <style>{`@keyframes dsSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : loadError ? (
            <div role="alert" style={styles.emptyState}>
              <h2 style={styles.emptyTitle}>Could Not Load Orders</h2>
              <p style={styles.emptyText}>{loadError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setLoadError(null);
                  setPartialError(null);
                  loadOrders();
                }}
                style={{
                  ...styles.shopButton,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Retry
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div style={styles.emptyState}>
              {partialError && (
                <div role="status" style={{ ...styles.partialNotice, marginBottom: '24px' }}>
                  {partialError}
                </div>
              )}
              <h2 style={styles.emptyTitle}>
                {partialError ? 'Order History Is Temporarily Incomplete' : 'No Orders Yet'}
              </h2>
              <p style={styles.emptyText}>
                {partialError
                  ? 'Refresh Shortly. We Will Not Claim Your History Is Empty While A Commerce Source Is Unavailable.'
                  : 'Your Order History Will Appear Here After Your First Purchase'}
              </p>
              <Link href="/hub/diamond-store" style={styles.shopButton}>
                Visit Diamond Store
              </Link>
            </div>
          ) : (
            <div style={styles.ordersList}>
              {partialError && (
                <div role="status" style={styles.partialNotice}>
                  {partialError}
                </div>
              )}
              <section aria-label="Marketplace Ledger Summary" style={styles.ledgerSummary}>
                {[
                  ['Verified Records', ledgerSummary.records],
                  ['Merch Orders', ledgerSummary.merchandise],
                  ['VIP Records', ledgerSummary.vip],
                  ['Club Orders', ledgerSummary.club],
                ].map(([label, value]) => (
                  <div key={label} style={styles.ledgerMetric}>
                    <span style={styles.ledgerMetricLabel}>{label}</span>
                    <strong style={styles.ledgerMetricValue}>{value}</strong>
                  </div>
                ))}
              </section>

              <section aria-label="Filter Marketplace Orders" style={styles.filterDeck}>
                <label style={styles.searchControl}>
                  <span style={styles.controlLabel}>Search Orders</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    aria-label="Search Orders"
                    placeholder="Order number, item, or status"
                    style={styles.controlInput}
                  />
                </label>
                <label style={styles.filterControl}>
                  <span style={styles.controlLabel}>Order Type</span>
                  <select
                    value={sourceFilter}
                    onChange={(event) => setSourceFilter(event.target.value)}
                    aria-label="Order Type"
                    style={styles.controlInput}
                  >
                    <option value="all">All Types</option>
                    <option value="diamonds">Diamond Packages</option>
                    <option value="merchandise">Merchandise</option>
                    <option value="vip">VIP Memberships</option>
                    <option value="club">Club Shop</option>
                  </select>
                </label>
                <label style={styles.filterControl}>
                  <span style={styles.controlLabel}>Order Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    aria-label="Order Status"
                    style={styles.controlInput}
                  >
                    <option value="all">All Statuses</option>
                    {statusOptions.map((status) => (
                      <option value={status} key={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={clearFilters} style={styles.clearFiltersButton}>
                  Clear Filters
                </button>
                <div aria-live="polite" style={styles.resultCount}>
                  Showing {visibleOrders.length} Of {orders.length} Loaded Orders
                </div>
              </section>

              {visibleOrders.length === 0 && (
                <div role="status" style={styles.filteredEmpty}>
                  <h2 style={styles.emptyTitle}>No Orders Match Those Filters</h2>
                  <p style={styles.emptyText}>Clear the search or choose a different ledger signal.</p>
                  <button type="button" onClick={clearFilters} style={styles.shopButton}>
                    Clear Filters
                  </button>
                </div>
              )}

              {visibleOrders.map((order) => (
                <div key={order.key} style={styles.orderCard}>
                  <div style={styles.orderHeader}>
                    <div>
                      <div style={styles.orderId}>
                        Order #
                        {String(order.id ?? '')
                          .slice(0, 8)
                          .toUpperCase() || '—'}
                      </div>
                      <div style={styles.orderTitle}>{order.title}</div>
                      <div style={styles.orderDate}>{formatDate(order.created_at)}</div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>

                  <div style={styles.orderItems}>
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} style={styles.orderItem}>
                        <span style={styles.itemName}>{item.name}</span>
                        <span style={styles.itemQty}>x{item.quantity ?? 1}</span>
                        <span style={styles.itemPrice}>
                          {formatAmount(item.amount, item.currency)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {order.source === 'merchandise' && (
                    <section
                      aria-label={`Fulfillment for order ${String(order.id || '').slice(0, 8)}`}
                      style={styles.fulfillmentPanel}
                    >
                      <div style={styles.fulfillmentHeadingRow}>
                        <div>
                          <div style={styles.fulfillmentEyebrow}>Fulfillment telemetry</div>
                          <div style={styles.fulfillmentTitle}>
                            {order.deliveredAt || order.status === 'delivered'
                              ? 'Delivery complete'
                              : order.shippedAt || order.status === 'shipped'
                                ? 'Package in transit'
                                : order.fulfillmentStatus === 'submission_failed'
                                  ? 'Order needs fulfillment review'
                                  : 'Order is being prepared'}
                          </div>
                        </div>
                        {order.trackingUrl && (
                          <a href={order.trackingUrl} style={styles.trackingButton}>
                            Track package →
                          </a>
                        )}
                      </div>

                      <ol style={styles.fulfillmentRail}>
                        {fulfillmentSteps(order).map((step) => (
                          <li
                            key={step.label}
                            aria-current={step.current ? 'step' : undefined}
                            style={{
                              ...styles.fulfillmentStep,
                              ...(step.complete ? styles.fulfillmentStepComplete : {}),
                            }}
                          >
                            <span aria-hidden="true" style={styles.fulfillmentNode} />
                            <span style={styles.fulfillmentStepLabel}>{step.label}</span>
                            {step.date && (
                              <time dateTime={step.date} style={styles.fulfillmentDate}>
                                {formatDate(step.date)}
                              </time>
                            )}
                          </li>
                        ))}
                      </ol>

                      {(order.carrier || order.trackingNumber) && (
                        <div style={styles.trackingMeta}>
                          {order.carrier && <span>Carrier: {order.carrier}</span>}
                          {order.trackingNumber && <span>Tracking: {order.trackingNumber}</span>}
                        </div>
                      )}
                    </section>
                  )}

                  <div style={styles.orderFooter}>
                    <div>
                      <div style={styles.totalLabel}>Total</div>
                      <div style={styles.totalAmount}>
                        {formatAmount(order.amount, order.currency)}
                      </div>
                      {Number(order.refundAmount) > 0 && (
                        <div style={styles.refundAmount}>
                          Refunded {formatAmount(order.refundAmount, order.currency)} · Net{' '}
                          {formatAmount(order.netAmount, order.currency)}
                        </div>
                      )}
                      {Number(order.refundedDiamonds) > 0 && (
                        <div style={styles.refundAmount}>
                          {Number(order.refundedDiamonds).toLocaleString()} Diamonds Reconciled
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/hub/diamond-store/orders/${order.id}?source=${order.source}`}
                      style={styles.receiptLink}
                    >
                      {order.recordType === 'membership_status'
                        ? 'View Membership Record →'
                        : 'View Receipt →'}
                    </Link>
                  </div>
                </div>
              ))}
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadingMore(true);
                      loadOrders({ append: true, cursor: nextCursor });
                    }}
                    disabled={loadingMore || !nextCursor}
                    style={{ ...styles.shopButton, border: 'none', cursor: loadingMore ? 'wait' : 'pointer' }}
                  >
                    {loadingMore ? 'Loading More Orders…' : 'Load 50 More Orders'}
                  </button>
                </div>
              )}
            </div>
          )}
        </MarketplaceSubpageShell>
      </div>
    </PageTransition>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    paddingBottom: 70,
    width: '100%',
    maxWidth: '100vw',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    background: '#000000',
    color: '#FFFFFF',
  },
  content: { maxWidth: '900px', margin: '0 auto', padding: '80px 24px 40px' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  title: { fontSize: '32px', fontWeight: 700, margin: 0 },
  shopLink: { color: '#00D4FF', textDecoration: 'none', fontSize: '14px', fontWeight: 600 },
  emptyState: { textAlign: 'center', padding: '80px 24px' },
  emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
  emptyText: { color: '#9ca3af', marginBottom: '24px' },
  shopButton: {
    display: 'inline-block',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
    borderRadius: 0,
    color: '#fff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '80px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.15)',
    borderTopColor: '#00E0FF',
    borderRadius: '50%',
    animation: 'dsSpin 1s linear infinite',
  },
  loadingText: { marginTop: '16px', color: '#9ca3af' },
  ordersList: { display: 'grid', gap: '20px' },
  ledgerSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    border: '1px solid #5e7d8e',
    background:
      'linear-gradient(90deg, rgba(0,190,255,0.11), transparent 42%), linear-gradient(180deg, #102630, #03090d)',
    boxShadow: 'inset 0 1px 0 rgba(235,251,255,0.32), inset 0 0 0 4px #03080c',
  },
  ledgerMetric: {
    minHeight: 88,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 6,
    padding: '16px 18px',
    borderRight: '1px solid rgba(129,173,194,0.22)',
  },
  ledgerMetricLabel: {
    color: '#90a8b5',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  ledgerMetricValue: { color: '#8befff', fontSize: 27, lineHeight: 1 },
  filterDeck: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
    gap: 10,
    alignItems: 'end',
    padding: 14,
    border: '1px solid rgba(115,205,235,0.34)',
    background: 'linear-gradient(180deg, rgba(16,39,53,0.94), rgba(3,10,15,0.98))',
  },
  searchControl: { display: 'grid', gap: 6 },
  filterControl: { display: 'grid', gap: 6 },
  controlLabel: {
    color: '#9db6c2',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  controlInput: {
    width: '100%',
    minHeight: 44,
    boxSizing: 'border-box',
    border: '1px solid #526f80',
    borderRadius: 0,
    padding: '0 12px',
    color: '#effbff',
    background: '#061017',
    fontSize: 13,
  },
  clearFiltersButton: {
    minHeight: 44,
    border: '1px solid #c7eaf3',
    borderRadius: 0,
    padding: '0 14px',
    color: '#071017',
    background: 'linear-gradient(180deg, #e4faff, #6faec3 48%, #244f62)',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  resultCount: {
    gridColumn: '1 / -1',
    color: '#9db6c2',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 11,
  },
  filteredEmpty: {
    padding: '44px 20px',
    border: '1px dashed #526f80',
    textAlign: 'center',
    background: 'rgba(3,10,15,0.8)',
  },
  orderCard: {
    background: 'linear-gradient(145deg, #172933, #050a0f 34%, #010305)',
    border: '1px solid #526f80',
    borderRadius: 0,
    padding: '24px',
    transition: 'border-color 0.2s',
    boxShadow: 'inset 0 1px 0 rgba(235,251,255,0.38), inset 0 0 0 4px #03080c',
  },
  orderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    gap: '14px',
    flexWrap: 'wrap',
  },
  orderId: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
  orderTitle: { fontSize: '14px', color: '#e5e7eb', marginBottom: '4px' },
  orderDate: { fontSize: '13px', color: '#9ca3af' },
  partialNotice: {
    padding: '10px 12px',
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: 0,
    color: '#fbbf24',
    fontSize: '13px',
  },
  orderItems: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  orderItem: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  itemName: { flex: '1 1 180px', minWidth: 0, fontSize: '14px', overflowWrap: 'anywhere' },
  itemQty: { fontSize: '13px', color: '#9ca3af' },
  itemPrice: { fontSize: '14px', fontWeight: 600 },
  orderFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  totalLabel: { fontSize: '14px', color: '#9ca3af' },
  totalAmount: { fontSize: '18px', fontWeight: 700, color: '#00D4FF' },
  refundAmount: { marginTop: 4, fontSize: '12px', color: '#fbbf24' },
  fulfillmentPanel: {
    margin: '4px 0 20px',
    padding: '18px',
    border: '1px solid rgba(85, 144, 169, 0.62)',
    background:
      'linear-gradient(90deg, rgba(0, 205, 255, 0.08), transparent 45%), rgba(2, 9, 14, 0.82)',
  },
  fulfillmentHeadingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    flexWrap: 'wrap',
  },
  fulfillmentEyebrow: {
    color: '#7f9aa9',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  },
  fulfillmentTitle: { marginTop: '5px', color: '#dff9ff', fontSize: '15px', fontWeight: 700 },
  trackingButton: {
    display: 'inline-flex',
    minHeight: '44px',
    alignItems: 'center',
    padding: '8px 14px',
    border: '1px solid #8ed9eb',
    background: 'linear-gradient(180deg, #dff9ff, #6da7bc 48%, #1c4b61)',
    color: '#06131a',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '10px',
    fontWeight: 800,
    textDecoration: 'none',
    textTransform: 'uppercase',
  },
  fulfillmentRail: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '10px',
    margin: '20px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  fulfillmentStep: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '12px 1fr',
    alignItems: 'start',
    gap: '8px',
    minWidth: 0,
    paddingTop: '10px',
    borderTop: '2px solid #263b47',
    color: '#6f8794',
  },
  fulfillmentStepComplete: { borderTopColor: '#00c8ff', color: '#dff9ff' },
  fulfillmentNode: {
    width: '9px',
    height: '9px',
    marginTop: '2px',
    border: '1px solid currentColor',
    background: 'currentColor',
    boxShadow: '0 0 10px currentColor',
  },
  fulfillmentStepLabel: { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' },
  fulfillmentDate: {
    gridColumn: '2',
    color: '#7f939e',
    fontSize: '10px',
    lineHeight: 1.4,
  },
  trackingMeta: {
    display: 'flex',
    gap: '8px 20px',
    flexWrap: 'wrap',
    marginTop: '16px',
    color: '#93a7b2',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '10px',
    overflowWrap: 'anywhere',
  },
  receiptLink: {
    display: 'inline-flex',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 15px',
    border: '1px solid #8ed9eb',
    color: '#06131a',
    background: 'linear-gradient(180deg, #dff9ff, #6da7bc 48%, #1c4b61)',
    textDecoration: 'none',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
  },
};
