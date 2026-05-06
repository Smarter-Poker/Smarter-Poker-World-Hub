/**
 * 🎨 TOAST NOTIFICATION SYSTEM
 * Global toast notifications with animations
 */

import { create } from 'zustand';

/**
 * 🔊 Play a short rising two-note chime (A5 → E6) via Web Audio API.
 * Used as the universal success-feedback sound across the platform.
 * Fails silently — audio is a nice-to-have, never blocks UI.
 */
function _playSuccessChime() {
    try {
        if (typeof window === 'undefined') return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ac = new AC();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g);
        g.connect(ac.destination);
        o.type = 'sine';
        // Rising fifth: A5 (880 Hz) → E6 (1320 Hz)
        o.frequency.setValueAtTime(880, ac.currentTime);
        o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.12);
        g.gain.setValueAtTime(0.0001, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
        o.start();
        o.stop(ac.currentTime + 0.2);
        setTimeout(() => { try { ac.close(); } catch (_) {} }, 400);
    } catch (_) { /* never let audio break the app */ }
}

export const useToastStore = create((set) => ({
    toasts: [],

    addToast: (toast) => {
        const id = Date.now() + Math.random();
        set((state) => ({
            toasts: [...state.toasts, { ...toast, id }],
        }));

        // 🔊 Play success chime for every success-type toast
        if (toast.type === 'success') {
            _playSuccessChime();
        }

        // Persistent toasts stay until manually dismissed
        if (!toast.persistent) {
            setTimeout(() => {
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                }));
            }, toast.duration || 3000);
        }

        return id;
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    clearToasts: () => set({ toasts: [] }),
}));

// Convenience functions
export const toast = {
    success: (message, duration) => useToastStore.getState().addToast({
        type: 'success',
        message,
        duration,
    }),

    error: (message, duration) => useToastStore.getState().addToast({
        type: 'error',
        message,
        duration,
    }),

    info: (message, duration) => useToastStore.getState().addToast({
        type: 'info',
        message,
        duration,
    }),

    warning: (message, duration) => useToastStore.getState().addToast({
        type: 'warning',
        message,
        duration,
    }),

    /**
     * Persistent clickable action toast — stays until user clicks or dismisses.
     * @param {string} message
     * @param {Function} onClick - Called when toast body is clicked (use for navigation)
     * @param {'success'|'info'|'warning'|'error'} [type='success']
     * @param {number} [duration] - Auto-dismiss after ms (omit for persistent)
     * @returns {number} toast id
     */
    action: (message, onClick, type = 'success', duration) =>
        useToastStore.getState().addToast({
            type,
            message,
            onClick,
            persistent: !duration,
            duration,
        }),
};

export default toast;
