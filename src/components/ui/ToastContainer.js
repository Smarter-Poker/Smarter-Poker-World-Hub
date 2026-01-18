/**
 * 🎨 TOAST NOTIFICATION COMPONENT
 * Animated toast notifications
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../stores/toastStore';
import { toastSlideIn } from '../../utils/animations';

const toastStyles = {
    success: {
        background: 'linear-gradient(135deg, #00ff88, #00cc66)',
        color: '#000',
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

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
            <AnimatePresence>
                {toasts.map((toast) => {
                    const style = toastStyles[toast.type] || toastStyles.info;

                    return (
                        <motion.div
                            key={toast.id}
                            variants={toastSlideIn}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            style={{
                                ...style,
                                padding: '16px 20px',
                                borderRadius: '12px',
                                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                minWidth: 300,
                                maxWidth: 400,
                                cursor: 'pointer',
                            }}
                            onClick={() => removeToast(toast.id)}
                        >
                            <span style={{ fontSize: 20, fontWeight: 700 }}>{style.icon}</span>
                            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{toast.message}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeToast(toast.id);
                                }}
                                style={{
                                    background: 'rgba(0, 0, 0, 0.2)',
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
