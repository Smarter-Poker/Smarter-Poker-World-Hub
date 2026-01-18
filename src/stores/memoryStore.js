import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Memory Games Global State
 * Manages game state, level selection, and user preferences
 */
export const useMemoryStore = create(
    persist(
        (set) => ({
            // UI State
            currentLevel: 1,
            currentView: 'menu', // menu | playing | results
            currentMiniGame: null, // 'speed' | 'pressure' | 'pattern' | null

            // User Preferences (persisted)
            soundsEnabled: true,
            showHints: true,

            // Actions
            setCurrentLevel: (level) => set({ currentLevel: level }),
            setCurrentView: (view) => set({ currentView: view }),
            setCurrentMiniGame: (game) => set({ currentMiniGame: game }),
            toggleSounds: () => set((state) => ({ soundsEnabled: !state.soundsEnabled })),
            toggleHints: () => set((state) => ({ showHints: !state.showHints })),
        }),
        {
            name: 'memory-preferences',
            partialize: (state) => ({
                soundsEnabled: state.soundsEnabled,
                showHints: state.showHints,
            }),
        }
    )
);
