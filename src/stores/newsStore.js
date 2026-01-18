import { create } from 'zustand';

/**
 * News Global State
 * Manages UI state for news hub
 */
export const useNewsStore = create((set) => ({
    // UI State
    activeTab: 'all', // 'all', 'tournament', 'strategy', 'industry'
    searchQuery: '',
    showNewsletter: true,

    // Actions
    setActiveTab: (tab) => set({ activeTab: tab }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setShowNewsletter: (show) => set({ showNewsletter: show }),
}));
