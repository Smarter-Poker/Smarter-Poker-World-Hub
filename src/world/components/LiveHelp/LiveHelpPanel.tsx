/* ═══════════════════════════════════════════════════════════════════════════
   LIVE HELP PANEL — The sliding conversation interface
   
   Features:
   - Agent selection bar at top
   - Message history with human-like typing
   - Input field with send button
   - Subtle, non-intrusive design
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from 'react';
import type { Agent, Message } from './useLiveHelp';
import { AGENTS } from './useLiveHelp';

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 PANEL COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface LiveHelpPanelProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    currentAgent: Agent;
    isAgentTyping: boolean;
    inputValue: string;
    onInputChange: (value: string) => void;
    onSendMessage: (message: string) => void;
    onSwitchAgent: (agentId: string) => void;
}

export function LiveHelpPanel({
    isOpen,
    onClose,
    messages,
    currentAgent,
    isAgentTyping,
    inputValue,
    onInputChange,
    onSendMessage,
    onSwitchAgent,
}: LiveHelpPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isAgentTyping]);

    // Handle send
    const handleSend = () => {
        if (inputValue.trim()) {
            onSendMessage(inputValue);
        }
    };

    // Handle enter key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.4)',
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease',
                    zIndex: 200,
                }}
            />

            {/* Panel */}
            <div
                style={{
                    position: 'fixed',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 420,
                    maxWidth: '100vw',
                    background: 'linear-gradient(180deg, rgba(0, 20, 45, 0.98), rgba(0, 10, 30, 0.99))',
                    borderLeft: '1px solid rgba(0, 212, 255, 0.3)',
                    boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.5)',
                    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 201,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div>
                        <h3
                            style={{
                                fontFamily: 'Orbitron, sans-serif',
                                fontSize: 16,
                                fontWeight: 600,
                                color: '#ffffff',
                                margin: 0,
                            }}
                        >
                            Live Help
                        </h3>
                        <p
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                fontSize: 12,
                                color: 'rgba(255, 255, 255, 0.6)',
                                margin: '4px 0 0 0',
                            }}
                        >
                            Speaking With {currentAgent.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: 18,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Messages */}
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}
                >
                    {messages.map(msg => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            agent={AGENTS.find(a => a.id === msg.agentId)}
                        />
                    ))}

                    {/* Typing indicator */}
                    {isAgentTyping && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 16px',
                                background: 'rgba(0, 212, 255, 0.1)',
                                borderRadius: 12,
                                alignSelf: 'flex-start',
                            }}
                        >
                            <span style={{ color: currentAgent.avatarColor, fontWeight: 600 }}>
                                {currentAgent.name}
                            </span>
                            <TypingDots />
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div
                    style={{
                        padding: '16px',
                        borderTop: '1px solid rgba(0, 212, 255, 0.2)',
                        display: 'flex',
                        gap: 12,
                    }}
                >
                    <input
                        type="text"
                        value={inputValue}
                        onChange={e => onInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type Your Question..."
                        style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: 'rgba(0, 20, 40, 0.6)',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            borderRadius: 24,
                            color: '#ffffff',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 14,
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        style={{
                            width: 44,
                            height: 44,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: inputValue.trim()
                                ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                                : 'rgba(0, 212, 255, 0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            cursor: inputValue.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                        </svg>
                    </button>
                </div>
            </div >
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏷️ AGENT CHIP
// ─────────────────────────────────────────────────────────────────────────────
interface AgentChipProps {
    agent: Agent;
    isActive: boolean;
    onClick: () => void;
}

function AgentChip({ agent, isActive, onClick }: AgentChipProps) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '8px 14px',
                background: isActive
                    ? `linear-gradient(135deg, ${agent.avatarColor}33, ${agent.avatarColor}22)`
                    : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${isActive ? agent.avatarColor : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
            }}
        >
            <span
                style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 500,
                    color: isActive ? agent.avatarColor : 'rgba(255, 255, 255, 0.6)',
                }}
            >
                {agent.name}
            </span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 💬 MESSAGE BUBBLE
// ─────────────────────────────────────────────────────────────────────────────
interface MessageBubbleProps {
    message: Message;
    agent?: Agent;
}

function MessageBubble({ message, agent }: MessageBubbleProps) {
    const isUser = message.isUser;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
            }}
        >
            {!isUser && agent && (
                <span
                    style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: agent.avatarColor,
                        marginBottom: 4,
                        marginLeft: 12,
                    }}
                >
                    {agent.name}
                </span>
            )}
            <div
                style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    background: isUser
                        ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                        : 'rgba(0, 212, 255, 0.1)',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    border: isUser ? 'none' : '1px solid rgba(0, 212, 255, 0.2)',
                }}
            >
                <p
                    style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: '#ffffff',
                        margin: 0,
                    }}
                >
                    {message.content}
                </p>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⏳ TYPING DOTS
// ─────────────────────────────────────────────────────────────────────────────
function TypingDots() {
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map(i => (
                <span
                    key={i}
                    style={{
                        width: 6,
                        height: 6,
                        background: 'rgba(255, 255, 255, 0.6)',
                        borderRadius: '50%',
                        animation: `typingDot 1s ease-in-out ${i * 0.15}s infinite`,
                    }}
                />
            ))}
            <style>{`
                @keyframes typingDot {
                    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
                    30% { opacity: 1; transform: translateY(-3px); }
                }
            `}</style>
        </div>
    );
}

export default LiveHelpPanel;
