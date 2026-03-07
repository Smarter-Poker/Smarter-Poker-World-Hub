import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Reels Global State
 * Manages UI state for reels/stories page
 *
 * Persists: currentReelIndex (UX — resume where user left off)
 * Does NOT persist: isPlaying, showComments (ephemeral playback/modal state)
 */
export const useReelsStore = create(
  persist(
    (set) => ({
      // UI State
      currentReelIndex: 0,
      isPlaying: false,
      showComments: false,

      // Actions
      setCurrentReelIndex: (index) => set({ currentReelIndex: index }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setShowComments: (show) => set({ showComments: show }),
      toggleComments: () => set((state) => ({ showComments: !state.showComments })),
    }),
    {
      name: 'sp-reels-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        currentReelIndex: state.currentReelIndex,
      }),
    }
  )
);
