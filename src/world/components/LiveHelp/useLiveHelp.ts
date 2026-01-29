/* ═══════════════════════════════════════════════════════════════════════════
   LIVE HELP PANEL — PokerIQ's embedded expert assistance layer
   
   Production-ready version with real API integration, message persistence,
   and context awareness.
   
   Five Fixed Agents: Daniel, Sarah, Alice, Michael, Jenny
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { collectUserContext } from '../../../lib/liveHelp/contextCollector';
import { getAuthUser } from '../../../lib/authUtils';

// ─────────────────────────────────────────────────────────────────────────────
// 👥 AGENT DEFINITIONS — Fixed personalities with distinct tones
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
        id: 'daniel',
        name: 'Daniel',
        title: 'GTO Strategy Coach',
        personality: 'Analytical and precise. Focuses on solver-backed reasoning with clear explanations.',
        avatarColor: '#00d4ff',
        typingSpeed: 'medium',
        tone: 'analytical',
    },
    {
        id: 'sarah',
        name: 'Sarah',
        title: 'Mindset & Performance',
        personality: 'Warm and supportive. Specializes in mental game, tilt control, and motivation.',
        avatarColor: '#ff6b9d',
        typingSpeed: 'slow',
        tone: 'warm',
    },
    {
        id: 'alice',
        name: 'Alice',
        title: 'Drill Master',
        personality: 'Direct and efficient. Expert in training modes, drills, and skill progression.',
        avatarColor: '#00ff88',
        typingSpeed: 'fast',
        tone: 'direct',
    },
    {
        id: 'michael',
        name: 'Michael',
        title: 'Bankroll Advisor',
        personality: 'Practical and encouraging. Focuses on bankroll management and long-term growth.',
        avatarColor: '#ffa500',
        typingSpeed: 'medium',
        tone: 'encouraging',
    },
    {
        id: 'jenny',
        name: 'Jenny',
        title: 'Live Game Expert',
        personality: 'Playful yet insightful. Specializes in live play reads, tells, and social dynamics.',
        avatarColor: '#bf6bff',
        typingSpeed: 'medium',
        tone: 'playful',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 AUTH HELPER
// ─────────────────────────────────────────────────────────────────────────────
function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const authData = localStorage.getItem('smarter-poker-auth');
        if (authData) {
            const parsed = JSON.parse(authData);
            return parsed?.access_token || null;
        }
    } catch (e) {
        console.error('[LiveHelp] Error getting auth token:', e);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 💬 MESSAGE TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface Message {
    id: string;
    agentId: string;
    content: string;
    timestamp: Date;
    isUser: boolean;
    isTyping?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 LIVE HELP HOOK — Main state management with real API integration
// ─────────────────────────────────────────────────────────────────────────────
export function useLiveHelp() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentAgent, setCurrentAgent] = useState<Agent>(AGENTS[0]);
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
    }, [isOpen]);

    // Start new conversation or resume existing
    const startConversation = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const user = getAuthUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Collect user context
            const context = await collectUserContext(user.id);

            const token = getAuthToken();
            if (!token) {
                throw new Error('No auth token available');
            }

            const response = await fetch('/api/live-help/start-conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ context })
            });

            if (!response.ok) {
                throw new Error('Failed to start conversation');
            }

            const data = await response.json();

            setConversationId(data.conversationId);

            const agent = AGENTS.find(a => a.id === data.agentId) || AGENTS[0];
            setCurrentAgent(agent);

            // Load existing messages or add greeting
            if (data.messages && data.messages.length > 0) {
                const formattedMessages = data.messages.map((msg: any) => ({
                    id: msg.id,
                    agentId: msg.agent_id || '',
                    content: msg.content,
                    timestamp: new Date(msg.created_at),
                    isUser: msg.sender_type === 'user'
                }));
                setMessages(formattedMessages);
            }

        } catch (err) {
            console.error('Failed to start conversation:', err);
            setError('Failed to start conversation. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Send message
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || !conversationId) return;

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
            const user = getAuthUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Collect current context
            const context = await collectUserContext(user.id);

            const token = getAuthToken();
            if (!token) {
                throw new Error('No auth token available');
            }

            const response = await fetch('/api/live-help/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    conversationId,
                    content: content.trim(),
                    context
                })
            });

            if (!response.ok) {
                throw new Error('Failed to send message');
            }

            const data = await response.json();

            // Simulate typing delay
            await new Promise(resolve => setTimeout(resolve, data.typingDelay || 1500));

            // Add agent response
            const agentMessage: Message = {
                id: data.agentMessage.id,
                agentId: data.agentMessage.agent_id,
                content: data.agentMessage.content,
                timestamp: new Date(data.agentMessage.created_at),
                isUser: false
            };

            setMessages(prev => [...prev, agentMessage]);

        } catch (err) {
            console.error('Failed to send message:', err);
            setError('Failed to send message. Please try again.');

            // Add error message
            const errorMessage: Message = {
                id: `error-${Date.now()}`,
                agentId: currentAgent.id,
                content: "I'm having trouble connecting right now. Please try again in a moment.",
                timestamp: new Date(),
                isUser: false
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsAgentTyping(false);
        }
    }, [conversationId, currentAgent]);

    // Switch agent
    const switchAgent = useCallback((agentId: string) => {
        const agent = AGENTS.find(a => a.id === agentId);
        if (agent) {
            setCurrentAgent(agent);

            // Add system message about agent switch
            const switchMessage: Message = {
                id: `switch-${Date.now()}`,
                agentId: agent.id,
                content: `Hi! I'm ${agent.name}, your ${agent.title}. How can I help you?`,
                timestamp: new Date(),
                isUser: false
            };
            setMessages(prev => [...prev, switchMessage]);
        }
    }, []);

    // Create support ticket
    const createTicket = useCallback(async (subject: string, description: string, priority: string = 'medium') => {
        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('No auth token available');
            }

            const response = await fetch('/api/live-help/create-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    conversationId,
                    subject,
                    description,
                    priority
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create ticket');
            }

            const data = await response.json();
            return data;

        } catch (err) {
            console.error('Failed to create ticket:', err);
            throw err;
        }
    }, [conversationId]);

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
        onSwitchAgent: switchAgent,
        createTicket,
        isLoading,
        error
    };
}

export { LiveHelpPanel } from './LiveHelpPanel';
