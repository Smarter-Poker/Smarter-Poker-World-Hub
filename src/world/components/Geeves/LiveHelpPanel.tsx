/* ═══════════════════════════════════════════════════════════════════════════
   ASK GEEVES PANEL — The sliding conversation interface
   
   Features:
   - Geeves: Comprehensive Smarter.Poker expert
   - Message history with human-like typing
   - Input field with send button
   - Subtle, non-intrusive design
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import type { Agent, Message } from './useLiveHelp';
import { AGENTS } from './useLiveHelp';
import { MessageReactions } from './MessageReactions';
import { CopyButton } from './CopyButton';
import { VoiceInput } from './VoiceInput';
import { EnhancedTypingIndicator } from './EnhancedTypingIndicator';
import { useKeyboardShortcuts } from './KeyboardShortcuts';
import { getThemeColors, type Theme } from './ThemeToggle';
import { getCompactStyles } from './CompactModeToggle';
import { useTranslation, type Language } from './LanguageSelector';
import { AutoComplete } from './AutoComplete';
import { ConversationHistory } from './ConversationHistory';
import { RichMediaRenderer } from './RichMediaRenderer';
import { ScreenshotUpload } from './ScreenshotUpload';


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
    onSwitchAgent?: (agentId: string) => void;
    resumeConversation?: (conversationId: string) => void;
    startNewConversation?: () => void;
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
    resumeConversation,
    startNewConversation,
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
    const inputRef = useRef<HTMLTextAreaElement>(null);
    useKeyboardShortcuts({
        onOpenGeeves: () => { inputRef.current?.focus(); },
        onCloseGeeves: onClose,
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
            setShowAutoComplete(false);
        }
    };

    // Handle auto-complete selection
    const handleAutoCompleteSelect = (suggestion: string) => {
        onInputChange(suggestion);
        setShowAutoComplete(false);
    };

    // Handle input change with auto-complete trigger
    const handleInputChange = (value: string) => {
        onInputChange(value);
        // Show auto-complete for certain triggers
        const triggers = ['how', 'what', 'where', 'help', 'can'];
        const shouldShow = triggers.some(trigger => value.toLowerCase().startsWith(trigger));
        setShowAutoComplete(shouldShow && value.length > 2);
    };

    // Handle quick action click
    const handleQuickAction = (message: string) => {
        onInputChange(message);
    };

    // Handle enter key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Listen for follow-up chip clicks
    useEffect(() => {
        const handler = (e: Event) => {
            const question = (e as CustomEvent).detail;
            if (question && typeof question === 'string') {
                onSendMessage(question);
            }
        };
        window.addEventListener('geeves-follow-up', handler);
        return () => window.removeEventListener('geeves-follow-up', handler);
    }, [onSendMessage]);

    return (
        <div data-geeves-live-help="true" style={{ display: 'contents' }}>
            {/* Backdrop — only rendered when panel is open */}
            {isOpen && (
                <div
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.4)',
                        zIndex: 200,
                        animation: 'geevesBackdropIn 0.3s ease',
                    }}
                />
            )}

            {/* Panel — only rendered when open */}
            {isOpen && (
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
                        zIndex: 201,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'geevesPanelIn 0.3s ease',
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
                        <img
                            src="/images/geeves-avatar.png"
                            alt="Geeves"
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '2px solid rgba(0, 212, 255, 0.5)',
                                boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)'
                            }}
                        />
                        <div>
                            <h3
                                style={{
                                    fontFamily: 'Rajdhani, sans-serif',
                                    fontSize: styles.fontSize + 2,
                                    fontWeight: 600,
                                    color: colors.text,
                                    margin: 0,
                                }}
                            >
                                {t.askGeeves}
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
                            onSelect={(id) => resumeConversation?.(id)}
                            onNewConversation={() => startNewConversation?.()}
                        />
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

                {/* Quick Actions removed per user request */}

                {/* Input */}
                <div
                    style={{
                        padding: `${styles.padding}px`,
                        borderTop: `1px solid ${colors.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        position: 'relative'
                    }}
                >
                    {/* Auto-Complete */}
                    {showAutoComplete && (
                        <AutoComplete
                            inputValue={inputValue}
                            onSelect={handleAutoCompleteSelect}
                        />
                    )}

                    {/* Input Row */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={e => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t.typeYourQuestion}
                            style={{
                                flex: 1,
                                padding: styles.inputPadding,
                                background: colors.inputBackground,
                                border: `1px solid ${colors.inputBorder}`,
                                borderRadius: 24,
                                color: colors.text,
                                fontFamily: 'Inter, sans-serif',
                                fontSize: styles.fontSize,
                                outline: 'none',
                            }}
                        />
                        <VoiceInput
                            onTranscript={(text) => {
                                handleInputChange(inputValue + (inputValue ? ' ' : '') + text);
                            }}
                            onError={(error) => console.warn('Voice input error:', error)}
                        />
                        <ScreenshotUpload
                            onAnalyze={async (base64) => {
                                try {
                                    const token = (() => { try { const a = localStorage.getItem('smarter-poker-auth'); return a ? JSON.parse(a)?.access_token : null; } catch { return null; } })();
                                    const r = await fetch('/api/geeves/analyze-screenshot', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                                        body: JSON.stringify({ image: base64 }),
                                    });
                                    const d = await r.json();
                                    if (d.analysis) onSendMessage(`[Screenshot Analysis]\n\n${d.analysis}`);
                                } catch { console.warn('Screenshot analysis failed'); }
                            }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim()}
                            style={{
                                width: 48,
                                height: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: inputValue.trim()
                                    ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                                    : 'rgba(255, 255, 255, 0.1)',
                                border: 'none',
                                borderRadius: '50%',
                                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* CSS Animations for open/close */}
            <style>{`
                @keyframes geevesBackdropIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes geevesPanelIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
            `}</style>
        </div>
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
                <RichMediaRenderer content={message.content} />
            </div>

            {/* Reactions and Copy Button for Geeves messages */}
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
                        cacheId={message.cacheId}
                        onReact={(reaction) => {
                            console.log('Reaction:', reaction, 'for message:', message.id);
                        }}
                    />
                </div>
            )}

            {/* Follow-up chips */}
            {!isUser && (message as any).followUps && (message as any).followUps.length > 0 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginTop: '8px',
                    marginLeft: '12px'
                }}>
                    {(message as any).followUps.map((q: string, i: number) => (
                        <button
                            key={i}
                            onClick={() => {
                                // Trigger a new question by dispatching a custom event
                                window.dispatchEvent(new CustomEvent('geeves-follow-up', { detail: q }));
                            }}
                            style={{
                                padding: '4px 10px',
                                background: 'rgba(0, 212, 255, 0.08)',
                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                borderRadius: '12px',
                                color: '#00d4ff',
                                fontSize: '11px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {q}
                        </button>
                    ))}
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
