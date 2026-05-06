/* ═══════════════════════════════════════════════════════════════════════════
   LIVE HELP HOOK — Geeves AI Help Bot state management
   
   Production-ready with real API integration via /api/geeves/* endpoints.
   Manages conversation lifecycle, message exchange, and history.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';

// Local event emitter to replace missing busEmit export
const busEmit = {
    geevesQuestionMissed: (question: string, page: string) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('geeves-question-missed', { detail: { question, page } }));
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export interface Agent {
    id: string;
    name: string;
    title: string;
    personality: string;
    avatarColor: string;
    typingSpeed: 'slow' | 'medium' | 'fast';
    tone: 'warm' | 'direct' | 'analytical' | 'encouraging' | 'playful';
}

export const AGENTS: Agent[] = [
    {
        id: 'geeves',
        name: 'Geeves',
        title: 'Smarter.Poker Expert',
        personality: 'Comprehensive and knowledgeable. Expert on all aspects of Smarter.Poker.',
        avatarColor: '#00d4ff',
        typingSpeed: 'medium',
        tone: 'analytical',
    }
];

// ─────────────────────────────────────────────────────────────────────────────
// AUTH HELPER
// ─────────────────────────────────────────────────────────────────────────────
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        // Try multiple auth key formats
        const keys = ['smarter-poker-auth', 'smarter_poker_auth', 'sp_auth'];
        for (const key of keys) {
            const authData = localStorage.getItem(key);
            if (authData) {
                const parsed = JSON.parse(authData);
                return parsed?.access_token || null;
            }
        }
    } catch (e) {
        console.warn('[Geeves] Error getting auth token:', e);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface Message {
    id: string;
    agentId: string;
    content: string;
    timestamp: Date;
    isUser: boolean;
    isTyping?: boolean;
    cacheId?: string;
    fromCache?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE HELP HOOK — Main state management with /api/geeves/* integration
// ─────────────────────────────────────────────────────────────────────────────
export function useLiveHelp() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentAgent] = useState<Agent>(AGENTS[0]);
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Start or resume conversation when panel opens
    useEffect(() => {
        if (isOpen && !conversationId) {
            startConversation();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // ─── Start new conversation via /api/geeves/start-conversation ───
    const startConversation = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const token = getAuthToken();
            if (!token) {
                // Show a guest-friendly fallback
                const guestMsg: Message = {
                    id: `greeting-${Date.now()}`,
                    agentId: 'geeves',
                    content: "Hello! I'm Geeves, your Smarter.Poker expert. Please sign in to start a conversation with me.",
                    timestamp: new Date(),
                    isUser: false
                };
                setMessages([guestMsg]);
                return;
            }

            const response = await fetch('/api/geeves/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                throw new Error('Failed to start conversation');
            }

            const data = await response.json();
            setConversationId(data.conversationId);

            // Add Geeves greeting
            const greetingMessage: Message = {
                id: `greeting-${Date.now()}`,
                agentId: 'geeves',
                content: data.greeting,
                timestamp: new Date(),
                isUser: false
            };
            setMessages([greetingMessage]);

        } catch (err) {
            console.warn('[Geeves] Failed to start conversation:', err);
            setError('Failed to connect to Geeves. Please try again.');
            // Fallback greeting so the UI isn't empty
            const fallbackMsg: Message = {
                id: `fallback-${Date.now()}`,
                agentId: 'geeves',
                content: "Hello! I'm Geeves. I'm having a moment of trouble connecting, but please try sending your question and I'll do my best.",
                timestamp: new Date(),
                isUser: false
            };
            setMessages([fallbackMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // ─── Send message via /api/geeves/ask ───
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // Add user message immediately
        const userMessage: Message = {
            id: `user-${Date.now()}`,
            agentId: '',
            content: content.trim(),
            timestamp: new Date(),
            isUser: true,
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsAgentTyping(true);
        setError(null);

        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            // Build conversation history from current messages for context
            const conversationHistory = messages
                .filter(m => !m.isTyping)
                .slice(-6)
                .map(m => ({ isUser: m.isUser, content: m.content }));

            const response = await fetch('/api/geeves/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    question: content.trim(),
                    conversationId,
                    conversationHistory
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get response');
            }

            const data = await response.json();

            // Dispatch real-time event to update analytics dashboard and logs
            if (data.missedQuestion) {
                const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
                busEmit.geevesQuestionMissed(content.trim(), currentPath);
            }

            // Variable typing delay — KB answers feel instant, Grok feels thoughtful
            const delayMs = data.fromLocalKB
                ? Math.min(200 + (data.answer?.length || 0) * 0.5, 600)
                : Math.min(300 + (data.answer?.length || 0) * 2, 2000);
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Add Geeves response
            const agentMessage: Message = {
                id: `geeves-${Date.now()}`,
                agentId: 'geeves',
                content: data.answer,
                timestamp: new Date(),
                isUser: false,
                cacheId: data.cacheId || undefined,
                fromCache: data.fromCache || false,
                followUps: data.followUps || [],
            } as any;

            setMessages(prev => [...prev, agentMessage]);

        } catch (err) {
            console.warn('[Geeves] Failed to send message:', err);
            setError('Failed to send message. Please try again.');

            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                agentId: 'geeves',
                content: "I'm having trouble connecting right now. Please try again in a moment.",
                timestamp: new Date(),
                isUser: false
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsAgentTyping(false);
        }
    }, [conversationId, messages]);

    // ─── Resume existing conversation via /api/geeves/conversation/[id] ───
    const resumeConversation = useCallback(async (convId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            const response = await fetch(`/api/geeves/conversation/${convId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to load conversation');

            const data = await response.json();
            setConversationId(data.conversation?.id || convId);

            if (data.messages && data.messages.length > 0) {
                setMessages(data.messages.map((msg: any) => ({
                    id: msg.id || `msg-${Date.now()}-${Math.random()}`,
                    agentId: msg.is_user ? '' : 'geeves',
                    content: msg.content,
                    timestamp: new Date(msg.created_at),
                    isUser: msg.is_user,
                    cacheId: msg.cache_id || undefined,
                    fromCache: msg.from_cache || false,
                })));
            }
        } catch (err) {
            console.warn('[Geeves] Resume error:', err);
            setError('Failed to resume conversation');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // ─── Start fresh conversation ───
    const startNewConversation = useCallback(async () => {
        setMessages([]);
        setConversationId(null);
        setError(null);
        await startConversation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        isOpen,
        setIsOpen,
        onClose: () => setIsOpen(false),
        messages,
        currentAgent,
        isAgentTyping,
        inputValue,
        onInputChange: setInputValue,
        onSendMessage: sendMessage,
        resumeConversation,
        startNewConversation,
        isLoading,
        error
    };
}

export { LiveHelpPanel } from './LiveHelpPanel';
