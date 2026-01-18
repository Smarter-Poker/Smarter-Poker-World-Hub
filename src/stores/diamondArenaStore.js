import { create } from 'zustand';

/**
 * Diamond Arena Global State
 * Manages UI state for diamond arena iframe wrapper
 */
export const useDiamondArenaStore = create((set) => ({
    // UI State
    iframeLoaded: false,
    showRules: false,

    // Actions
    setIframeLoaded: (loaded) => set({ iframeLoaded: loaded }),
    setShowRules: (show) => set({ showRules: show }),
    toggleRules: () => set((state) => ({ showRules: !state.showRules })),
}));
