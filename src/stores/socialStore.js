import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Social Media Global State
 * Manages UI state for sidebar, modals, and search
 *
 * Persists: sidebarOpen (UX — remember sidebar expand/collapse preference)
 * Does NOT persist: modal states (always start closed)
 */
export const useSocialStore = create(
  persist(
    (set) => ({
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
    }),
    {
      name: 'sp-social-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
