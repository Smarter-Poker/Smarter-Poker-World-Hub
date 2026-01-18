import { create } from 'zustand';

/**
 * User Profile Page Global State
 * Manages UI state for public user profile pages
 */
export const useUserProfileStore = create((set) => ({
    // UI State
    showPokerResume: true,
    showSocialLinks: true,

    // Actions
    setShowPokerResume: (show) => set({ showPokerResume: show }),
    setShowSocialLinks: (show) => set({ showSocialLinks: show }),
}));
