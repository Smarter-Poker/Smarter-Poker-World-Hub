/**
 * Wishlist Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's saved products from Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { wishlistService } from '../../../src/services/preferences-service';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function Wishlist() {
    const [user, setUser] = useState(null);
    const [wishlist, setWishlist] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWishlist();
    }, []);

    const loadWishlist = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            const items = await wishlistService.getWishlist(authUser.id);
            setWishlist(items);
            setLoading(false);
        } catch (error) {
            console.error('Error loading wishlist:', error);
            setLoading(false);
        }
    };

    const removeFromWishlist = async (productId) => {
        try {
            await wishlistService.removeFromWishlist(user.id, productId);
            setWishlist(wishlist.filter(item => item.product_id !== productId));
        } catch (error) {
            console.error('Error removing from wishlist:', error);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Wishlist — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>❤️ Wishlist</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>❤️</div>
                            <p style={styles.loadingText}>Loading wishlist...</p>
                        </div>
                    ) : wishlist.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>❤️</div>
                            <h2 style={styles.emptyTitle}>Your wishlist is empty</h2>
                            <p style={styles.emptyText}>Save items you love for later</p>
                        </div>
                    ) : (
                        <div style={styles.wishlistGrid}>
                            {wishlist.map(item => (
                                <div key={item.id} style={styles.wishlistItem}>
                                    <h3>{item.product_name}</h3>
                                    <p style={styles.price}>${item.product_price}</p>
                                    <button onClick={() => removeFromWishlist(item.product_id)} style={styles.removeButton}>
                                        Remove
                                    </button>
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
    content: { maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 40px' },
    title: { fontSize: '32px', fontWeight: 700, marginBottom: '32px' },
    wishlistGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
    wishlistItem: { background: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' },
    price: { color: '#00E0FF', fontSize: '18px', fontWeight: 600, margin: '8px 0' },
    removeButton: { padding: '8px 16px', background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', borderRadius: '6px', cursor: 'pointer' },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af' },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' }
};
