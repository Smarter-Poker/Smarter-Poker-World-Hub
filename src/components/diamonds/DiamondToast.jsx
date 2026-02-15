/**
 * 💎 DIAMOND TOAST — 3-second auto-dismiss popup
 * ═══════════════════════════════════════════════════════════════════════════
 * Shows when user earns diamonds with reason + amount.
 * Uses custom DOM events so any module can trigger it without React context.
 *
 * Usage: window.dispatchEvent(new CustomEvent('diamond-earned', {
 *   detail: { diamonds: 10, reason: 'Post Reward' }
 * }));
 *
 * Or use the helper: import { showDiamondToast } from './DiamondToast';
 *                     showDiamondToast(10, 'Post Reward');
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';

// ── Helper function (usable from any module) ──
export function showDiamondToast(diamonds, reason) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('diamond-earned', {
            detail: { diamonds, reason }
        }));
    }
}

// ── React component (mounted once in _app.js) ──
export default function DiamondToast() {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((diamonds, reason) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, diamonds, reason }]);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            const { diamonds, reason } = e.detail || {};
            if (diamonds && diamonds > 0) {
                addToast(diamonds, reason || 'Reward');
            }
        };

        window.addEventListener('diamond-earned', handler);
        return () => window.removeEventListener('diamond-earned', handler);
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <div style={styles.container}>
            {toasts.map(toast => (
                <div key={toast.id} style={styles.toast}>
                    <div style={styles.icon}>💎</div>
                    <div style={styles.content}>
                        <div style={styles.amount}>+{toast.diamonds} Diamonds</div>
                        <div style={styles.reason}>{toast.reason}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

const styles = {
    container: {
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
    },
    toast: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 20px',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9) 0%, rgba(30, 30, 60, 0.95) 100%)',
        border: '1px solid rgba(0, 200, 255, 0.4)',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0, 200, 255, 0.3), 0 0 40px rgba(0, 200, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        animation: 'diamondToastSlideIn 0.3s ease-out, diamondToastFadeOut 0.5s ease-in 2.5s forwards',
        minWidth: '220px',
        maxWidth: '320px',
    },
    icon: {
        fontSize: '28px',
        animation: 'diamondToastPulse 0.6s ease-in-out',
    },
    content: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    amount: {
        fontSize: '16px',
        fontWeight: '700',
        color: '#00d4ff',
        textShadow: '0 0 8px rgba(0, 200, 255, 0.5)',
        letterSpacing: '0.5px',
    },
    reason: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: '400',
    },
};

// Inject keyframes once
if (typeof window !== 'undefined' && !document.getElementById('diamond-toast-keyframes')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'diamond-toast-keyframes';
    styleEl.textContent = `
        @keyframes diamondToastSlideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes diamondToastFadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes diamondToastPulse {
            0% { transform: scale(0.5); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }
    `;
    document.head.appendChild(styleEl);
}
