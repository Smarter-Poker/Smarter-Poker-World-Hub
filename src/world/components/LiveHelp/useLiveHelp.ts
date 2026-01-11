/* ═══════════════════════════════════════════════════════════════════════════
   LIVE HELP PANEL — PokerIQ's embedded expert assistance layer
   
   NOT a chatbot — a team of real-feeling human experts with complete 
   system knowledge, human pacing, and context-aware guidance.
   
   Five Fixed Agents: Daniel, Sarah, Alice, Michael, Jenny
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback } from 'react';

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
// 🎯 CONTEXT AWARENESS — What does Live Help know about current state?
// ─────────────────────────────────────────────────────────────────────────────
export interface UserContext {
    currentOrb: string;
    currentMode: string;
    currentPage: string;
    recentMistakes?: string[];
    sessionDuration: number;
    userLevel: number;
    lastDrillType?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 LIVE HELP HOOK — Main state management
// ─────────────────────────────────────────────────────────────────────────────
export function useLiveHelp() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentAgent, setCurrentAgent] = useState<Agent>(AGENTS[0]);
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [inputValue, setInputValue] = useState('');

    // Simulated typing delay based on agent
    const getTypingDelay = useCallback((text: string, agent: Agent): number => {
        const baseDelay = {
            slow: 60,
            medium: 40,
            fast: 25,
        }[agent.typingSpeed];

        // Variable delay + thinking time
        return Math.min(text.length * baseDelay + 500 + Math.random() * 1000, 4000);
    }, []);

    // Add message with simulated typing
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // Add user message
        const userMessage: Message = {
            id: `user-${Date.now()}`,
            agentId: '',
            content: content.trim(),
            timestamp: new Date(),
            isUser: true,
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');

        // Simulate agent thinking and typing
        setIsAgentTyping(true);

        // Generate response (in real implementation, this would call an AI service)
        const response = generateAgentResponse(content, currentAgent);
        const typingDelay = getTypingDelay(response, currentAgent);

        await new Promise(resolve => setTimeout(resolve, typingDelay));

        const agentMessage: Message = {
            id: `agent-${Date.now()}`,
            agentId: currentAgent.id,
            content: response,
            timestamp: new Date(),
            isUser: false,
        };

        setMessages(prev => [...prev, agentMessage]);
        setIsAgentTyping(false);
    }, [currentAgent, getTypingDelay]);

    // Switch agent
    const switchAgent = useCallback((agentId: string) => {
        const agent = AGENTS.find(a => a.id === agentId);
        if (agent) {
            setCurrentAgent(agent);
            // Add transition message
            const transitionMsg: Message = {
                id: `system-${Date.now()}`,
                agentId: agent.id,
                content: `You're Now Speaking With ${agent.name}. How Can I Help?`,
                timestamp: new Date(),
                isUser: false,
            };
            setMessages(prev => [...prev, transitionMsg]);
        }
    }, []);

    // Open with greeting — random agent each time
    const openHelp = useCallback(() => {
        // Pick a random agent each time panel is opened fresh
        const randomAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
        setCurrentAgent(randomAgent);
        setIsOpen(true);

        // Always show fresh greeting from random agent
        const greeting: Message = {
            id: `greeting-${Date.now()}`,
            agentId: randomAgent.id,
            content: getAgentGreeting(randomAgent),
            timestamp: new Date(),
            isUser: false,
        };
        setMessages([greeting]);
    }, []);

    return {
        isOpen,
        setIsOpen,
        openHelp,
        messages,
        currentAgent,
        isAgentTyping,
        inputValue,
        setInputValue,
        sendMessage,
        switchAgent,
        agents: AGENTS,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🗣️ AGENT RESPONSE GENERATION
// ─────────────────────────────────────────────────────────────────────────────
function getAgentGreeting(agent: Agent): string {
    return `Hi There! I'm ${agent.name}. What Can I Help You With?`;
}

function generateAgentResponse(userInput: string, agent: Agent): string {
    // This is a placeholder — real implementation would use AI + context awareness
    const input = userInput.toLowerCase();

    // Permission-based depth: start with small chunks, offer to go deeper
    if (input.includes('raise') || input.includes('bet')) {
        if (agent.tone === 'analytical') {
            return "That's Usually A Low-Frequency Raise In Most Solver Solutions. Want The Reasoning Behind It?";
        } else if (agent.tone === 'direct') {
            return "Quick Answer: Check Solver Frequency First. Need Me To Break Down The Spot?";
        }
        return "Good Question. Let Me Think About That Spot... Want The Quick Take Or Full Analysis?";
    }

    if (input.includes('tilt') || input.includes('frustrated')) {
        if (agent.tone === 'warm') {
            return "I Hear You. Tilt Is Real And Happens To Everyone. Want To Talk Through What Triggered It?";
        }
        return "Variance Is Part Of The Game. Taking A Short Break Usually Helps. Want Some Mental Game Tips?";
    }

    if (input.includes('drill') || input.includes('training')) {
        return "We Have Several Drill Types Available. What Concept Are You Looking To Strengthen?";
    }

    if (input.includes('help') || input.includes('support')) {
        return "I'm Here To Help. If You Need To Speak With A Human, I Can Generate A Support Request For You. Just Say The Word.";
    }

    // Default: ask for clarification without overwhelming
    return "Got It. Can You Tell Me A Bit More About What You're Working On? I Want To Make Sure I Give You The Right Info.";
}

// ─────────────────────────────────────────────────────────────────────────────
// 📧 SUPPORT ESCALATION
// ─────────────────────────────────────────────────────────────────────────────
export function generateSupportTemplate(context: UserContext, agent: Agent): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POKERIQ SUPPORT REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent: ${agent.name}
Orb: ${context.currentOrb}
Mode: ${context.currentMode}
Page: ${context.currentPage}
Session Duration: ${Math.round(context.sessionDuration / 60)} Minutes
User Level: ${context.userLevel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR QUESTION / ISSUE:

[Please Describe Your Question Or Issue Here]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This Will Be Reviewed By A Human Support Team.
Email: Support@Smarter.Poker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

export default useLiveHelp;
