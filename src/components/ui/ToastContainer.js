/**
 * 🎨 TOAST NOTIFICATION COMPONENT
 * Animated toast notifications with optional click-to-navigate action
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../stores/toastStore';
import { toastSlideIn } from '../../utils/animations';

const toastStyles = {
    success: {
        background: '#ffffff',
        color: '#000000',
        border: '1px solid #e2e8f0',
        icon: '✓',
    },
    error: {
        background: 'linear-gradient(135deg, #ff4444, #cc0000)',
        color: '#fff',
        icon: '✕',
    },
    info: {
        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
        color: '#fff',
        icon: 'ℹ',
    },
    warning: {
        background: 'linear-gradient(135deg, #ffd700, #ff9900)',
        color: '#000',
        icon: '⚠',
    },
};

export default function ToastContainer() {
    const toasts = useToastStore((s) => s.toasts);
    const removeToast = useToastStore((s) => s.removeToast);

    const toTitleCase = (str) => {
        if (!str || typeof str !== 'string') return str;
        return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100000, // Must exceed all modal z-indexes (10000)
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
            <AnimatePresence>
                {toasts.map((t) => {
                    const style = toastStyles[t.type] || toastStyles.info;
                    const isActionable = typeof t.onClick === 'function';

                    const handleClick = () => {
                        // Only auto-dismiss on body click when toast has an action.
                        // Persistent warning toasts (onClick=null) must be dismissed
                        // via the explicit ✕ button to prevent accidental dismissal.
                        if (isActionable) {
                            t.onClick();
                            removeToast(t.id);
                        }
                    };

                    return (
                        <motion.div
                            key={t.id}
                            variants={toastSlideIn}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            onClick={handleClick}
                            style={{
                                ...style,
                                padding: '16px 20px',
                                borderRadius: '12px',
                                boxShadow: isActionable
                                    ? '0 4px 24px rgba(0,0,0,0.4), 0 0 0 2px rgba(255,255,255,0.3)'
                                    : '0 4px 20px rgba(0,0,0,0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                minWidth: 300,
                                maxWidth: 420,
                                cursor: isActionable ? 'pointer' : 'default',
                                userSelect: 'none',
                            }}
                        >
                            <span style={{ fontSize: 20, fontWeight: 700, flexShrink: 0, color: t.type === 'success' ? '#10b981' : 'inherit' }}>{style.icon}</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
                                {t.type === 'success' ? toTitleCase(t.message) : t.message}
                                {isActionable && (
                                    <span style={{ display: 'block', fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                                        Tap to view →
                                    </span>
                                )}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeToast(t.id);
                                }}
                                style={{
                                    background: 'rgba(0,0,0,0.2)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: 24,
                                    height: 24,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    color: 'inherit',
                                    flexShrink: 0,
                                }}
                            >
                                ✕
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
