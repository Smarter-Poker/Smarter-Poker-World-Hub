import { create } from 'zustand';

/**
 * Notifications Global State
 * Manages UI state for notifications page
 */
export const useNotificationsStore = create((set) => ({
    // UI State
    selectedFilter: 'all', // 'all', 'unread', 'mentions'
    showSettings: false,

    // Actions
    setSelectedFilter: (filter) => set({ selectedFilter: filter }),
    setShowSettings: (show) => set({ showSettings: show }),
    toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
}));
