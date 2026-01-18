import { create } from 'zustand';

/**
 * Friends Global State
 * Manages UI state for friends list and search
 */
export const useFriendsStore = create((set) => ({
    // UI State
    selectedTab: 'all', // 'all', 'online', 'requests'
    showAddFriend: false,

    // Actions
    setSelectedTab: (tab) => set({ selectedTab: tab }),
    setShowAddFriend: (show) => set({ showAddFriend: show }),
    toggleAddFriend: () => set((state) => ({ showAddFriend: !state.showAddFriend })),
}));
