import { create } from 'zustand';

/**
 * Messenger Global State
 * Manages UI state for chat interface
 *
 * NO persistence — selectedConversation is live data (conversation objects),
 * and modal states should always start closed. Nothing safe to persist here.
 */
export const useMessengerStore = create((set) => ({
    // UI State
    selectedConversation: null,
    showNewChat: false,
    showSearch: false,

    // Actions
    setSelectedConversation: (conversation) => set({ selectedConversation: conversation }),
    setShowNewChat: (show) => set({ showNewChat: show }),
    setShowSearch: (show) => set({ showSearch: show }),
    toggleNewChat: () => set((state) => ({ showNewChat: !state.showNewChat })),
    toggleSearch: () => set((state) => ({ showSearch: !state.showSearch })),
}));
