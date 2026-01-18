import { create } from 'zustand';

/**
 * Settings Global State
 * Manages UI state for settings page
 */
export const useSettingsStore = create((set) => ({
    // UI State
    selectedSection: 'account', // 'account', 'privacy', 'notifications', 'appearance'
    showConfirmation: false,

    // Actions
    setSelectedSection: (section) => set({ selectedSection: section }),
    setShowConfirmation: (show) => set({ showConfirmation: show }),
}));
