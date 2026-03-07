import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Club Arena Global State
 * Manages UI state for Club Arena — play money home games
 *
 * Persists: disclaimerAccepted (UX — so user doesn't see disclaimer every visit)
 * Does NOT persist: clubs, activeClub, loading, modals (live/ephemeral data)
 */
export const useClubArenaStore = create(
  persist(
    (set) => ({
      // User's clubs
      clubs: [],
      activeClub: null,
      isLoadingClubs: true,

      // Disclaimer
      disclaimerAccepted: false,

      // Modals
      showCreateClub: false,
      showJoinClub: false,
      showFindPlayer: false,

      // Actions
      setClubs: (clubs) => set({ clubs, isLoadingClubs: false }),
      setActiveClub: (club) => set({ activeClub: club }),
      setDisclaimerAccepted: (accepted) => set({ disclaimerAccepted: accepted }),
      setShowCreateClub: (show) => set({ showCreateClub: show }),
      setShowJoinClub: (show) => set({ showJoinClub: show }),
      setShowFindPlayer: (show) => set({ showFindPlayer: show }),
    }),
    {
      name: 'sp-club-arena-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        disclaimerAccepted: state.disclaimerAccepted,
      }),
    }
  )
);
