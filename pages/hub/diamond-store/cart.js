/**
 * Shopping Cart Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Dedicated cart page for Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function ShoppingCart() {
    const [user, setUser] = useState(null);
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCart();
    }, []);

    const loadCart = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            // Load cart from localStorage
            const savedCart = localStorage.getItem('diamond-store-cart');
            if (savedCart) {
                setCart(JSON.parse(savedCart));
            }

            setLoading(false);
        } catch (error) {
            console.error('Error loading cart:', error);
            setLoading(false);
        }
    };

    const updateQuantity = (itemId, newQuantity) => {
        if (newQuantity < 1) {
            removeItem(itemId);
            return;
        }

        const updated = cart.map(item =>
            item.id === itemId ? { ...item, quantity: newQuantity } : item
        );
        setCart(updated);
        localStorage.setItem('diamond-store-cart', JSON.stringify(updated));
    };

    const removeItem = (itemId) => {
        const updated = cart.filter(item => item.id !== itemId);
        setCart(updated);
        localStorage.setItem('diamond-store-cart', JSON.stringify(updated));
    };

    const clearCart = () => {
        setCart([]);
        localStorage.removeItem('diamond-store-cart');
    };

    const getSubtotal = () => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    };

    const handleCheckout = () => {
        // Redirect to store with checkout flow
        window.location.href = '/hub/diamond-store?checkout=true';
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}>🛒</div>
                <p style={styles.loadingText}>Loading cart...</p>
            </div>
        );
    }

    return (
        <PageTransition>
            <Head>
                <title>Shopping Cart — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>🛒 Shopping Cart</h1>

                    {cart.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>🛒</div>
                            <h2 style={styles.emptyTitle}>Your cart is empty</h2>
                            <p style={styles.emptyText}>Add some items to get started!</p>
                            <Link href="/hub/diamond-store">
                                <a style={styles.shopButton}>Browse Store</a>
                            </Link>
                        </div>
                    ) : (
                        <div style={styles.cartLayout}>
                            {/* Cart Items */}
                            <div style={styles.itemsSection}>
                                <AnimatePresence>
                                    {cart.map(item => (
                                        <CartItem
                                            key={item.id}
                                            {...item}
                                            onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
                                            onRemove={() => removeItem(item.id)}
                                        />
                                    ))}
                                </AnimatePresence>

                                <button onClick={clearCart} style={styles.clearButton}>
                                    Clear Cart
                                </button>
                            </div>

                            {/* Summary */}
                            <div style={styles.summarySection}>
                                <h3 style={styles.summaryTitle}>Order Summary</h3>

                                <div style={styles.summaryRow}>
                                    <span>Subtotal ({cart.length} items)</span>
                                    <span>${getSubtotal().toFixed(2)}</span>
                                </div>

                                <div style={styles.summaryRow}>
                                    <span>Tax</span>
                                    <span>Calculated at checkout</span>
                                </div>

                                <div style={styles.divider} />

                                <div style={styles.totalRow}>
                                    <span>Total</span>
                                    <span>${getSubtotal().toFixed(2)}</span>
                                </div>

                                <button onClick={handleCheckout} style={styles.checkoutButton}>
                                    Proceed to Checkout
                                </button>

                                <Link href="/hub/diamond-store">
                                    <a style={styles.continueShoppingLink}>← Continue Shopping</a>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function CartItem({ id, name, price, quantity, image, type, onUpdateQuantity, onRemove }) {
    return (
        <motion.div
            style={styles.cartItem}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            layout
        >
            {image && (
                <img src={image} alt={name} style={styles.itemImage} />
            )}

            <div style={styles.itemDetails}>
                <h4 style={styles.itemName}>{name}</h4>
                <p style={styles.itemType}>{type}</p>
                <p style={styles.itemPrice}>${price.toFixed(2)}</p>
            </div>

            <div style={styles.itemActions}>
                <div style={styles.quantityControl}>
                    <button
                        onClick={() => onUpdateQuantity(quantity - 1)}
                        style={styles.quantityButton}
                    >
                        −
                    </button>
                    <span style={styles.quantity}>{quantity}</span>
                    <button
                        onClick={() => onUpdateQuantity(quantity + 1)}
                        style={styles.quantityButton}
                    >
                        +
                    </button>
                </div>

                <button onClick={onRemove} style={styles.removeButton}>
                    Remove
                </button>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    title: {
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '32px'
    },
    cartLayout: {
        display: 'grid',
        gridTemplateColumns: '1fr 400px',
        gap: '32px',
        '@media (max-width: 768px)': {
            gridTemplateColumns: '1fr'
        }
    },
    itemsSection: {
        display: 'grid',
        gap: '16px'
    },
    cartItem: {
        display: 'flex',
        gap: '16px',
        padding: '16px',
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px'
    },
    itemImage: {
        width: '100px',
        height: '100px',
        objectFit: 'cover',
        borderRadius: '8px'
    },
    itemDetails: {
        flex: 1
    },
    itemName: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '4px'
    },
    itemType: {
        fontSize: '14px',
        color: '#9ca3af',
        marginBottom: '8px'
    },
    itemPrice: {
        fontSize: '16px',
        fontWeight: 600,
        color: '#00E0FF'
    },
    itemActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignItems: 'flex-end'
    },
    quantityControl: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        padding: '4px'
    },
    quantityButton: {
        width: '32px',
        height: '32px',
        background: 'transparent',
        border: 'none',
        color: '#FFFFFF',
        fontSize: '18px',
        cursor: 'pointer',
        borderRadius: '4px',
        transition: 'background 0.2s'
    },
    quantity: {
        minWidth: '40px',
        textAlign: 'center',
        fontSize: '16px',
        fontWeight: 600
    },
    removeButton: {
        padding: '6px 12px',
        background: 'transparent',
        border: '1px solid rgba(255, 68, 68, 0.5)',
        color: '#FF4444',
        borderRadius: '6px',
        fontSize: '14px',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    clearButton: {
        padding: '12px 24px',
        background: 'transparent',
        border: '1px solid rgba(255, 68, 68, 0.5)',
        color: '#FF4444',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: '16px'
    },
    summarySection: {
        background: '#1a1a1a',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        height: 'fit-content',
        position: 'sticky',
        top: '80px'
    },
    summaryTitle: {
        fontSize: '20px',
        fontWeight: 600,
        marginBottom: '24px'
    },
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '12px',
        fontSize: '14px',
        color: '#9ca3af'
    },
    divider: {
        height: '1px',
        background: 'rgba(255, 255, 255, 0.1)',
        margin: '16px 0'
    },
    totalRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '20px',
        fontWeight: 700,
        marginBottom: '24px'
    },
    checkoutButton: {
        width: '100%',
        padding: '16px',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
        marginBottom: '16px'
    },
    continueShoppingLink: {
        display: 'block',
        textAlign: 'center',
        color: '#00E0FF',
        textDecoration: 'none',
        fontSize: '14px'
    },
    emptyState: {
        textAlign: 'center',
        padding: '80px 24px'
    },
    emptyIcon: {
        fontSize: '64px',
        marginBottom: '16px',
        opacity: 0.5
    },
    emptyTitle: {
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '8px'
    },
    emptyText: {
        color: '#9ca3af',
        marginBottom: '32px'
    },
    shopButton: {
        display: 'inline-block',
        padding: '12px 32px',
        background: '#00E0FF',
        color: '#FFFFFF',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 600
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    spinner: {
        fontSize: '48px',
        animation: 'pulse 1.5s ease-in-out infinite'
    },
    loadingText: {
        marginTop: '16px',
        color: '#9ca3af'
    }
};
