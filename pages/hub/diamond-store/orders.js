/**
 * Order History Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View past orders from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function OrderHistory() {
    const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/orders');
    useTrainingBus('diamond-store-orders');
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [partialError, setPartialError] = useState(null);

    useEffect(() => {
        if (authChecking || !user?.id) return;
        loadOrders();
    }, [authChecking, user?.id]);
  // Realtime subscription — live updates on both order pipelines
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`orders:${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diamond_purchases', filter: `user_id=eq.${user?.id}` }, () => {
        loadOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchandise_orders', filter: `user_id=eq.${user?.id}` }, () => {
        loadOrders();
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
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
            items: [{
                name: diamonds > 0 ? `${packageName} (${diamonds.toLocaleString()} Diamonds)` : packageName,
                quantity: 1,
                amount: toCents(row?.price_usd),
                currency: 'usd'
            }]
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
            amount: paidWithDiamonds ? (Number(row?.diamonds_spent) || 0) : toCents(row?.total_usd),
            items: rawItems.map(item => {
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
                    ? (unitDiamonds != null
                        ? (Number(unitDiamonds) || 0)
                        : Math.ceil((Number(unitUsd) || 0) * DIAMONDS_PER_DOLLAR))
                    : toCents(unitUsd);
                return {
                    name: item?.name || 'Item',
                    quantity: qty,
                    amount: unitAmount * qty,
                    currency: paidWithDiamonds ? 'diamonds' : 'usd'
                };
            })
        };
    };

    const loadOrders = async () => {
        try {
            // The real pipelines write diamond_purchases and merchandise_orders —
            // read both and merge client-side into one date-sorted list.
            const [purchasesRes, merchRes] = await Promise.all([
                supabase
                    .from('diamond_purchases')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(50),
                supabase
                    .from('merchandise_orders')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(50)
            ]);

            const failed = [];
            const merged = [];

            if (purchasesRes?.error) {
                console.warn('Error fetching diamond purchases:', purchasesRes.error);
                failed.push('Diamond purchases');
            } else {
                (purchasesRes?.data || []).forEach(row => merged.push(normalizeDiamondPurchase(row)));
            }

            if (merchRes?.error) {
                console.warn('Error fetching merchandise orders:', merchRes.error);
                failed.push('Merchandise orders');
            } else {
                (merchRes?.data || []).forEach(row => merged.push(normalizeMerchandiseOrder(row)));
            }

            // Both sides failed — nothing to show
            if (failed.length === 2) {
                setLoadError(purchasesRes?.error?.message || merchRes?.error?.message || 'Could not load orders');
                setPartialError(null);
                setOrders([]);
                setLoading(false);
                return;
            }

            merged.sort((a, b) => (Date.parse(b?.created_at) || 0) - (Date.parse(a?.created_at) || 0));

            setLoadError(null);
            // One side failed — show what we have and say so
            setPartialError(failed.length === 1 ? `${failed[0]} could not be loaded right now.` : null);
            setOrders(merged.slice(0, 50));
            setLoading(false);
        } catch (error) {
            console.warn('Error loading orders:', error);
            setLoadError(error?.message || 'Could not load orders');
            setPartialError(null);
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        const statusStyles = {
            completed: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', label: 'Completed' },
            pending: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Pending' },
            processing: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Processing' },
            failed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Failed' },
            refunded: { bg: 'rgba(156, 163, 175, 0.15)', color: '#9ca3af', label: 'Refunded' }
        };
        const style = statusStyles[status] || statusStyles.pending;
        return (
            <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600,
                background: style.bg,
                color: style.color
            }}>
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
            minute: '2-digit'
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

                <div style={styles.content}>
                    <div style={styles.header}>
                        <h1 style={styles.title}>Order History</h1>
                        <Link href="/hub/diamond-store" style={styles.shopLink}>
                            Continue Shopping →
                        </Link>
                    </div>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}></div>
                            <p style={styles.loadingText}>Loading Orders...</p>
                            <style>{`@keyframes dsSpin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    ) : loadError ? (
                        <div style={styles.emptyState}>
                            <h2 style={styles.emptyTitle}>Could Not Load Orders</h2>
                            <p style={styles.emptyText}>{loadError}</p>
                            <button
                                onClick={() => { setLoading(true); setLoadError(null); setPartialError(null); loadOrders(); }}
                                style={{ ...styles.shopButton, border: 'none', cursor: 'pointer', fontSize: '14px' }}
                            >
                                Retry
                            </button>
                        </div>
                    ) : orders.length === 0 ? (
                        <div style={styles.emptyState}>
                            {partialError && (
                                <div style={{ ...styles.partialNotice, marginBottom: '24px' }}>{partialError}</div>
                            )}
                            <h2 style={styles.emptyTitle}>No Orders Yet</h2>
                            <p style={styles.emptyText}>Your Order History Will Appear Here After Your First Purchase</p>
                            <Link href="/hub/diamond-store" style={styles.shopButton}>
                                Visit Diamond Store
                            </Link>
                        </div>
                    ) : (
                        <div style={styles.ordersList}>
                            {partialError && (
                                <div style={styles.partialNotice}>{partialError}</div>
                            )}
                            {orders.map(order => (
                                <div key={order.key} style={styles.orderCard}>
                                    <div style={styles.orderHeader}>
                                        <div>
                                            <div style={styles.orderId}>Order #{String(order.id ?? '').slice(0, 8).toUpperCase() || '—'}</div>
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
                                                <span style={styles.itemPrice}>{formatAmount(item.amount, item.currency)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={styles.orderFooter}>
                                        <div style={styles.totalLabel}>Total</div>
                                        <div style={styles.totalAmount}>{formatAmount(order.amount, order.currency)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
              <BottomNavBar />
    </PageTransition>
    );
}

const styles = {
    container: { minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#000000', color: '#FFFFFF' },
    content: { maxWidth: '900px', margin: '0 auto', padding: '80px 24px 40px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
    title: { fontSize: '32px', fontWeight: 700, margin: 0 },
    shopLink: { color: '#00D4FF', textDecoration: 'none', fontSize: '14px', fontWeight: 600 },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af', marginBottom: '24px' },
    shopButton: {
        display: 'inline-block',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        borderRadius: '8px',
        color: '#fff',
        textDecoration: 'none',
        fontWeight: 600
    },
    loadingContainer: { textAlign: 'center', padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    spinner: {
        width: '48px',
        height: '48px',
        border: '4px solid rgba(255, 255, 255, 0.15)',
        borderTopColor: '#00E0FF',
        borderRadius: '50%',
        animation: 'dsSpin 1s linear infinite'
    },
    loadingText: { marginTop: '16px', color: '#9ca3af' },
    ordersList: { display: 'grid', gap: '20px' },
    orderCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '24px',
        transition: 'border-color 0.2s'
    },
    orderHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
    },
    orderId: { fontSize: '16px', fontWeight: 700, marginBottom: '4px' },
    orderTitle: { fontSize: '14px', color: '#e5e7eb', marginBottom: '4px' },
    orderDate: { fontSize: '13px', color: '#9ca3af' },
    partialNotice: {
        padding: '10px 12px',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '8px',
        color: '#fbbf24',
        fontSize: '13px'
    },
    orderItems: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
    orderItem: { display: 'flex', alignItems: 'center', gap: '12px' },
    itemName: { flex: 1, fontSize: '14px' },
    itemQty: { fontSize: '13px', color: '#9ca3af' },
    itemPrice: { fontSize: '14px', fontWeight: 600 },
    orderFooter: {
        display: 'flex',
        justifyContent: 'space-between',
        paddingTop: '16px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)'
    },
    totalLabel: { fontSize: '14px', color: '#9ca3af' },
    totalAmount: { fontSize: '18px', fontWeight: 700, color: '#00D4FF' },
    receiptLink: {
        display: 'block',
        marginTop: '16px',
        textAlign: 'center',
        color: '#00D4FF',
        textDecoration: 'none',
        fontSize: '14px',
        fontWeight: 600
    }
};

