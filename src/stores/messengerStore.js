import { create } from 'zustand';

/**
 * Messenger Global State
 * Manages UI state for chat interface
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
