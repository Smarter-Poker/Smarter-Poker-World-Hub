/**
 * ═══════════════════════════════════════════════════════════
 * TOAST NOTIFICATION SYSTEM — Club Arena
 * ═══════════════════════════════════════════════════════════
 * Lightweight cross-page toast/snackbar driven by EventBus.
 * Auto-dismisses. GPU-accelerated slide-in via transform.
 *
 * Usage:
 *   import { ToastProvider, useToast } from './ToastProvider';
 *
 *   // Wrap your page:
 *   <ToastProvider><YourPage /></ToastProvider>
 *
 *   // Fire anywhere:
 *   const toast = useToast();
 *   toast.success('Cashout approved!');
 *   toast.error('Transfer failed');
 *   toast.info('Tournament starting in 5 min');
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Z_INDEX } from '../../lib/zIndexAuthority';

// ── Keyframe injection ──
let _toastKf = false;
function ensureToastKf() {
    if (_toastKf || typeof document === 'undefined') return;
    _toastKf = true;
    const s = document.createElement('style');
    s.textContent = `
    @keyframes caToastIn { from { transform: translateY(-100%) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
    @keyframes caToastOut { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(-100%) scale(0.95); opacity: 0; } }
  `;
    document.head.appendChild(s);
}

const TOAST_COLORS = {
    success: { bg: 'rgba(34, 197, 94, 0.95)', icon: '✅', border: '#22c55e' },
    error: { bg: 'rgba(239, 68, 68, 0.95)', icon: '❌', border: '#ef4444' },
    info: { bg: 'rgba(59, 130, 246, 0.95)', icon: 'ℹ️', border: '#3b82f6' },
    warning: { bg: 'rgba(245, 158, 11, 0.95)', icon: '⚠️', border: '#f59e0b' },
};

const ToastContext = createContext(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Graceful fallback if used outside provider
        return {
            success: () => { },
            error: () => { },
            info: () => { },
            warning: () => { },
        };
    }
    return ctx;
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    useEffect(() => { ensureToastKf(); }, []);

    const addToast = useCallback((type, message, durationMs = 3500) => {
        const id = ++idRef.current;
        setToasts(prev => [...prev.slice(-3), { id, type, message, exiting: false }]); // max 4 visible
        setTimeout(() => {
            setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 300);
        }, durationMs);
    }, []);

    const api = {
        success: (msg, dur) => addToast('success', msg, dur),
        error: (msg, dur) => addToast('error', msg, dur),
        info: (msg, dur) => addToast('info', msg, dur),
        warning: (msg, dur) => addToast('warning', msg, dur),
    };

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Toast container — fixed top center */}
            {toasts.length > 0 && (
                <div style={{
                    position: 'fixed',
                    top: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: Z_INDEX.TOAST || 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    width: '90%',
                    maxWidth: 400,
                    pointerEvents: 'none',
                }}>
                    {toasts.map(t => {
                        const scheme = TOAST_COLORS[t.type] || TOAST_COLORS.info;
                        return (
                            <div
                                key={t.id}
                                style={{
                                    background: scheme.bg,
                                    backdropFilter: 'blur(16px)',
                                    border: `1px solid ${scheme.border}`,
                                    borderRadius: 12,
                                    padding: '12px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    fontFamily: 'Inter, -apple-system, sans-serif',
                                    boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 12px ${scheme.border}40`,
                                    animation: t.exiting
                                        ? 'caToastOut 0.3s ease-in forwards'
                                        : 'caToastIn 0.3s ease-out',
                                    willChange: 'transform, opacity',
                                    pointerEvents: 'auto',
                                }}
                            >
                                <span style={{ fontSize: 18, flexShrink: 0 }}>{scheme.icon}</span>
                                <span style={{ flex: 1, lineHeight: 1.3 }}>{t.message}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </ToastContext.Provider>
    );
}

export default ToastProvider;
