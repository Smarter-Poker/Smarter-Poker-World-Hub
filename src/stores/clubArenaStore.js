import { create } from 'zustand';

/**
 * Club Arena Global State
 * Manages UI state for Club Arena — play money home games
 */
export const useClubArenaStore = create((set) => ({
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
}));
