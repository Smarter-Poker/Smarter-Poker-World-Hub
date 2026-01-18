import { create } from 'zustand';

/**
 * Reels Global State
 * Manages UI state for reels/stories page
 */
export const useReelsStore = create((set) => ({
    // UI State
    currentReelIndex: 0,
    isPlaying: false,
    showComments: false,

    // Actions
    setCurrentReelIndex: (index) => set({ currentReelIndex: index }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setShowComments: (show) => set({ showComments: show }),
    toggleComments: () => set((state) => ({ showComments: !state.showComments })),
}));
