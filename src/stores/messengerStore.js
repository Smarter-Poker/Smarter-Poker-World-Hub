import { create } from 'zustand';

const CACHE_KEY = 'sp-messenger-cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Messenger Global State
 * Manages UI state + conversation cache for instant load
 *
 * Conversations are persisted to localStorage for instant render on re-entry.
 * Fresh data is fetched in the background and merged silently.
 */

function loadCachedConversations() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return [];
        const { conversations, timestamp } = JSON.parse(raw);
        // Return cache even if stale — page will refresh in background
        if (Array.isArray(conversations) && conversations.length > 0) {
            return conversations;
        }
    } catch (_) {}
    return [];
}

function persistConversations(conversations) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            conversations,
            timestamp: Date.now(),
        }));
    } catch (_) {}
}

function isCacheFresh() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return false;
        const { timestamp } = JSON.parse(raw);
        return Date.now() - timestamp < CACHE_TTL;
    } catch (_) {}
    return false;
}

export const useMessengerStore = create((set, get) => ({
    // UI State
    selectedConversation: null,
    showNewChat: false,
    showSearch: false,

    // Conversation Cache
    conversations: loadCachedConversations(),
    isCacheFresh: isCacheFresh(),

    // Actions
    setSelectedConversation: (conversation) => set({ selectedConversation: conversation }),
    setShowNewChat: (show) => set({ showNewChat: show }),
    setShowSearch: (show) => set({ showSearch: show }),
    toggleNewChat: () => set((state) => ({ showNewChat: !state.showNewChat })),
    toggleSearch: () => set((state) => ({ showSearch: !state.showSearch })),

    // Cache Actions
    setConversations: (conversations) => {
        persistConversations(conversations);
        set({ conversations, isCacheFresh: true });
    },
    getCachedConversations: () => get().conversations,
    hasCachedConversations: () => get().conversations.length > 0,
}));
