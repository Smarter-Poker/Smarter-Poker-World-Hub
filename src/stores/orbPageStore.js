import { create } from 'zustand';

/**
 * Orb Page Global State
 * Manages UI state for dynamic orb pages
 */
export const useOrbPageStore = create((set) => ({
    // UI State
    showFeatures: true,
    selectedFeature: null,

    // Actions
    setShowFeatures: (show) => set({ showFeatures: show }),
    setSelectedFeature: (feature) => set({ selectedFeature: feature }),
}));
