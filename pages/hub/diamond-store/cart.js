/**
 * Shopping Cart Page
 * ═══════════════════════════════════════════════════════════════════════════
 * Dedicated cart page for Diamond Store
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import toast from '../../../src/stores/toastStore';

export default function ShoppingCart() {
    const [user, setUser] = useState(null);
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [payWithDiamonds, setPayWithDiamonds] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);

    const DIAMONDS_PER_DOLLAR = 100;

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

            // Fetch diamond balance
            if (authUser?.token) {
                const res = await fetch('/api/store/diamond-transactions?limit=1', {
                    headers: { Authorization: `Bearer ${authUser.token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setDiamondBalance(data.balance || 0);
                }
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

    const getDiamondCost = () => {
        return Math.ceil(getSubtotal() * DIAMONDS_PER_DOLLAR);
    };

    const canAffordWithDiamonds = () => {
        return diamondBalance >= getDiamondCost();
    };

    const handleCheckout = async () => {
        setCheckingOut(true);
        try {
            const res = await fetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: cart }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            throw new Error(data.error || 'No checkout URL returned');
        } catch (err) {
            toast.error(err.message || 'Checkout unavailable. Redirecting...');
            window.location.href = '/hub/diamond-store?checkout=true';
        } finally {
            setCheckingOut(false);
        }
    };

    const handleDiamondCheckout = async () => {
        if (!canAffordWithDiamonds()) {
            toast.error(`Not enough diamonds! You need ${getDiamondCost().toLocaleString()}💎 but only have ${diamondBalance.toLocaleString()}💎`);
            return;
        }

        setCheckingOut(true);
        try {
            const authUser = await getAuthUser();
            const res = await fetch('/api/store/purchase-with-diamonds', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authUser.token}`
                },
                body: JSON.stringify({ items: cart })
            });

            const data = await res.json();

            if (data.success) {
                toast.success(`Purchased with ${data.data.diamonds_spent.toLocaleString()}💎! New balance: ${data.data.new_balance.toLocaleString()}💎`);
                clearCart();
                setDiamondBalance(data.data.new_balance);
            } else {
                throw new Error(data.error || 'Diamond purchase failed');
            }
        } catch (err) {
            toast.error(err.message || 'Diamond purchase failed');
        } finally {
            setCheckingOut(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p style={styles.loadingText}>Loading Cart...</p>
            </div>
        );
    }

    const diamondCost = getDiamondCost();
    const affordable = canAffordWithDiamonds();

    return (
        <PageTransition>
            <SEOHead
                title="Shopping Cart — Diamond Store"
                description="View And Manage Items In Your Diamond Store Shopping Cart."
                canonical="/hub/diamond-store/cart"
                noindex={true}
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>Shopping Cart</h1>

                    {cart.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}></div>
                            <h2 style={styles.emptyTitle}>Your Cart Is Empty</h2>
                            <p style={styles.emptyText}>Add Some Items To Get Started!</p>
                            <Link href="/hub/diamond-store" style={styles.shopButton}>Browse Store</Link>
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
                                    <span>Calculated At Checkout</span>
                                </div>

                                <div style={styles.divider} />

                                <div style={styles.totalRow}>
                                    <span>Total</span>
                                    <span>${getSubtotal().toFixed(2)}</span>
                                </div>

                                {/* ═══ Payment Method Selection ═══ */}
                                <div style={{ marginBottom: '16px' }}>
                                    <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Method</p>

                                    {/* Pay with Diamonds Option */}
                                    <button
                                        onClick={() => setPayWithDiamonds(true)}
                                        style={{
                                            width: '100%',
                                            padding: '14px 16px',
                                            background: payWithDiamonds
                                                ? 'linear-gradient(135deg, rgba(0, 224, 255, 0.15), rgba(138, 43, 226, 0.15))'
                                                : 'rgba(255, 255, 255, 0.03)',
                                            border: payWithDiamonds
                                                ? '2px solid #00E0FF'
                                                : '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            marginBottom: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '22px' }}>💎</span>
                                            <div style={{ textAlign: 'left' }}>
                                                <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '14px', display: 'block' }}>
                                                    Pay with Diamonds
                                                </span>
                                                <span style={{ color: affordable ? '#00E0FF' : '#FF6B6B', fontSize: '12px' }}>
                                                    Balance: {diamondBalance.toLocaleString()}💎
                                                    {!affordable && ` (Need ${diamondCost.toLocaleString()}💎)`}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                color: payWithDiamonds ? '#00E0FF' : '#FFFFFF',
                                                fontWeight: 700,
                                                fontSize: '16px'
                                            }}>
                                                {diamondCost.toLocaleString()}💎
                                            </span>
                                            <div style={{
                                                width: '18px', height: '18px',
                                                borderRadius: '50%',
                                                border: `2px solid ${payWithDiamonds ? '#00E0FF' : 'rgba(255,255,255,0.3)'}`,
                                                background: payWithDiamonds ? '#00E0FF' : 'transparent',
                                                marginLeft: 'auto', marginTop: '4px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                {payWithDiamonds && <span style={{ color: '#000', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                                            </div>
                                        </div>
                                    </button>

                                    {/* Pay with Card Option */}
                                    <button
                                        onClick={() => setPayWithDiamonds(false)}
                                        style={{
                                            width: '100%',
                                            padding: '14px 16px',
                                            background: !payWithDiamonds
                                                ? 'linear-gradient(135deg, rgba(0, 224, 255, 0.15), rgba(0, 153, 255, 0.15))'
                                                : 'rgba(255, 255, 255, 0.03)',
                                            border: !payWithDiamonds
                                                ? '2px solid #00E0FF'
                                                : '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '22px' }}>💳</span>
                                            <div style={{ textAlign: 'left' }}>
                                                <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '14px', display: 'block' }}>
                                                    Pay with Card
                                                </span>
                                                <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                                                    Visa, Mastercard, Amex
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{
                                                color: !payWithDiamonds ? '#00E0FF' : '#FFFFFF',
                                                fontWeight: 700,
                                                fontSize: '16px'
                                            }}>
                                                ${getSubtotal().toFixed(2)}
                                            </span>
                                            <div style={{
                                                width: '18px', height: '18px',
                                                borderRadius: '50%',
                                                border: `2px solid ${!payWithDiamonds ? '#00E0FF' : 'rgba(255,255,255,0.3)'}`,
                                                background: !payWithDiamonds ? '#00E0FF' : 'transparent',
                                                marginLeft: 'auto', marginTop: '4px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'all 0.2s ease'
                                            }}>
                                                {!payWithDiamonds && <span style={{ color: '#000', fontSize: '11px', fontWeight: 900 }}>✓</span>}
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {/* Checkout Button */}
                                <button
                                    onClick={payWithDiamonds ? handleDiamondCheckout : handleCheckout}
                                    disabled={checkingOut || (payWithDiamonds && !affordable)}
                                    style={{
                                        ...styles.checkoutButton,
                                        background: payWithDiamonds
                                            ? (affordable
                                                ? 'linear-gradient(135deg, #00E0FF, #8A2BE2)'
                                                : 'rgba(255, 255, 255, 0.1)')
                                            : 'linear-gradient(135deg, #00E0FF, #0099FF)',
                                        opacity: checkingOut || (payWithDiamonds && !affordable) ? 0.5 : 1,
                                        cursor: checkingOut || (payWithDiamonds && !affordable) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {checkingOut
                                        ? 'Processing...'
                                        : payWithDiamonds
                                            ? `Pay ${diamondCost.toLocaleString()}💎`
                                            : 'Proceed To Checkout'}
                                </button>

                                {payWithDiamonds && !affordable && (
                                    <p style={{ fontSize: '12px', color: '#FF6B6B', textAlign: 'center', marginBottom: '12px' }}>
                                        You need {(diamondCost - diamondBalance).toLocaleString()} more diamonds
                                    </p>
                                )}

                                <Link href="/hub/diamond-store" style={styles.continueShoppingLink}>← Continue Shopping</Link>
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
        background: '#000000',
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
        background: '#000000',
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
