import { create } from 'zustand';

/**
 * Avatars Standalone Page Global State
 * Manages UI state for standalone avatar selection page
 */
export const useAvatarsStandaloneStore = create((set) => ({
    // UI State
    selectedAvatar: null,

    // Actions
    setSelectedAvatar: (avatar) => set({ selectedAvatar: avatar }),
}));
