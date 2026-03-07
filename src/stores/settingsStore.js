import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getStorage } from '../lib/storage';

/**
 * Settings Global State
 * Manages UI state for settings page
 *
 * Persists: selectedSection (UX — remember which settings section user was viewing)
 * Does NOT persist: showConfirmation (modal state — always starts closed)
 */
export const useSettingsStore = create(
  persist(
    (set) => ({
      // UI State
      selectedSection: 'account', // 'account', 'privacy', 'notifications', 'appearance'
      showConfirmation: false,

      // Actions
      setSelectedSection: (section) => set({ selectedSection: section }),
      setShowConfirmation: (show) => set({ showConfirmation: show }),
    }),
    {
      name: 'sp-settings-prefs',
      storage: getStorage(),
      partialize: (state) => ({
        selectedSection: state.selectedSection,
      }),
    }
  )
);
