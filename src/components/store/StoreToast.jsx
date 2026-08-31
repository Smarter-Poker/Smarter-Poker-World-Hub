/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  STORE TOAST: Premium notification system for Diamond Store
 *  ═══════════════════════════════════════════════════════════════════════════════
 *  Replaces all native alert() calls with animated, auto-dismiss toasts.
 *  4 types: success (cyan), error (red), info (cyan), warning (amber)
 *
 *  Usage from anywhere:
 *    import { showStoreToast } from './StoreToast';
 *    showStoreToast('success', 'Purchase complete!');
 *    showStoreToast('error', 'Insufficient diamonds');
 *
 *  Or via event:
 *    window.dispatchEvent(new CustomEvent('store-toast', {
 *      detail: { type: 'success', message: 'Done!' }
 *    }));
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// ── Helper function (usable from any module) ──
export function showStoreToast(type, message) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('store-toast', {
            detail: { type: type || 'info', message }
        }));
    }
}

// ── Type styles ──
const TOAST_STYLES = {
    success: {
        bg: 'linear-gradient(135deg, rgba(0, 119, 170, 0.98), rgba(2, 36, 54, 0.98))',
        border: 'rgba(99, 231, 255, 0.72)',
        IconCol: CheckCircle,
        glow: 'rgba(0, 180, 255, 0.34)',
    },
    error: {
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        border: 'rgba(248, 113, 113, 0.6)',
        IconCol: XCircle,
        glow: 'rgba(239, 68, 68, 0.4)',
    },
    info: {
        bg: 'linear-gradient(135deg, rgba(0, 180, 220, 0.95), rgba(0, 130, 180, 0.95))',
        border: 'rgba(0, 212, 255, 0.6)',
        IconCol: Info,
        glow: 'rgba(0, 212, 255, 0.4)',
    },
    warning: {
        bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))',
        border: 'rgba(251, 191, 36, 0.6)',
        IconCol: AlertTriangle,
        glow: 'rgba(245, 158, 11, 0.4)',
    },
};

// ── React component ──
export default function StoreToast() {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef(new Set());

    const addToast = useCallback((type, message) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev.slice(-4), { id, type, message }]); // Max 5 visible

        // Errors and warnings need enough time to be read and acted on. Every
        // toast also has a keyboard-operable dismiss control below.
        const timeoutMs = type === 'error' || type === 'warning' ? 8000 : 4500;
        const timerId = setTimeout(() => {
            timersRef.current.delete(timerId);
            setToasts(prev => prev.filter(t => t.id !== id));
        }, timeoutMs);
        timersRef.current.add(timerId);
    }, []);

    // Clear any pending auto-dismiss timers on unmount
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach(t => clearTimeout(t));
            timers.clear();
        };
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        const handler = (e) => {
            const { type, message } = e.detail || {};
            if (message) addToast(type || 'info', message);
        };
        window.addEventListener('store-toast', handler);
        return () => window.removeEventListener('store-toast', handler);
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <>
            <div style={{
                position: 'fixed',
                top: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 99998,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'center',
                pointerEvents: 'none',
                width: '90%',
                maxWidth: 420,
            }}>
                {toasts.map(toast => {
                    const s = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
                    return (
                        <div
                            key={toast.id}
                            role={toast.type === 'error' ? 'alert' : 'status'}
                            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                            aria-atomic="true"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '14px 20px',
                                background: s.bg,
                                border: `1px solid ${s.border}`,
                                borderRadius: 0,
                                boxShadow: `0 4px 24px ${s.glow}, 0 0 40px ${s.glow}`,
                                backdropFilter: 'blur(12px)',
                                animation: 'storeToastIn 0.35s ease-out',
                                pointerEvents: 'auto',
                                width: '100%',
                                textTransform: 'capitalize',
                            }}
                        >
                            <span style={{
                                fontSize: 22,
                                fontWeight: 800,
                                width: 28,
                                height: 28,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 0,
                                background: 'rgba(255,255,255,0.15)',
                                flexShrink: 0,
                            }}>
                                {s.IconCol && <s.IconCol size={16} strokeWidth={3} color="#fff" />}
                            </span>
                            <span style={{
                                flex: 1,
                                fontSize: 14,
                                fontWeight: 600,
                                color: '#fff',
                                lineHeight: 1.4,
                                fontFamily: "'Inter', -apple-system, sans-serif",
                                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                            }}>
                                {toast.message}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                aria-label="Dismiss Store Message"
                                style={{
                                    width: 44,
                                    minWidth: 44,
                                    height: 44,
                                    display: 'grid',
                                    placeItems: 'center',
                                    padding: 0,
                                    border: '1px solid rgba(255,255,255,0.45)',
                                    borderRadius: 0,
                                    background: 'rgba(0,0,0,0.16)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                }}
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>
            <style>{`
                @keyframes storeToastIn {
                    from { transform: translateY(-30px) scale(0.9); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
            `}</style>
        </>
    );
}
