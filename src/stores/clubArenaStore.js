import { create } from 'zustand';

/**
 * Club Arena Global State
 * Manages UI state for club arena iframe wrapper
 */
export const useClubArenaStore = create((set) => ({
    // UI State
    iframeLoaded: false,
    showHelp: false,

    // Actions
    setIframeLoaded: (loaded) => set({ iframeLoaded: loaded }),
    setShowHelp: (show) => set({ showHelp: show }),
    toggleHelp: () => set((state) => ({ showHelp: !state.showHelp })),
}));
