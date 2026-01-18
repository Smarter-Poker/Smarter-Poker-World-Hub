import { create } from 'zustand';

/**
 * Article Global State
 * Manages UI state for article reading page
 */
export const useArticleStore = create((set) => ({
    // UI State
    showShareMenu: false,
    isBookmarked: false,
    fontSize: 'normal', // 'small', 'normal', 'large'

    // Actions
    setShowShareMenu: (show) => set({ showShareMenu: show }),
    setIsBookmarked: (bookmarked) => set({ isBookmarked: bookmarked }),
    setFontSize: (size) => set({ fontSize: size }),
    toggleShareMenu: () => set((state) => ({ showShareMenu: !state.showShareMenu })),
    toggleBookmark: () => set((state) => ({ isBookmarked: !state.isBookmarked })),
}));
