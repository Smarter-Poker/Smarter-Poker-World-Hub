import { create } from 'zustand';

/**
 * Avatars Complete Page Global State
 * Manages UI state for complete avatar selection page
 */
export const useAvatarsCompleteStore = create((set) => ({
    // UI State
    showBuilder: false,
    selectedAvatar: null,
    loading: true,

    // Actions
    setShowBuilder: (show) => set({ showBuilder: show }),
    setSelectedAvatar: (avatar) => set({ selectedAvatar: avatar }),
    setLoading: (loading) => set({ loading }),
}));
