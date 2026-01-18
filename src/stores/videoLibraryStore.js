import { create } from 'zustand';

/**
 * Video Library Global State
 * Manages UI state for video player and filters
 */
export const useVideoLibraryStore = create((set) => ({
    // UI State
    selectedCategory: 'all',
    selectedVideo: null,
    showPlayer: false,

    // Actions
    setSelectedCategory: (category) => set({ selectedCategory: category }),
    setSelectedVideo: (video) => set({ selectedVideo: video }),
    setShowPlayer: (show) => set({ showPlayer: show }),
    playVideo: (video) => set({ selectedVideo: video, showPlayer: true }),
    closePlayer: () => set({ showPlayer: false, selectedVideo: null }),
}));
