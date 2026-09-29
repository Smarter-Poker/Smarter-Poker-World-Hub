/**
 * Order History Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View past orders from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { authedFetch, getAuthUser, useRequireAuth } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';
import {
  MarketplaceConsolePanel,
  MarketplaceConsoleStatusRow,
  MarketplacePageConsole,
} from '../../../src/components/marketplace-console/MarketplaceConsole';
import {
  marketplaceCarrierName,
  marketplaceCopy,
  marketplaceFulfillmentStatus,
} from '../../../src/lib/store/marketplaceCopy';
import accountControls from './marketplace-account-controls.module.css';

const MARKETPLACE_LEDGER_TIMEOUT_MS = 20000;
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function OrderHistory() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/orders');
  const { user: contextUser, initializing: authInitializing } = useAvatar();
  useTrainingBus('diamond-store-orders');
  const synchronousAccountId = getAuthUser()?.id || null;
  const committedAccountId =
    contextUser?.id === synchronousAccountId
      ? contextUser.id
      : authInitializing || authChecking
        ? user?.id === synchronousAccountId
          ? user.id
          : synchronousAccountId
        : null;
  const [loadedOrders, setOrders] = useState([]);
  const [ordersOwnerId, setOrdersOwnerId] = useState(null);
  const orders = ordersOwnerId === committedAccountId ? loadedOrders : [];
  const changingOwner = Boolean(committedAccountId) && ordersOwnerId !== committedAccountId;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [partialError, setPartialError] = useState(null);
  const projectedLoadError = ordersOwnerId === committedAccountId ? loadError : null;
  const projectedPartialError = ordersOwnerId === committedAccountId ? partialError : null;
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
  const activeAccountIdRef = useRef(committedAccountId);

  useIsomorphicLayoutEffect(() => {
    activeAccountIdRef.current = committedAccountId;
    loadRequestRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setOrders([]);
    setOrdersOwnerId(committedAccountId);
    setLoadError(null);
    setPartialError(null);
    setHasMore(false);
    setNextCursor(null);
    setLoadingMore(false);
    setLoading(Boolean(committedAccountId));
  }, [committedAccountId]);

  const loadOrders = useCallback(
    // `refresh` re-reads the first page and folds it into what is already on
    // screen instead of replacing it. A focus or interval refresh used to drop
    // a shopper who had loaded three pages back to one, and reset the cursor
    // with it, so their own history disappeared every time they changed tabs.
    async ({ append = false, cursor = null, refresh = false } = {}) => {
      const expectedAccountId = committedAccountId;
      if (
        !expectedAccountId ||
        activeAccountIdRef.current !== expectedAccountId ||
        getAuthUser()?.id !== expectedAccountId
      )
        return;
      const requestId = ++loadRequestRef.current;
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      const generationOwnsCurrentAccount = () =>
        loadRequestRef.current === requestId && activeAccountIdRef.current === expectedAccountId;
      const operationOwnsCurrentAccount = () =>
        generationOwnsCurrentAccount() && loadAbortRef.current === controller;
      const attemptIsCurrent = () =>
        !controller.signal.aborted &&
        operationOwnsCurrentAccount() &&
        getAuthUser()?.id === expectedAccountId;
      const commitIsCurrent = () =>
        !controller.signal.aborted &&
        generationOwnsCurrentAccount() &&
        getAuthUser()?.id === expectedAccountId;
      const errorCommitIsCurrent = () => generationOwnsCurrentAccount();
      let timedOut = false;
      let operationSettled = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, MARKETPLACE_LEDGER_TIMEOUT_MS);
      try {
        const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
        const response = await authedFetch(`/api/store/order-ledger?limit=50${cursorQuery}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return;
        const payload = await response.json().catch(() => null);
        if (!attemptIsCurrent()) return;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'Could not load orders');
        }

        operationSettled = true;
        const data = payload.data || {};
        const nextOrders = Array.isArray(data.orders) ? data.orders : [];
        const nextPartialError =
          data.partial &&
          Array.isArray(data.unavailableSources) &&
          data.unavailableSources.length > 0
            ? `${data.unavailableSources.join(' And ')} Could Not Be Loaded Right Now.`
            : null;
        setLoadError((current) => (commitIsCurrent() ? null : current));
        setPartialError((current) => (commitIsCurrent() ? nextPartialError : current));
        setOrders((current) => {
          if (!commitIsCurrent()) return current;
          if (!append && !refresh) return nextOrders;
          const byKey = new Map(current.map((order) => [order.key, order]));
          nextOrders.forEach((order) => byKey.set(order.key, order));
          return Array.from(byKey.values()).sort(
            (a, b) =>
              String(b?.created_at || '').localeCompare(String(a?.created_at || '')) ||
              String(b?.key || '').localeCompare(String(a?.key || ''))
          );
        });
        // A refresh only revisits page one, so its cursor points back into
        // pages the shopper has already loaded. Keep the deeper position.
        setHasMore((current) => (commitIsCurrent() && !refresh ? Boolean(data.hasMore) : current));
        setNextCursor((current) =>
          commitIsCurrent() && !refresh
            ? typeof data.nextCursor === 'string'
              ? data.nextCursor
              : null
            : current
        );
      } catch (error) {
        if (!operationOwnsCurrentAccount()) return;
        if (error?.name === 'AbortError' && !timedOut) return;
        operationSettled = true;
        console.warn('Error loading orders:', error);
        if (append) {
          const nextPartialError = timedOut
            ? 'Older Marketplace Records Timed Out. Try Loading Them Again.'
            : 'Older Marketplace Records Could Not Be Loaded Right Now.';
          setPartialError((current) => (errorCommitIsCurrent() ? nextPartialError : current));
        } else {
          const nextLoadError = timedOut
            ? 'Order History Timed Out. Try Again.'
            : error?.message || 'Could Not Load Orders';
          setLoadError((current) => (errorCommitIsCurrent() ? nextLoadError : current));
          setPartialError((current) => (errorCommitIsCurrent() ? null : current));
        }
      } finally {
        window.clearTimeout(timeout);
        if (loadRequestRef.current === requestId && loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          if (!operationSettled) {
            setLoadError((current) =>
              errorCommitIsCurrent()
                ? 'Your Account Changed Before Order History Could Be Verified. Retry The Secure Read.'
                : current
            );
          }
          if (activeAccountIdRef.current === expectedAccountId) {
            setLoading((current) => (errorCommitIsCurrent() ? false : current));
            setLoadingMore((current) => (errorCommitIsCurrent() ? false : current));
          }
        }
      }
    },
    [committedAccountId]
  );

  useEffect(() => {
    if (authChecking || authInitializing || !committedAccountId) return;
    void loadOrders();
  }, [authChecking, authInitializing, committedAccountId, loadOrders]);
  useEffect(
    () => () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    },
    []
  );
  // Commerce rows stay behind the private API. Refresh on focus and at a
  // bounded cadence instead of subscribing the browser to sensitive tables.
  useEffect(() => {
    if (!committedAccountId || authInitializing) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadOrders({ refresh: true });
    };
    const timer = window.setInterval(refreshWhenVisible, 60000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [authInitializing, committedAccountId, loadOrders]);

  const getStatusBadge = (status) => {
    const statusStyles = {
      completed: { ink: 'blue', label: 'Completed' },
      pending: { ink: 'blue', label: 'Pending' },
      processing: { ink: 'blue', label: 'Processing' },
      paid: { ink: 'blue', label: 'Paid: Review' },
      shipped: { ink: 'blue', label: 'Shipped' },
      delivered: { ink: 'blue', label: 'Delivered' },
      active: { ink: 'blue', label: 'Active' },
      trialing: { ink: 'blue', label: 'Trial' },
      past_due: { ink: 'blue', label: 'Past Due' },
      unpaid: { ink: 'red', label: 'Unpaid' },
      canceled: { ink: 'muted', label: 'Canceled' },
      cancelled: { ink: 'muted', label: 'Canceled' },
      failed: { ink: 'red', label: 'Failed' },
      refunded: { ink: 'muted', label: 'Refunded' },
      action_required: { ink: 'red', label: 'Action Required' },
    };
    const normalizedStatus = String(status || '')
      .trim()
      .toLowerCase();
    return (
      statusStyles[normalizedStatus] || {
        ink: 'muted',
        label: marketplaceCopy(normalizedStatus || 'Unknown'),
      }
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr || isNaN(Date.parse(dateStr))) return 'Not Available';
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

  // Normalized rows carry their own currency: diamond-paid orders are not dollars
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
      { label: 'Order Placed', complete: true, date: order?.created_at },
      { label: 'In Production', complete: currentRank >= 1, date: null },
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
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [orders, searchQuery, sourceFilter, statusFilter]);

  const ledgerSummary = useMemo(
    () => ({
      records: orders.length,
      merchandise: orders.filter((order) => order.source === 'merchandise').length,
      vip: orders.filter((order) => (order.category || order.source) === 'vip').length,
      club: orders.filter((order) => (order.category || order.source) === 'club').length,
      active: orders.filter((order) =>
        [
          'pending',
          'paid',
          'processing',
          'shipped',
          'active',
          'trialing',
          'action_required',
        ].includes(String(order.status || '').toLowerCase())
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
        title="Order History: Diamond Store"
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
          actions={
            <Link
              href="/hub/diamond-store"
              className={`${accountControls.action} ${accountControls.actionPrimary}`}
            >
              Continue Shopping
            </Link>
          }
        >
          {loading || changingOwner || !committedAccountId ? (
            <div role="status" aria-live="polite">
              <MarketplaceConsolePanel title="Verifying Order History">
                <MarketplaceConsoleStatusRow
                  label="Private Marketplace Ledger"
                  value="Loading Orders"
                  detail="Binding Records To Your Active Account"
                  live
                />
              </MarketplaceConsolePanel>
            </div>
          ) : projectedLoadError ? (
            <div role="alert">
              <MarketplaceConsolePanel
                title="Could Not Load Orders"
                primaryAction={{
                  label: 'Retry Secure Read',
                  onClick: () => {
                    setLoading(true);
                    setLoadError(null);
                    setPartialError(null);
                    loadOrders();
                  },
                }}
              >
                <MarketplaceConsoleStatusRow
                  label="Order Ledger"
                  value="Secure Read Failed"
                  detail={marketplaceCopy(projectedLoadError)}
                  valueInk="red"
                />
              </MarketplaceConsolePanel>
            </div>
          ) : orders.length === 0 ? (
            <MarketplaceConsolePanel
              title={
                projectedPartialError ? 'Order History Is Temporarily Incomplete' : 'No Orders Yet'
              }
              primaryAction={{ label: 'Visit Diamond Store', href: '/hub/diamond-store' }}
            >
              <MarketplaceConsoleStatusRow
                label="Private Marketplace Ledger"
                value={projectedPartialError ? 'Source Verification Pending' : 'No Verified Orders'}
                detail={
                  projectedPartialError
                    ? marketplaceCopy(projectedPartialError)
                    : 'Your Order History Will Appear Here After Your First Purchase'
                }
                valueInk={projectedPartialError ? 'red' : 'white'}
                live={Boolean(projectedPartialError)}
              />
            </MarketplaceConsolePanel>
          ) : (
            <div style={styles.ordersList}>
              {projectedPartialError && (
                <MarketplaceConsoleStatusRow
                  label="Ledger Coverage"
                  value="History Is Temporarily Incomplete"
                  detail={marketplaceCopy(projectedPartialError)}
                  valueInk="red"
                  live
                />
              )}
              <MarketplaceConsolePanel title="Verified Marketplace Ledger">
                <section aria-label="Marketplace Ledger Summary" style={styles.ledgerSummary}>
                  {[
                    ['Verified Records', ledgerSummary.records],
                    ['Merch Orders', ledgerSummary.merchandise],
                    ['VIP Records', ledgerSummary.vip],
                    ['Club Orders', ledgerSummary.club],
                  ].map(([label, value]) => (
                    <MarketplaceConsoleStatusRow
                      key={label}
                      label={label}
                      value={String(value)}
                      detail="Owner-Scoped Record"
                    />
                  ))}
                </section>
              </MarketplaceConsolePanel>

              <MarketplaceConsolePanel title="Filter Marketplace Orders">
                <div style={styles.filterControls}>
                  <label style={styles.searchControl}>
                    <span style={styles.controlLabel}>Search Orders</span>
                    <input
                      data-preserve-case="true"
                      data-user-content="true"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label="Search Orders"
                      placeholder="Order Number, Item, Or Status"
                      className={accountControls.field}
                    />
                  </label>
                  <label style={styles.filterControl}>
                    <span style={styles.controlLabel}>Order Type</span>
                    <select
                      value={sourceFilter}
                      onChange={(event) => setSourceFilter(event.target.value)}
                      aria-label="Order Type"
                      className={accountControls.field}
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
                      className={accountControls.field}
                    >
                      <option value="all">All Statuses</option>
                      {statusOptions.map((status) => (
                        <option value={status} key={status}>
                          {marketplaceCopy(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`${accountControls.action} ${accountControls.actionSecondary}`}
                  >
                    Clear Filters
                  </button>
                  <div aria-live="polite" style={styles.resultCount}>
                    Showing {visibleOrders.length} Of {orders.length} Loaded Orders
                  </div>
                </div>
              </MarketplaceConsolePanel>

              {visibleOrders.length === 0 && (
                <div role="status">
                  <MarketplaceConsolePanel
                    title="No Orders Match Those Filters"
                    primaryAction={{ label: 'Clear Filters', onClick: clearFilters }}
                  >
                    <MarketplaceConsoleStatusRow
                      label="Ledger Filter"
                      value="No Matching Records"
                      detail="Clear The Search Or Choose A Different Ledger Signal"
                    />
                  </MarketplaceConsolePanel>
                </div>
              )}

              {visibleOrders.map((order) => {
                const statusBadge = getStatusBadge(order.status);
                const orderLabel = String(order.id ?? '').slice(0, 8) || 'Not Available';
                return (
                  <MarketplacePageConsole
                    as="article"
                    key={order.key}
                    eyebrow={`Order #${orderLabel}`}
                    title={marketplaceCopy(order.title)}
                    summary={formatDate(order.created_at)}
                    status={statusBadge.label}
                    statusInk={statusBadge.ink}
                  >
                    <div style={styles.orderItems}>
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} style={styles.orderItem}>
                          <span style={styles.itemName}>{marketplaceCopy(item.name)}</span>
                          <span style={styles.itemQty}>x{item.quantity ?? 1}</span>
                          <span style={styles.itemPrice}>
                            {formatAmount(item.amount, item.currency)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.source === 'merchandise' && (
                      <section aria-label="Order Fulfillment" style={styles.fulfillmentPanel}>
                        <div style={styles.fulfillmentHeadingRow}>
                          <div>
                            <div style={styles.fulfillmentEyebrow}>Fulfillment Telemetry</div>
                            <div style={styles.fulfillmentTitle}>
                              {order.deliveredAt || order.status === 'delivered'
                                ? 'Delivery Complete'
                                : order.shippedAt || order.status === 'shipped'
                                  ? 'Package In Transit'
                                  : order.fulfillmentStatus === 'submission_failed'
                                    ? 'Order Needs Fulfillment Review'
                                    : order.fulfillmentStatus
                                      ? marketplaceFulfillmentStatus(order.fulfillmentStatus)
                                      : 'Order Is Being Prepared'}
                            </div>
                          </div>
                          {order.trackingUrl && (
                            <a
                              href={order.trackingUrl}
                              className={`${accountControls.action} ${accountControls.actionSecondary}`}
                            >
                              Track Package
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
                            {order.carrier && (
                              <span>
                                Carrier:{' '}
                                <span data-preserve-case="true">
                                  {marketplaceCarrierName(order.carrier)}
                                </span>
                              </span>
                            )}
                            {order.trackingNumber && (
                              <span>
                                Tracking:{' '}
                                <span data-preserve-case="true">{order.trackingNumber}</span>
                              </span>
                            )}
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
                            Refunded {formatAmount(order.refundAmount, order.currency)}; Net{' '}
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
                        href={`/hub/diamond-store/orders/${encodeURIComponent(order.id)}?source=${encodeURIComponent(order.source)}`}
                        className={`${accountControls.action} ${accountControls.actionPrimary}`}
                      >
                        {order.recordType === 'membership_status'
                          ? 'View Membership Record'
                          : 'View Receipt'}
                      </Link>
                    </div>
                  </MarketplacePageConsole>
                );
              })}
              {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadingMore(true);
                      loadOrders({ append: true, cursor: nextCursor });
                    }}
                    disabled={loadingMore || !nextCursor}
                    className={`${accountControls.action} ${accountControls.actionPrimary}`}
                  >
                    {loadingMore ? 'Loading More Orders...' : 'Load 50 More Orders'}
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
  ordersList: { display: 'grid', gap: '20px' },
  ledgerSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
    gap: 12,
  },
  filterControls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
    gap: 10,
    alignItems: 'end',
  },
  searchControl: { display: 'grid', gap: 6 },
  filterControl: { display: 'grid', gap: 6 },
  controlLabel: {
    color: '#9db6c2',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'capitalize',
  },
  resultCount: {
    gridColumn: '1 / -1',
    color: '#9db6c2',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: 12,
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
    padding: '18px 0',
    borderTop: '1px solid #000000',
    borderBottom: '1px solid #000000',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
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
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'capitalize',
  },
  fulfillmentTitle: { marginTop: '5px', color: '#dff9ff', fontSize: '15px', fontWeight: 700 },
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
  fulfillmentStepLabel: { fontSize: '12px', fontWeight: 700, textTransform: 'capitalize' },
  fulfillmentDate: {
    gridColumn: '2',
    color: '#7f939e',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  trackingMeta: {
    display: 'flex',
    gap: '8px 20px',
    flexWrap: 'wrap',
    marginTop: '16px',
    color: '#93a7b2',
    fontFamily:
      "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
    fontSize: '12px',
    overflowWrap: 'anywhere',
  },
};
