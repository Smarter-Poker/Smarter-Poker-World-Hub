import { create } from 'zustand';

/**
 * Avatars Global State
 * Manages UI state for avatar selection
 */
export const useAvatarsStore = create((set) => ({
    // UI State
    showCustomGenerator: false,
    selectedTab: 'all', // 'all', 'preset', 'custom'

    // Actions
    setShowCustomGenerator: (show) => set({ showCustomGenerator: show }),
    setSelectedTab: (tab) => set({ selectedTab: tab }),
    toggleCustomGenerator: () => set((state) => ({ showCustomGenerator: !state.showCustomGenerator })),
}));
