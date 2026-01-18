import { create } from 'zustand';

/**
 * Social Media Global State
 * Manages UI state for sidebar, modals, and search
 */
export const useSocialStore = create((set) => ({
    // UI State
    sidebarOpen: false,
    showNotifications: false,
    showGlobalSearch: false,
    showGoLiveModal: false,

    // Actions
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setShowNotifications: (show) => set({ showNotifications: show }),
    setShowGlobalSearch: (show) => set({ showGlobalSearch: show }),
    setShowGoLiveModal: (show) => set({ showGoLiveModal: show }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    toggleNotifications: () => set((state) => ({ showNotifications: !state.showNotifications })),
    toggleGlobalSearch: () => set((state) => ({ showGlobalSearch: !state.showGlobalSearch })),
}));
