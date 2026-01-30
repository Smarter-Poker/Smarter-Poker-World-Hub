/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES PANEL — Poker strategy expert AI assistant
   Grok-powered poker knowledge companion to Jarvis
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef } from 'react';
import { GeevesAvatar } from './GeevesAvatar';
import { PokerQuickTopics } from './PokerQuickTopics';

interface Message {
    id: string;
    content: string;
    isUser: boolean;
    timestamp: Date;
}

interface GeevesPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GeevesPanel({ isOpen, onClose }: GeevesPanelProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
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

                // Add greeting message
                setMessages([{
                    id: Date.now().toString(),
                    content: data.greeting,
                    isUser: false,
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error('[Geeves] Failed to start conversation:', error);
        }
    };

    const sendMessage = async (content: string) => {
        if (!content.trim()) return;

        // Add user message
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

            // Build conversation history for context
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

            // Add Geeves response
            const geevesMessage: Message = {
                id: (Date.now() + 1).toString(),
                content: data.answer,
                isUser: false,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, geevesMessage]);

        } catch (error) {
            console.error('[Geeves] Error:', error);
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
                width: '450px',
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
                    padding: '20px',
                    borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(139, 0, 139, 0.1))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <GeevesAvatar isTyping={isTyping} size={40} />
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
                                Geeves
                            </h3>
                            <p style={{
                                margin: 0,
                                fontSize: '12px',
                                color: 'rgba(255, 215, 0, 0.7)',
                                fontStyle: 'italic'
                            }}>
                                Poker Strategy Expert
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#FFD700',
                            fontSize: '28px',
                            cursor: 'pointer',
                            padding: 0,
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            transition: 'background 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 215, 0, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                        ×
                    </button>
                </div>

                {/* Messages */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px',
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
                                maxWidth: '85%',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                background: message.isUser
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'rgba(255, 215, 0, 0.1)',
                                border: message.isUser
                                    ? 'none'
                                    : '1px solid rgba(255, 215, 0, 0.2)',
                                color: message.isUser ? '#000' : '#fff',
                                fontSize: '14px',
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word'
                            }}>
                                {message.content}
                            </div>
                            <div style={{
                                fontSize: '11px',
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
                            <GeevesAvatar isTyping={true} size={24} />
                            <span style={{ fontStyle: 'italic' }}>Geeves is thinking...</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Quick Topics */}
                <PokerQuickTopics onTopicClick={handleQuickTopic} />

                {/* Input */}
                <div style={{
                    padding: '20px',
                    borderTop: '1px solid rgba(255, 215, 0, 0.2)',
                    background: 'rgba(0, 0, 0, 0.2)'
                }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask me anything about poker..."
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                background: 'rgba(255, 215, 0, 0.05)',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={() => sendMessage(inputValue)}
                            disabled={!inputValue.trim() || isTyping}
                            style={{
                                padding: '12px 24px',
                                background: inputValue.trim() && !isTyping
                                    ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                    : 'rgba(255, 215, 0, 0.2)',
                                border: 'none',
                                borderRadius: '12px',
                                color: inputValue.trim() && !isTyping ? '#000' : 'rgba(255, 255, 255, 0.3)',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: inputValue.trim() && !isTyping ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            Send
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
