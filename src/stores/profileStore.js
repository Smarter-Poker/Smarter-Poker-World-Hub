import { create } from 'zustand';

/**
 * Profile Global State
 * Manages UI state for modals and media library
 */
export const useProfileStore = create((set) => ({
    // UI State
    libraryOpen: false,
    saving: false,
    isRefreshing: false,

    // Actions
    setLibraryOpen: (open) => set({ libraryOpen: open }),
    setSaving: (saving) => set({ saving: saving }),
    setIsRefreshing: (refreshing) => set({ isRefreshing: refreshing }),
    toggleLibrary: () => set((state) => ({ libraryOpen: !state.libraryOpen })),
}));
