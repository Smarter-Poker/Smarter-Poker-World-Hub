/**
 * 🎨 TOAST NOTIFICATION SYSTEM
 * Global toast notifications with animations
 */

import { create } from 'zustand';

export const useToastStore = create((set) => ({
    toasts: [],

    addToast: (toast) => {
        const id = Date.now() + Math.random();
        set((state) => ({
            toasts: [...state.toasts, { ...toast, id }],
        }));

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
