import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Training Hub Global State
 * Manages UI state, user preferences, and training session data
 *
 * Phase 105 fix (2026-05-07):
 *   The /hub/training redesign (PR #239) reads `showArena` / `activeGame` /
 *   `setShowArena` / `setActiveGame` from this store. Those fields/setters
 *   did not exist, so every game-card click threw "setActiveGame is not a
 *   function" — visible to the user as "nothing happens when I click a game."
 *   Added the 4 fields as the canonical names. The legacy `showIntro` /
 *   `pendingGame` pair is kept as a non-breaking alias for older callers
 *   (only `pages/hub/training/category/[categoryId].js` uses local React
 *   useState with these names — not the store — so nothing else needs
 *   to be touched, but the alias keeps the store self-consistent).
 */
export const useTrainingStore = create(
    persist(
        (set) => ({
            // UI State
            activeFilter: 'ALL',

            // Arena launch state (canonical — read by /hub/training)
            showArena: false,
            activeGame: null,

            // Legacy alias names (kept for safety; mirror the canonical pair)
            showIntro: false,
            pendingGame: null,

            // User Preferences (persisted)
            soundsEnabled: true,
            animationsEnabled: true,

            // Celebration Tracking (prevent duplicate confetti)
            celebratedGames: {},

            // Actions
            setActiveFilter: (filter) => set({ activeFilter: filter }),

            // Canonical setters (used by /hub/training redesign — PR #239)
            setShowArena: (show) => set({ showArena: !!show, showIntro: !!show }),
            setActiveGame: (game) => set({ activeGame: game, pendingGame: game }),

            // Legacy alias setters — keep both pairs in sync so any old caller
            // continues to work and the store never ends up half-updated.
            setShowIntro: (show) => set({ showIntro: !!show, showArena: !!show }),
            setPendingGame: (game) => set({ pendingGame: game, activeGame: game }),

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
            storage: getStorage(),
            partialize: (state) => ({
                soundsEnabled: state.soundsEnabled,
                animationsEnabled: state.animationsEnabled,
                celebratedGames: state.celebratedGames,
                // NOTE: showArena/activeGame deliberately NOT persisted —
                // a fresh session must NOT auto-mount the arena from a stale
                // game id, otherwise users land on /hub/training and instantly
                // get pulled into yesterday's game.
            }),
        }
    )
);
