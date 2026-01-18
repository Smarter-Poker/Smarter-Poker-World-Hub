/**
 * 📊 PERFORMANCE MONITORING SYSTEM
 * Track page load times, animations, and user interactions
 */

import { create } from 'zustand';

export const usePerformanceStore = create((set, get) => ({
    metrics: {
        pageLoads: [],
        interactions: [],
        animations: [],
    },

    // Track page load
    trackPageLoad: (pageName, loadTime) => {
        set((state) => ({
            metrics: {
                ...state.metrics,
                pageLoads: [
                    ...state.metrics.pageLoads,
                    {
                        page: pageName,
                        loadTime,
                        timestamp: Date.now(),
                    },
                ].slice(-100), // Keep last 100
            },
        }));
    },

    // Track user interaction
    trackInteraction: (type, element, duration) => {
        set((state) => ({
            metrics: {
                ...state.metrics,
                interactions: [
                    ...state.metrics.interactions,
                    {
                        type,
                        element,
                        duration,
                        timestamp: Date.now(),
                    },
                ].slice(-100),
            },
        }));
    },

    // Track animation performance
    trackAnimation: (name, duration, fps) => {
        set((state) => ({
            metrics: {
                ...state.metrics,
                animations: [
                    ...state.metrics.animations,
                    {
                        name,
                        duration,
                        fps,
                        timestamp: Date.now(),
                    },
                ].slice(-100),
            },
        }));
    },

    // Get average page load time
    getAveragePageLoad: () => {
        const { pageLoads } = get().metrics;
        if (pageLoads.length === 0) return 0;
        const sum = pageLoads.reduce((acc, load) => acc + load.loadTime, 0);
        return sum / pageLoads.length;
    },

    // Get metrics summary
    getSummary: () => {
        const { pageLoads, interactions, animations } = get().metrics;
        return {
            totalPageLoads: pageLoads.length,
            averagePageLoad: get().getAveragePageLoad(),
            totalInteractions: interactions.length,
            totalAnimations: animations.length,
            averageAnimationFPS: animations.length > 0
                ? animations.reduce((acc, anim) => acc + anim.fps, 0) / animations.length
                : 0,
        };
    },

    // Clear metrics
    clearMetrics: () => {
        set({
            metrics: {
                pageLoads: [],
                interactions: [],
                animations: [],
            },
        });
    },
}));

// Performance tracking hook
export function usePageLoadTracking(pageName) {
    const trackPageLoad = usePerformanceStore((s) => s.trackPageLoad);

    if (typeof window !== 'undefined') {
        const startTime = performance.now();

        window.addEventListener('load', () => {
            const loadTime = performance.now() - startTime;
            trackPageLoad(pageName, loadTime);
        }, { once: true });
    }
}

export default usePerformanceStore;
