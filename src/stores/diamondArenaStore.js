import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Diamond Arena Global State
 * Manages UI state for diamond arena iframe wrapper
 *
 * Persists: showRules (UX — remember if user dismissed rules panel)
 * Does NOT persist: iframeLoaded (ephemeral load state)
 */
export const useDiamondArenaStore = create(
  persist(
    (set) => ({
      // UI State
      iframeLoaded: false,
      showRules: false,

      // Actions
      setIframeLoaded: (loaded) => set({ iframeLoaded: loaded }),
      setShowRules: (show) => set({ showRules: show }),
      toggleRules: () => set((state) => ({ showRules: !state.showRules })),
    }),
    {
      name: 'sp-diamond-arena-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        showRules: state.showRules,
      }),
    }
  )
);
