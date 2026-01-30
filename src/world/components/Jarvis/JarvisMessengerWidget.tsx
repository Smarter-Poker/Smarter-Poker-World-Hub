/* ═══════════════════════════════════════════════════════════════════════════
   JARVIS MESSENGER WIDGET — Floating AI assistant in Messenger
   Provides quick poker advice and analysis within the chat context
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface JarvisMessengerWidgetProps {
    onMinimize?: () => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

const QUICK_ACTIONS = [
    { id: 'range', label: 'Opening Range', question: "What's the GTO opening range from the button?" },
    { id: 'odds', label: 'Pot Odds', question: "How do I calculate pot odds quickly?" },
    { id: 'cbet', label: 'C-Bet Size', question: "What's the optimal c-bet sizing on dry boards?" },
    { id: '3bet', label: '3-Bet Range', question: "What hands should I 3-bet from the blinds?" },
];

export function JarvisMessengerWidget({ onMinimize }: JarvisMessengerWidgetProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: "Hey! I'm Jarvis, your poker assistant. Ask me anything about strategy, hand analysis, or GTO concepts.",
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (content: string) => {
        if (!content.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: content.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/geeves/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    context: 'messenger-widget',
                    history: messages.slice(-6).map(m => ({
                        role: m.role,
                        content: m.content
                    }))
                })
            });

            const data = await response.json();

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response || data.message || "I'm having trouble processing that. Try asking again.",
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (error) {
            console.error('Jarvis chat error:', error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "Connection issue. Please try again.",
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickAction = (question: string) => {
        sendMessage(question);
    };

    // Collapsed State - Just the button
    if (!isExpanded) {
        return (
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => setIsExpanded(true)}
                style={{
                    position: 'fixed',
                    bottom: '80px',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(255, 215, 0, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}
            >
                <span style={{ fontSize: '24px' }}>🤖</span>
            </motion.button>
        );
    }

    // Expanded State - Chat Panel
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            style={{
                position: 'fixed',
                bottom: '80px',
                right: '20px',
                width: '340px',
                maxHeight: '500px',
                background: 'linear-gradient(145deg, #1a0a2e 0%, #0d0517 100%)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 1000
            }}
        >
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 165, 0, 0.1))',
                borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px'
                    }}>
                        🤖
                    </div>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFD700' }}>
                            Jarvis
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            Your Poker AI
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setIsExpanded(false)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '4px'
                    }}
                >
                    −
                </button>
            </div>

            {/* Quick Actions */}
            <div style={{
                padding: '8px 12px',
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                {QUICK_ACTIONS.map(action => (
                    <button
                        key={action.id}
                        onClick={() => handleQuickAction(action.question)}
                        style={{
                            padding: '4px 10px',
                            background: 'rgba(255, 215, 0, 0.1)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '12px',
                            color: 'rgba(255, 215, 0, 0.8)',
                            fontSize: '9px',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer'
                        }}
                    >
                        {action.label}
                    </button>
                ))}
            </div>

            {/* Messages */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            }}>
                {messages.map(message => (
                    <div
                        key={message.id}
                        style={{
                            alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%'
                        }}
                    >
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: message.role === 'user'
                                ? '14px 14px 4px 14px'
                                : '14px 14px 14px 4px',
                            background: message.role === 'user'
                                ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                : 'rgba(255, 255, 255, 0.08)',
                            color: message.role === 'user' ? '#000' : '#fff',
                            fontSize: '12px',
                            lineHeight: 1.5
                        }}>
                            {message.content}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div style={{
                        alignSelf: 'flex-start',
                        padding: '10px 14px',
                        borderRadius: '14px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '12px'
                    }}>
                        Thinking...
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{
                padding: '12px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                gap: '8px'
            }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage(input)}
                    placeholder="Ask Jarvis..."
                    style={{
                        flex: 1,
                        padding: '10px 14px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 215, 0, 0.2)',
                        borderRadius: '20px',
                        color: '#fff',
                        fontSize: '12px',
                        outline: 'none'
                    }}
                />
                <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isLoading}
                    style={{
                        padding: '10px 16px',
                        background: input.trim() && !isLoading
                            ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                            : 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '20px',
                        color: input.trim() && !isLoading ? '#000' : 'rgba(255, 255, 255, 0.3)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed'
                    }}
                >
                    Send
                </button>
            </div>
        </motion.div>
    );
}

export default JarvisMessengerWidget;
