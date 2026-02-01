/**
 * Shopping Cart Component
 * Floating cart with slide-out panel
 */
import { useEffect, useState } from 'react';
import { ShoppingCart, X, Trash2 } from 'lucide-react';
import useCartStore from '../../stores/cartStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function ShoppingCartComponent({ onCheckout }) {
    const {
        items,
        isOpen,
        toggleCart,
        closeCart,
        removeItem,
        updateQuantity,
        getTotal,
        getItemCount
    } = useCartStore();

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const itemCount = getItemCount();
    const total = getTotal();

    return (
        <>
            {/* Cart Icon Button */}
            <button
                onClick={toggleCart}
                style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(24, 119, 242, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
                <ShoppingCart size={24} color="#fff" />
                {itemCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#ff4757',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {itemCount}
                    </div>
                )}
            </button>

            {/* Cart Panel */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeCart}
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0, 0, 0, 0.5)',
                                zIndex: 1001
                            }}
                        />

                        {/* Cart Drawer */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            style={{
                                position: 'fixed',
                                top: 0,
                                right: 0,
                                width: '100%',
                                maxWidth: 400,
                                height: '100vh',
                                background: '#242526',
                                boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.3)',
                                zIndex: 1002,
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <h2 style={{
                                    fontSize: 20,
                                    fontWeight: 700,
                                    color: '#E4E6EB',
                                    margin: 0
                                }}>
                                    Shopping Cart ({itemCount})
                                </h2>
                                <button
                                    onClick={closeCart}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <X size={24} color="#E4E6EB" />
                                </button>
                            </div>

                            {/* Cart Items */}
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: 24
                            }}>
                                {items.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '40px 20px',
                                        color: 'rgba(255, 255, 255, 0.5)'
                                    }}>
                                        <ShoppingCart size={48} style={{ margin: '0 auto 16px' }} />
                                        <p>Your cart is empty</p>
                                    </div>
                                ) : (
                                    items.map((item) => (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                borderRadius: 12,
                                                padding: 16,
                                                marginBottom: 12,
                                                border: '1px solid rgba(255, 255, 255, 0.1)'
                                            }}
                                        >
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                marginBottom: 8
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <h3 style={{
                                                        fontSize: 16,
                                                        fontWeight: 600,
                                                        color: '#E4E6EB',
                                                        margin: '0 0 4px 0'
                                                    }}>
                                                        {item.name}
                                                    </h3>
                                                    {item.diamonds && (
                                                        <p style={{
                                                            fontSize: 14,
                                                            color: '#1877F2',
                                                            margin: 0
                                                        }}>
                                                            <img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> {item.diamonds} Diamonds
                                                            {item.bonus > 0 && ` + ${item.bonus} Bonus`}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => removeItem(item.id)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 4,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <Trash2 size={18} color="#ff4757" />
                                                </button>
                                            </div>

                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8
                                                }}>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                        style={{
                                                            width: 28,
                                                            height: 28,
                                                            borderRadius: 6,
                                                            background: 'rgba(255, 255, 255, 0.1)',
                                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                                            color: '#E4E6EB',
                                                            cursor: 'pointer',
                                                            fontSize: 16,
                                                            fontWeight: 700
                                                        }}
                                                    >
                                                        −
                                                    </button>
                                                    <span style={{
                                                        fontSize: 14,
                                                        color: '#E4E6EB',
                                                        minWidth: 20,
                                                        textAlign: 'center'
                                                    }}>
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                        style={{
                                                            width: 28,
                                                            height: 28,
                                                            borderRadius: 6,
                                                            background: 'rgba(255, 255, 255, 0.1)',
                                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                                            color: '#E4E6EB',
                                                            cursor: 'pointer',
                                                            fontSize: 16,
                                                            fontWeight: 700
                                                        }}
                                                    >
                                                        +
                                                    </button>
                                                </div>

                                                <div style={{
                                                    fontSize: 18,
                                                    fontWeight: 700,
                                                    color: '#1877F2'
                                                }}>
                                                    ${(item.price * item.quantity).toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Footer */}
                            {items.length > 0 && (
                                <div style={{
                                    padding: 24,
                                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                    background: 'rgba(0, 0, 0, 0.2)'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 16
                                    }}>
                                        <span style={{
                                            fontSize: 18,
                                            fontWeight: 600,
                                            color: '#E4E6EB'
                                        }}>
                                            Total
                                        </span>
                                        <span style={{
                                            fontSize: 24,
                                            fontWeight: 700,
                                            color: '#1877F2'
                                        }}>
                                            ${total.toFixed(2)}
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => {
                                            if (onCheckout) {
                                                onCheckout(items);
                                                // Don't close cart immediately - let the checkout complete
                                                // The page will redirect to Stripe when ready
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '16px 24px',
                                            background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                                            border: 'none',
                                            borderRadius: 12,
                                            color: '#fff',
                                            fontSize: 16,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        Proceed to Checkout
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
