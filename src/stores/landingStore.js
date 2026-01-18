import { create } from 'zustand';

/**
 * Landing Page Global State
 * Manages UI state, user interactions, and analytics for the marketing landing page
 */
export const useLandingStore = create((set) => ({
    // UI State
    isLoading: false,
    glowIntensity: 0,
    activeFeature: null,

    // User Interaction Tracking
    ctaClicks: 0,
    featureHovers: {},
    soundsEnabled: true,

    // Actions
    setLoading: (loading) => set({ isLoading: loading }),
    setGlowIntensity: (intensity) => set({ glowIntensity: intensity }),
    setActiveFeature: (feature) => set({ activeFeature: feature }),
    incrementCtaClicks: () => set((state) => ({ ctaClicks: state.ctaClicks + 1 })),
    trackFeatureHover: (featureName) => set((state) => ({
        featureHovers: {
            ...state.featureHovers,
            [featureName]: (state.featureHovers[featureName] || 0) + 1
        }
    })),
    toggleSounds: () => set((state) => ({ soundsEnabled: !state.soundsEnabled })),
}));
