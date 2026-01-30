/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSATION MEMORY HOOK — Persist Jarvis conversation history
   Allows Jarvis to remember past conversations and provide contextual advice
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    context?: string;  // e.g., 'hand-analysis', 'strategy', 'general'
}

interface ConversationSession {
    id: string;
    title: string;
    messages: ConversationMessage[];
    createdAt: Date;
    updatedAt: Date;
}

const MAX_HISTORY_MESSAGES = 50;  // Keep last N messages for context
const LOCAL_STORAGE_KEY = 'jarvis_conversation_memory';

export function useConversationMemory() {
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [currentSession, setCurrentSession] = useState<ConversationSession | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Load sessions on mount
    useEffect(() => {
        async function loadSessions() {
            try {
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    // Load from localStorage for unauthenticated users
                    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
                    if (saved) {
                        try {
                            const parsed = JSON.parse(saved);
                            setSessions(parsed.sessions?.map((s: any) => ({
                                ...s,
                                createdAt: new Date(s.createdAt),
                                updatedAt: new Date(s.updatedAt),
                                messages: s.messages.map((m: any) => ({
                                    ...m,
                                    timestamp: new Date(m.timestamp)
                                }))
                            })) || []);

                            if (parsed.currentSessionId) {
                                const current = parsed.sessions?.find((s: any) => s.id === parsed.currentSessionId);
                                if (current) {
                                    setCurrentSession({
                                        ...current,
                                        createdAt: new Date(current.createdAt),
                                        updatedAt: new Date(current.updatedAt),
                                        messages: current.messages.map((m: any) => ({
                                            ...m,
                                            timestamp: new Date(m.timestamp)
                                        }))
                                    });
                                }
                            }
                        } catch (e) {
                            console.error('Failed to parse local storage:', e);
                        }
                    }
                    setLoading(false);
                    return;
                }

                setUserId(user.id);

                // Load from Supabase
                const { data, error } = await supabase
                    .from('jarvis_conversations')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false })
                    .limit(20);

                if (error) {
                    console.error('Error loading conversations:', error);
                } else if (data) {
                    const loaded: ConversationSession[] = data.map(row => ({
                        id: row.id,
                        title: row.title || 'Conversation',
                        messages: (row.messages || []).map((m: any) => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        })),
                        createdAt: new Date(row.created_at),
                        updatedAt: new Date(row.updated_at)
                    }));
                    setSessions(loaded);

                    // Set most recent as current
                    if (loaded.length > 0) {
                        setCurrentSession(loaded[0]);
                    }
                }
            } catch (err) {
                console.error('Failed to load sessions:', err);
            } finally {
                setLoading(false);
            }
        }

        loadSessions();
    }, []);

    // Save to storage
    const saveToStorage = useCallback(async (session: ConversationSession) => {
        if (!userId) {
            // Save to localStorage
            const toSave = {
                sessions: sessions.map(s => s.id === session.id ? session : s),
                currentSessionId: session.id
            };
            if (!toSave.sessions.find(s => s.id === session.id)) {
                toSave.sessions.unshift(session);
            }
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
            return;
        }

        try {
            await supabase.from('jarvis_conversations').upsert({
                id: session.id,
                user_id: userId,
                title: session.title,
                messages: session.messages.slice(-MAX_HISTORY_MESSAGES),
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        } catch (err) {
            console.error('Failed to save conversation:', err);
        }
    }, [userId, sessions]);

    // Start new session
    const startNewSession = useCallback((title?: string) => {
        const newSession: ConversationSession = {
            id: `session_${Date.now()}`,
            title: title || `Session ${sessions.length + 1}`,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSession(newSession);
        return newSession;
    }, [sessions.length]);

    // Add message to current session
    const addMessage = useCallback(async (
        role: 'user' | 'assistant',
        content: string,
        context?: string
    ) => {
        let session = currentSession;

        // Create new session if none exists
        if (!session) {
            session = startNewSession(content.slice(0, 50) + '...');
        }

        const message: ConversationMessage = {
            id: `msg_${Date.now()}`,
            role,
            content,
            timestamp: new Date(),
            context
        };

        const updatedSession: ConversationSession = {
            ...session,
            messages: [...session.messages, message].slice(-MAX_HISTORY_MESSAGES),
            updatedAt: new Date(),
            // Update title from first user message
            title: session.messages.length === 0 && role === 'user'
                ? content.slice(0, 50) + (content.length > 50 ? '...' : '')
                : session.title
        };

        setCurrentSession(updatedSession);
        setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));

        await saveToStorage(updatedSession);

        return message;
    }, [currentSession, startNewSession, saveToStorage]);

    // Get context for Jarvis (recent messages)
    const getMemoryContext = useCallback((limit: number = 10): string => {
        if (!currentSession || currentSession.messages.length === 0) {
            return '';
        }

        const recent = currentSession.messages.slice(-limit);
        let context = '\n\n[Previous conversation context:]\n';

        for (const msg of recent) {
            context += `${msg.role === 'user' ? 'User' : 'Jarvis'}: ${msg.content.slice(0, 200)}\n`;
        }

        return context;
    }, [currentSession]);

    // Search across all sessions
    const searchHistory = useCallback((query: string): ConversationMessage[] => {
        const results: ConversationMessage[] = [];
        const q = query.toLowerCase();

        for (const session of sessions) {
            for (const msg of session.messages) {
                if (msg.content.toLowerCase().includes(q)) {
                    results.push(msg);
                }
            }
        }

        return results.slice(0, 20);  // Return top 20 matches
    }, [sessions]);

    // Delete session
    const deleteSession = useCallback(async (sessionId: string) => {
        setSessions(prev => prev.filter(s => s.id !== sessionId));

        if (currentSession?.id === sessionId) {
            setCurrentSession(null);
        }

        if (userId) {
            await supabase.from('jarvis_conversations').delete().eq('id', sessionId);
        } else {
            const remaining = sessions.filter(s => s.id !== sessionId);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
                sessions: remaining,
                currentSessionId: remaining[0]?.id
            }));
        }
    }, [currentSession, sessions, userId]);

    // Switch to different session
    const switchSession = useCallback((sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            setCurrentSession(session);
        }
    }, [sessions]);

    return {
        sessions,
        currentSession,
        loading,
        addMessage,
        startNewSession,
        switchSession,
        deleteSession,
        getMemoryContext,
        searchHistory,
        messageCount: currentSession?.messages.length || 0
    };
}

export default useConversationMemory;
