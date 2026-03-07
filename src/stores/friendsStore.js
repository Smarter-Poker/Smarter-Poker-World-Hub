import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Friends Global State
 * Manages UI state for friends list and search
 *
 * Persists: selectedTab (UX — remember which tab user was on)
 * Does NOT persist: showAddFriend (modal state — always starts closed)
 */
export const useFriendsStore = create(
  persist(
    (set) => ({
      // UI State
      selectedTab: 'all', // 'all', 'online', 'requests'
      showAddFriend: false,

      // Actions
      setSelectedTab: (tab) => set({ selectedTab: tab }),
      setShowAddFriend: (show) => set({ showAddFriend: show }),
      toggleAddFriend: () => set((state) => ({ showAddFriend: !state.showAddFriend })),
    }),
    {
      name: 'sp-friends-prefs',
      partialize: (state) => ({
        selectedTab: state.selectedTab,
      }),
    }
  )
);
