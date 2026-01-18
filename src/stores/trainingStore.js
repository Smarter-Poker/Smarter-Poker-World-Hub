import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Training Hub Global State
 * Manages UI state, user preferences, and training session data
 */
export const useTrainingStore = create(
    persist(
        (set) => ({
            // UI State
            activeFilter: 'ALL',
            showIntro: false,
            pendingGame: null,

            // User Preferences (persisted)
            soundsEnabled: true,
            animationsEnabled: true,

            // Celebration Tracking (prevent duplicate confetti)
            celebratedGames: {},

            // Actions
            setActiveFilter: (filter) => set({ activeFilter: filter }),
            setShowIntro: (show) => set({ showIntro: show }),
            setPendingGame: (game) => set({ pendingGame: game }),
            toggleSounds: () => set((state) => ({ soundsEnabled: !state.soundsEnabled })),
            toggleAnimations: () => set((state) => ({ animationsEnabled: !state.animationsEnabled })),

            // Mark game as celebrated (prevent duplicate confetti)
            markGameCelebrated: (gameId) => set((state) => ({
                celebratedGames: { ...state.celebratedGames, [gameId]: true }
            })),

            // Check if game has been celebrated
            hasBeenCelebrated: (gameId) => {
                const state = useTrainingStore.getState();
                return state.celebratedGames[gameId] || false;
            },
        }),
        {
            name: 'training-preferences',
            partialize: (state) => ({
                soundsEnabled: state.soundsEnabled,
                animationsEnabled: state.animationsEnabled,
                celebratedGames: state.celebratedGames,
            }),
        }
    )
);
