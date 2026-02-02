/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES PANEL v3.0 — Ultimate poker strategy expert AI assistant
   Features:
   - Smart caching indicator
   - User ratings (1-5 stars)
   - Markdown rendering
   - Copy button
   - Conversation history
   - Range visualizer + Equity calculator + Hand diagrams
   - Voice input/output (Web Speech API)
   - 5 Personality modes
   - Poker Quiz with diamond rewards
   - Screenshot analysis (Grok Vision)
   - Hand history parser
   - Custom range builder
   - Export/share conversations
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';
import { JarvisAvatar } from './JarvisAvatar';
import { PokerQuickTopics } from './PokerQuickTopics';
import { MessageContent } from './MessageContent';
import { RatingStars } from './RatingStars';
import { ConversationList } from './ConversationList';
import { VoiceInput } from './VoiceInput';
import { VoiceOutput } from './VoiceOutput';
import { PersonalitySelector, JarvisPersonality, getPersonalityPrompt } from './PersonalitySelector';
import { JarvisAdvancedToolbar } from './JarvisAdvancedToolbar';

interface Message {
    id: string;
    content: string;
    isUser: boolean;
    timestamp: Date;
    cacheId?: string;
    fromCache?: boolean;
    rating?: number;
}

interface JarvisPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function JarvisPanel({ isOpen, onClose }: JarvisPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [cacheStats, setCacheStats] = useState({ hits: 0, total: 0 });
    const [personality, setPersonality] = useState<JarvisPersonality>('balanced');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Start conversation when panel opens
    useEffect(() => {
        if (isOpen && !conversationId) {
            startConversation();
        }
    }, [isOpen]);

    const getAuthToken = () => {
        const authData = localStorage.getItem('smarter-poker-auth');
        if (!authData) return null;
        const parsed = JSON.parse(authData);
        return parsed.access_token;
    };

    const startConversation = async () => {
        try {
            const token = getAuthToken();
            if (!token) return;

            const response = await fetch('/api/geeves/start-conversation', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setConversationId(data.conversationId);

                setMessages([{
                    id: Date.now().toString(),
                    content: data.greeting,
                    isUser: false,
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error('[Jarvis] Failed to start conversation:', error);
        }
    };

    const loadConversation = async (convId: string) => {
        try {
            const token = getAuthToken();
            if (!token) return;

            const response = await fetch(`/api/geeves/conversation/${convId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setConversationId(convId);
                setMessages(data.messages.map((msg: any) => ({
                    id: msg.id,
                    content: msg.content,
                    isUser: msg.isUser,
                    timestamp: new Date(msg.timestamp),
                    cacheId: msg.cacheId,
                    fromCache: msg.fromCache
                })));
                setShowHistory(false);
            }
        } catch (error) {
            console.error('[Jarvis] Failed to load conversation:', error);
        }
    };

    const sendMessage = async (content: string) => {
        if (!content.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            content,
            isUser: true,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);

        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            const conversationHistory = messages.map(msg => ({
                content: msg.content,
                isUser: msg.isUser
            }));

            const response = await fetch('/api/geeves/ask', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    question: content,
                    conversationId,
                    conversationHistory
                })
            });

            if (!response.ok) throw new Error('Failed to get response');

            const data = await response.json();

            const jarvisMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: data.answer,
                isUser: false,
                timestamp: new Date(),
                cacheId: data.cacheId,
                fromCache: data.fromCache
            };
            setMessages(prev => [...prev, jarvisMessage]);

            // Update cache stats
            setCacheStats(prev => ({
                hits: prev.hits + (data.fromCache ? 1 : 0),
                total: prev.total + 1
            }));

        } catch (error) {
            console.error('[Jarvis] Error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: 'I apologize, but I encountered an error. Please try again.',
                isUser: false,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRating = async (messageId: string, cacheId: string, rating: number) => {
        try {
            const token = getAuthToken();
            if (!token) return;

            await fetch('/api/geeves/rate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cacheId, rating })
            });

            setMessages(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, rating } : msg
            ));
        } catch (error) {
            console.error('[Jarvis] Rating failed:', error);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(inputValue);
        }
    };

    const handleQuickTopic = (query: string) => {
        setInputValue(query);
        sendMessage(query);
    };

    const startNewConversation = () => {
        setMessages([]);
        setConversationId(null);
        setCacheStats({ hits: 0, total: 0 });
        startConversation();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.4)',
                    zIndex: 999,
                    backdropFilter: 'blur(2px)'
                }}
            />

            {/* Panel */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '480px',
                maxWidth: '100vw',
                background: 'linear-gradient(135deg, rgba(20, 10, 40, 0.98), rgba(40, 20, 60, 0.98))',
                borderLeft: '2px solid rgba(255, 215, 0, 0.3)',
                boxShadow: '-4px 0 30px rgba(0, 0, 0, 0.5)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInRight 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(139, 0, 139, 0.1))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <JarvisAvatar isTyping={isTyping} size={40} />
                        <div>
                            <h3 style={{
                                margin: 0,
                                fontSize: '18px',
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontFamily: 'Georgia, serif'
                            }}>
                                Jarvis
                            </h3>
                            <p style={{
                                margin: 0,
                                fontSize: '11px',
                                color: 'rgba(255, 215, 0, 0.7)',
                                fontStyle: 'italic'
                            }}>
                                Poker Strategy Expert
                                {cacheStats.total > 0 && (
                                    <span style={{ marginLeft: '8px', color: 'rgba(100, 255, 100, 0.8)' }}>
                                        ⚡ {cacheStats.hits}/{cacheStats.total} cached
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* History Button */}
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            style={{
                                background: showHistory ? 'rgba(255, 215, 0, 0.2)' : 'none',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                color: '#FFD700',
                                fontSize: '16px',
                                cursor: 'pointer',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Conversation History"
                        >
                            📜
                        </button>

                        {/* New Chat Button */}
                        <button
                            onClick={startNewConversation}
                            style={{
                                background: 'none',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                color: '#FFD700',
                                fontSize: '16px',
                                cursor: 'pointer',
                                padding: '6px 10px',
                                borderRadius: '8px'
                            }}
                            title="New Conversation"
                        >
                            ✨
                        </button>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#FFD700',
                                fontSize: '24px',
                                cursor: 'pointer',
                                padding: '0 4px',
                                marginLeft: '4px'
                            }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Conversation History Panel */}
                {showHistory && (
                    <ConversationList
                        onSelectConversation={loadConversation}
                        onClose={() => setShowHistory(false)}
                    />
                )}

                {/* Messages */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: message.isUser ? 'flex-end' : 'flex-start'
                            }}
                        >
                            <div style={{
                                maxWidth: '90%',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: message.isUser
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'rgba(255, 215, 0, 0.08)',
                                border: message.isUser
                                    ? 'none'
                                    : '1px solid rgba(255, 215, 0, 0.2)',
                                color: message.isUser ? '#000' : '#fff',
                                fontSize: '14px',
                                lineHeight: 1.6,
                                position: 'relative'
                            }}>
                                {!message.isUser && message.fromCache && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-8px',
                                        right: '8px',
                                        background: 'rgba(100, 255, 100, 0.2)',
                                        color: 'rgba(100, 255, 100, 0.9)',
                                        fontSize: '9px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 600
                                    }}>
                                        ⚡ INSTANT
                                    </div>
                                )}

                                <MessageContent content={message.content} isUser={message.isUser} />

                                {/* Actions for Jarvis messages */}
                                {!message.isUser && (
                                    <div style={{
                                        marginTop: '12px',
                                        paddingTop: '8px',
                                        borderTop: '1px solid rgba(255, 215, 0, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        {/* Rating */}
                                        {message.cacheId && (
                                            <RatingStars
                                                rating={message.rating || 0}
                                                onRate={(rating) => handleRating(message.id, message.cacheId!, rating)}
                                            />
                                        )}

                                        {/* Copy Button */}
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(message.content);
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'rgba(255, 215, 0, 0.6)',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            title="Copy response"
                                        >
                                            📋 Copy
                                        </button>

                                        {/* Voice Output */}
                                        <VoiceOutput text={message.content} />
                                    </div>
                                )}
                            </div>

                            <div style={{
                                fontSize: '10px',
                                color: 'rgba(255, 215, 0, 0.4)',
                                marginTop: '4px'
                            }}>
                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '14px'
                        }}>
                            <JarvisAvatar isTyping={true} size={24} />
                            <span style={{ fontStyle: 'italic' }}>Jarvis is consulting his poker wisdom...</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Personality Selector */}
                <PersonalitySelector
                    selected={personality}
                    onSelect={setPersonality}
                />

                {/* Quick Topics */}
                <PokerQuickTopics onTopicClick={handleQuickTopic} />

                {/* Advanced Tools Toolbar */}
                <JarvisAdvancedToolbar
                    messages={messages}
                    onAskQuestion={sendMessage}
                    onScreenshotAnalysis={(analysis) => {
                        const msg: Message = {
                            id: Date.now().toString(),
                            content: analysis,
                            isUser: false,
                            timestamp: new Date()
                        };
                        setMessages(prev => [...prev, msg]);
                    }}
                />

                {/* Input */}
                <div style={{
                    padding: '16px 20px',
                    borderTop: '1px solid rgba(255, 215, 0, 0.2)',
                    background: 'rgba(0, 0, 0, 0.2)'
                }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <VoiceInput
                            onTranscript={(text) => {
                                setInputValue(text);
                                sendMessage(text);
                            }}
                            isDisabled={isTyping}
                        />
                        <textarea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask any poker question... (or use 🎤)"
                            rows={2}
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                borderRadius: '10px',
                                color: '#fff',
                                fontSize: '14px',
                                outline: 'none',
                                resize: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button
                            onClick={() => sendMessage(inputValue)}
                            disabled={!inputValue.trim() || isTyping}
                            style={{
                                padding: '10px 20px',
                                background: inputValue.trim() && !isTyping
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'rgba(255, 215, 0, 0.2)',
                                border: 'none',
                                borderRadius: '10px',
                                color: inputValue.trim() && !isTyping ? '#000' : 'rgba(255, 255, 255, 0.3)',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: inputValue.trim() && !isTyping ? 'pointer' : 'not-allowed',
                                alignSelf: 'flex-end'
                            }}
                        >
                            Ask
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </>
    );
}
