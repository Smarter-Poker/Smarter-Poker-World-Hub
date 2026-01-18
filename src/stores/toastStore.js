/**
 * 🎨 TOAST NOTIFICATION SYSTEM
 * Global toast notifications with animations
 */

import { create } from 'zustand';

export const useToastStore = create((set) => ({
    toasts: [],

    addToast: (toast) => {
        const id = Date.now();
        set((state) => ({
            toasts: [...state.toasts, { ...toast, id }],
        }));

        // Auto-remove after duration
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== id),
            }));
        }, toast.duration || 3000);

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
};

export default toast;
