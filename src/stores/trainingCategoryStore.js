import { create } from 'zustand';

/**
 * Training Category Page Global State
 * Manages UI state for training category pages
 */
export const useTrainingCategoryStore = create((set) => ({
    // UI State
    showIntro: false,
    pendingGame: null,

    // Actions
    setShowIntro: (show) => set({ showIntro: show }),
    setPendingGame: (game) => set({ pendingGame: game }),
}));
