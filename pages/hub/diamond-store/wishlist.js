/**
 * Wishlist Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's saved products from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { wishlistService } from '../../../src/services/preferences-service';
import toast from '../../../src/stores/toastStore';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { useRequireAuth } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function Wishlist() {
    const { user, checking: authChecking } = useRequireAuth('/hub/diamond-store/wishlist');
    useTrainingBus('diamond-store-wishlist');
    const [wishlist, setWishlist] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authChecking || !user?.id) return;
        loadWishlist();
    }, [authChecking, user?.id]);

    const loadWishlist = async () => {
        try {
            const items = await wishlistService.getWishlist(user.id);
            setWishlist(Array.isArray(items) ? items : []);
            setLoading(false);
        } catch (error) {
            console.warn('Error loading wishlist:', error);
            setLoading(false);
        }
    };

    const removeFromWishlist = async (productId) => {
        try {
            await wishlistService.removeFromWishlist(user.id, productId);
            setWishlist(prev => prev.filter(item => item.product_id !== productId));
        } catch (error) {
            console.warn('Error removing from wishlist:', error);
            toast.error('Could Not Remove Item. Please Try Again.');
        }
    };

    return (
        <PageTransition>
            <SEOHead
                title="Wishlist — Diamond Store"
                description="Your Saved Items In The Diamond Store Wishlist."
                canonical="/hub/diamond-store/wishlist"
                noindex={true}
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}> Wishlist</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}></div>
                            <p style={styles.loadingText}>Loading Wishlist...</p>
                            <style>{`@keyframes dsSpin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    ) : wishlist.length === 0 ? (
                        <div style={styles.emptyState}>
                            <h2 style={styles.emptyTitle}>Your Wishlist Is Empty</h2>
                            <p style={styles.emptyText}>Save Items You Love For Later</p>
                            <Link href="/hub/diamond-store" style={styles.shopButton}>Browse Store</Link>
                        </div>
                    ) : (
                        <div style={styles.wishlistGrid}>
                            {wishlist.map(item => (
                                <div key={item.id ?? item.product_id} style={styles.wishlistItem}>
                                    <h3>{item.product_name}</h3>
                                    <p style={styles.price}>${(Number(item.product_price) || 0).toFixed(2)}</p>
                                    <button onClick={() => removeFromWishlist(item.product_id)} style={styles.removeButton}>
                                        Remove
                                    </button>
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
    content: { maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 40px' },
    title: { fontSize: '32px', fontWeight: 700, marginBottom: '32px' },
    wishlistGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
    wishlistItem: { background: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' },
    price: { color: '#00E0FF', fontSize: '18px', fontWeight: 600, margin: '8px 0' },
    removeButton: { padding: '8px 16px', background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', borderRadius: '6px', cursor: 'pointer' },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af', marginBottom: '24px' },
    shopButton: {
        display: 'inline-block',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#FFFFFF',
        borderRadius: '8px',
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
    loadingText: { marginTop: '16px', color: '#9ca3af' }
};
