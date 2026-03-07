import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Notifications Global State
 * Manages UI state for notifications page
 *
 * Persists: selectedFilter (UX — remember which notification filter was active)
 * Does NOT persist: showSettings (modal state — always starts closed)
 */
export const useNotificationsStore = create(
  persist(
    (set) => ({
      // UI State
      selectedFilter: 'all', // 'all', 'unread', 'mentions'
      showSettings: false,

      // Actions
      setSelectedFilter: (filter) => set({ selectedFilter: filter }),
      setShowSettings: (show) => set({ showSettings: show }),
      toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
    }),
    {
      name: 'sp-notifications-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        selectedFilter: state.selectedFilter,
      }),
    }
  )
);
