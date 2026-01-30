/* ═══════════════════════════════════════════════════════════════════════════
   ASK JARVIS PANEL — The sliding conversation interface
   
   Features:
   - Jarvis: Comprehensive Smarter.Poker expert
   - Message history with human-like typing
   - Input field with send button
   - Subtle, non-intrusive design
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import type { Agent, Message } from './useLiveHelp';
import { AGENTS } from './useLiveHelp';
import { DynamicQuickActions } from './DynamicQuickActions';
import { MessageReactions } from './MessageReactions';
import { CopyButton } from './CopyButton';
import { VoiceInput } from './VoiceInput';
import { EnhancedTypingIndicator } from './EnhancedTypingIndicator';
import { useKeyboardShortcuts, KeyboardShortcutHints } from './KeyboardShortcuts';
import { ThemeToggle, getThemeColors, type Theme } from './ThemeToggle';
import { CompactModeToggle, getCompactStyles } from './CompactModeToggle';
import { LanguageSelector, useTranslation, type Language } from './LanguageSelector';
import { AutoComplete } from './AutoComplete';
import { ConversationHistory } from './ConversationHistory';
import { RichMediaRenderer } from './RichMediaRenderer';
import { JarvisAvatar } from './JarvisAvatar';


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

    // State management for new features
    const [theme, setTheme] = useState<Theme>('dark');
    const [isCompact, setIsCompact] = useState(false);
    const [language, setLanguage] = useState<Language>('en');
    const [showAutoComplete, setShowAutoComplete] = useState(false);

    // Get theme colors and compact styles
    const colors = getThemeColors(theme);
    const styles = getCompactStyles(isCompact);
    const t = useTranslation(language);

    // Keyboard shortcuts
    useKeyboardShortcuts({
        onOpenJarvis: () => { },
        onCloseJarvis: onClose,
        isOpen
    });

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
                    width: styles.width,
                    maxWidth: '100vw',
                    background: colors.background,
                    border: `1px solid ${colors.border}`,
                    borderRight: 'none',
                    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s ease',
                    zIndex: 201,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: `${styles.padding}px ${styles.padding + 4}px`,
                        borderBottom: `1px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <JarvisAvatar isTyping={isAgentTyping} size={styles.avatarSize} />
                        <div>
                            <h3
                                style={{
                                    fontFamily: 'Orbitron, sans-serif',
                                    fontSize: styles.fontSize + 2,
                                    fontWeight: 600,
                                    color: colors.text,
                                    margin: 0,
                                }}
                            >
                                {t.askJarvis}
                            </h3>
                            <p
                                style={{
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: styles.fontSize - 2,
                                    color: colors.textSecondary,
                                    margin: '4px 0 0 0',
                                }}
                            >
                                Smarter.Poker Expert
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ConversationHistory
                            onSelect={(id) => console.log('Resume conversation:', id)}
                            onNewConversation={() => console.log('New conversation')}
                        />
                        <LanguageSelector onLanguageChange={setLanguage} />
                        <CompactModeToggle onModeChange={setIsCompact} />
                        <ThemeToggle onThemeChange={setTheme} />
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
                                color: colors.text,
                                cursor: 'pointer',
                                fontSize: 18,
                            }}
                        >
                            ×
                        </button>
                    </div>
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

                    {/* Enhanced Typing indicator */}
                    {isAgentTyping && (
                        <EnhancedTypingIndicator />
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
                    <VoiceInput
                        onTranscript={(text) => {
                            onInputChange(inputValue + (inputValue ? ' ' : '') + text);
                        }}
                        onError={(error) => console.error('Voice input error:', error)}
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

            {/* Reactions and Copy Button for Jarvis messages */}
            {!isUser && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '8px',
                    marginLeft: '12px'
                }}>
                    <CopyButton
                        content={message.content}
                        onCopy={() => {
                            // Track copy event
                            console.log('Message copied:', message.id);
                        }}
                    />
                    <MessageReactions
                        messageId={message.id}
                        onReact={(reaction) => {
                            console.log('Reaction:', reaction, 'for message:', message.id);
                        }}
                    />
                </div>
            )}
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
