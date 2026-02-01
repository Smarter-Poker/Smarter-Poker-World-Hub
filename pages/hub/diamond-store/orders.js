/**
 * Order History Page
 * ═══════════════════════════════════════════════════════════════════════════
 * View past orders from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function OrderHistory() {
    const [user, setUser] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            // Fetch orders from database
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('user_id', authUser.id)
                .order('created_at', { ascending: false });

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching orders:', error);
            }

            setOrders(data || []);
            setLoading(false);
        } catch (error) {
            console.error('Error loading orders:', error);
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
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatPrice = (cents) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    return (
        <PageTransition>
            <Head>
                <title>Order History — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <div style={styles.header}>
                        <h1 style={styles.title}>📦 Order History</h1>
                        <Link href="/hub/diamond-store" style={styles.shopLink}>
                            Continue Shopping →
                        </Link>
                    </div>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>📦</div>
                            <p style={styles.loadingText}>Loading orders...</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>📦</div>
                            <h2 style={styles.emptyTitle}>No orders yet</h2>
                            <p style={styles.emptyText}>Your order history will appear here after your first purchase</p>
                            <Link href="/hub/diamond-store" style={styles.shopButton}>
                                💎 Visit Diamond Store
                            </Link>
                        </div>
                    ) : (
                        <div style={styles.ordersList}>
                            {orders.map(order => (
                                <div key={order.id} style={styles.orderCard}>
                                    <div style={styles.orderHeader}>
                                        <div>
                                            <div style={styles.orderId}>Order #{order.id.slice(0, 8).toUpperCase()}</div>
                                            <div style={styles.orderDate}>{formatDate(order.created_at)}</div>
                                        </div>
                                        {getStatusBadge(order.status)}
                                    </div>

                                    <div style={styles.orderItems}>
                                        {(order.items || []).map((item, idx) => (
                                            <div key={idx} style={styles.orderItem}>
                                                <span style={styles.itemName}>{item.name}</span>
                                                <span style={styles.itemQty}>x{item.quantity}</span>
                                                <span style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={styles.orderFooter}>
                                        <div style={styles.totalLabel}>Total</div>
                                        <div style={styles.totalAmount}>{formatPrice(order.total_cents)}</div>
                                    </div>

                                    {order.stripe_receipt_url && (
                                        <a
                                            href={order.stripe_receipt_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={styles.receiptLink}
                                        >
                                            View Receipt →
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: { minHeight: '100vh', background: '#0a0a0a', color: '#FFFFFF' },
    content: { maxWidth: '900px', margin: '0 auto', padding: '80px 24px 40px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' },
    title: { fontSize: '32px', fontWeight: 700, margin: 0 },
    shopLink: { color: '#00D4FF', textDecoration: 'none', fontSize: '14px', fontWeight: 600 },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
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
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
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
    orderDate: { fontSize: '13px', color: '#9ca3af' },
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

