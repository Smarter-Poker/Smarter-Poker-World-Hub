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
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './StoreToast.module.css';

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
        label: 'Confirmed',
        glow: 'rgba(0, 180, 255, 0.34)',
    },
    error: {
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        border: 'rgba(248, 113, 113, 0.6)',
        label: 'Attention',
        glow: 'rgba(239, 68, 68, 0.4)',
    },
    info: {
        bg: 'linear-gradient(135deg, rgba(0, 180, 220, 0.95), rgba(0, 130, 180, 0.95))',
        border: 'rgba(0, 212, 255, 0.6)',
        label: 'Update',
        glow: 'rgba(0, 212, 255, 0.4)',
    },
    warning: {
        bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))',
        border: 'rgba(251, 191, 36, 0.6)',
        label: 'Review',
        glow: 'rgba(245, 158, 11, 0.4)',
    },
};

// ── React component ──
export default function StoreToast() {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef(new Set());

    const addToast = useCallback((type, message) => {
        const id = Date.now() + Math.random();
        // Events can carry provider or API prose that was never present in JSX,
        // so enforce the Marketplace copy contract at the final render boundary.
        // Identifiers and URLs never enter this component as standalone values.
        const copyMessage = marketplaceCopy(message);
        setToasts(prev => [...prev.slice(-4), { id, type, message: copyMessage }]); // Max 5 visible

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
            <div className={styles.stack}>
                {toasts.map(toast => {
                    const s = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
                    return (
                        <div
                            key={toast.id}
                            role={toast.type === 'error' ? 'alert' : 'status'}
                            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                            aria-atomic="true"
                            className={styles.toast}
                            style={{ '--toast-bg': s.bg, '--toast-border': s.border, '--toast-glow': s.glow }}
                        >
                            <span className={styles.status} aria-hidden="true">{s.label}</span>
                            <span className={styles.message}>
                                {toast.message}
                            </span>
                            <button
                                type="button"
                                onClick={() => removeToast(toast.id)}
                                aria-label="Dismiss Store Message"
                                className={styles.dismiss}
                            >
                                Dismiss
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
