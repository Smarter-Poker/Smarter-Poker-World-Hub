/**
 * Order History Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View past orders from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import MarketplaceSubpageShell from '../../../src/components/store/MarketplaceSubpageShell';

function safeTrackingUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

export default function OrderHistory() {
  const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/orders');
  useTrainingBus('diamond-store-orders');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [partialError, setPartialError] = useState(null);
  // Realtime events can arrive while the initial three-source read is still
  // running. Only the newest snapshot may commit, otherwise an older response
  // can roll a just-shipped order back to "processing" on screen.
  const loadRequestRef = useRef(0);

  useEffect(() => {
    if (authChecking || !user?.id) return;
    loadOrders();
  }, [authChecking, user?.id]);
  // Realtime subscription — live updates on both order pipelines
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`orders:${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diamond_purchases',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          loadOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchandise_orders',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          loadOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vip_subscriptions',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          loadOrders();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id]);

  const toCents = (usd) => Math.round((Number(usd) || 0) * 100);

  // Must match DIAMONDS_PER_DOLLAR in pages/api/store/purchase-with-diamonds.js
  const DIAMONDS_PER_DOLLAR = 100;

  // diamond_purchases: written by create-checkout-session.js (pending) and
  // completed/refunded by webhooks/stripe.js. price_usd is in DOLLARS.
  const normalizeDiamondPurchase = (row) => {
    const packageName = row?.package_name || 'Diamond Package';
    const diamonds = (Number(row?.diamonds_amount) || 0) + (Number(row?.bonus_diamonds) || 0);
    return {
      key: `diamond-${row?.id}`,
      id: row?.id,
      source: 'diamonds',
      title: `${packageName} Diamond Package`,
      created_at: row?.created_at || row?.completed_at || null,
      status: row?.status || 'pending',
      currency: 'usd',
      amount: toCents(row?.price_usd),
      items: [
        {
          name:
            diamonds > 0 ? `${packageName} (${diamonds.toLocaleString()} Diamonds)` : packageName,
          quantity: 1,
          amount: toCents(row?.price_usd),
          currency: 'usd',
        },
      ],
    };
  };

  // merchandise_orders: written by create-checkout-session.js (card, pending →
  // processing via the webhook) and purchase-with-diamonds.js (diamonds,
  // completed). total_usd is in DOLLARS; diamond orders carry diamonds_spent.
  const normalizeMerchandiseOrder = (row) => {
    const paidWithDiamonds = row?.payment_method === 'diamonds';
    const rawItems = Array.isArray(row?.items) ? row.items : [];
    return {
      key: `merch-${row?.id}`,
      id: row?.id,
      source: 'merchandise',
      title: 'Merchandise Order',
      created_at: row?.created_at || row?.updated_at || null,
      status: row?.status || 'pending',
      currency: paidWithDiamonds ? 'diamonds' : 'usd',
      amount: paidWithDiamonds ? Number(row?.diamonds_spent) || 0 : toCents(row?.total_usd),
      trackingNumber: row?.tracking_number || null,
      trackingUrl: safeTrackingUrl(row?.tracking_url),
      carrier: row?.carrier || null,
      shippedAt: row?.shipped_at || row?.metadata?.shipped_at || null,
      deliveredAt: row?.delivered_at || row?.metadata?.delivered_at || null,
      fulfillmentStatus: row?.metadata?.fulfillment_status || null,
      items: rawItems.map((item) => {
        // create-checkout-session stores `price`; purchase-with-diamonds
        // stores `priceUsd` (and sometimes a catalog `diamondPrice`)
        const qty = Number(item?.quantity) || 1;
        const unitUsd = item?.price ?? item?.priceUsd;
        const unitDiamonds = item?.diamondPrice;
        // A diamond-paid order is denominated in diamonds end to end.
        // purchase-with-diamonds.js charges price_diamonds when the item
        // is catalogued and ceil(priceUsd * 100) when it is not — mirror
        // both here so the line items reconcile with the order total.
        const unitAmount = paidWithDiamonds
          ? unitDiamonds != null
            ? Number(unitDiamonds) || 0
            : Math.ceil((Number(unitUsd) || 0) * DIAMONDS_PER_DOLLAR)
          : toCents(unitUsd);
        return {
          name: item?.name || 'Item',
          quantity: qty,
          amount: unitAmount * qty,
          currency: paidWithDiamonds ? 'diamonds' : 'usd',
        };
      }),
    };
  };

  const normalizeVipSubscription = (row) => {
    const tier = String(row?.tier || 'VIP');
    const titleTier = tier.charAt(0).toUpperCase() + tier.slice(1);
    return {
      key: `vip-${row?.id}`,
      id: row?.id,
      source: 'vip',
      title: `${titleTier} VIP Membership`,
      created_at: row?.created_at || row?.updated_at || null,
      status: row?.status || 'active',
      currency: 'usd',
      amount: toCents(row?.price_usd),
      items: [
        {
          name: `${titleTier} VIP Access`,
          quantity: 1,
          amount: toCents(row?.price_usd),
          currency: 'usd',
        },
      ],
    };
  };

  const loadOrders = async () => {
    const requestId = ++loadRequestRef.current;
    try {
      // The real pipelines write diamond_purchases and merchandise_orders —
      // read both and merge client-side into one date-sorted list.
      const [purchasesRes, merchRes, vipRes] = await Promise.all([
        supabase
          .from('diamond_purchases')
          .select(
            'id, package_name, diamonds_amount, bonus_diamonds, price_usd, status, created_at, completed_at'
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('merchandise_orders')
          .select(
            'id, items, total_usd, diamonds_spent, payment_method, status, metadata, tracking_number, tracking_url, carrier, created_at, updated_at, shipped_at, delivered_at'
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('vip_subscriptions')
          .select(
            'id, tier, status, price_usd, current_period_start, current_period_end, created_at, updated_at'
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(25),
      ]);

      const failed = [];
      const merged = [];

      if (purchasesRes?.error) {
        console.warn('Error fetching diamond purchases:', purchasesRes.error);
        failed.push('Diamond purchases');
      } else {
        (purchasesRes?.data || []).forEach((row) => merged.push(normalizeDiamondPurchase(row)));
      }

      if (merchRes?.error) {
        console.warn('Error fetching merchandise orders:', merchRes.error);
        failed.push('Merchandise orders');
      } else {
        (merchRes?.data || []).forEach((row) => merged.push(normalizeMerchandiseOrder(row)));
      }

      if (vipRes?.error) {
        console.warn('Error fetching VIP subscriptions:', vipRes.error);
        failed.push('VIP memberships');
      } else {
        (vipRes?.data || []).forEach((row) => merged.push(normalizeVipSubscription(row)));
      }

      // Every source failed — nothing truthful can be shown.
      if (requestId !== loadRequestRef.current) return;
      if (failed.length === 3) {
        setLoadError(
          purchasesRes?.error?.message ||
            merchRes?.error?.message ||
            vipRes?.error?.message ||
            'Could not load orders'
        );
        setPartialError(null);
        setOrders([]);
        setLoading(false);
        return;
      }

      merged.sort((a, b) => (Date.parse(b?.created_at) || 0) - (Date.parse(a?.created_at) || 0));

      setLoadError(null);
      // One side failed — show what we have and say so
      setPartialError(
        failed.length > 0 ? `${failed.join(' And ')} Could Not Be Loaded Right Now.` : null
      );
      setOrders(merged.slice(0, 50));
      setLoading(false);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.warn('Error loading orders:', error);
      setLoadError(error?.message || 'Could not load orders');
      setPartialError(null);
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      completed: { bg: 'rgba(34, 197, 94, 0.15)', color: '#00a8e8', label: 'Completed' },
      pending: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Pending' },
      processing: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Processing' },
      paid: { bg: 'rgba(59, 130, 246, 0.15)', color: '#77c9ff', label: 'Paid — Review' },
      shipped: { bg: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff', label: 'Shipped' },
      delivered: { bg: 'rgba(34, 197, 94, 0.15)', color: '#00a8e8', label: 'Delivered' },
      active: { bg: 'rgba(34, 197, 94, 0.15)', color: '#00a8e8', label: 'Active' },
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
          {loading ? (
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
              <h2 style={styles.emptyTitle}>No Orders Yet</h2>
              <p style={styles.emptyText}>
                Your Order History Will Appear Here After Your First Purchase
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
              {orders.map((order) => (
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
                    <div style={styles.totalLabel}>Total</div>
                    <div style={styles.totalAmount}>
                      {formatAmount(order.amount, order.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </MarketplaceSubpageShell>
      </div>
      <BottomNavBar />
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
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  totalLabel: { fontSize: '14px', color: '#9ca3af' },
  totalAmount: { fontSize: '18px', fontWeight: 700, color: '#00D4FF' },
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
    display: 'block',
    marginTop: '16px',
    textAlign: 'center',
    color: '#00D4FF',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600,
  },
};
