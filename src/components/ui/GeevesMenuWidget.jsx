/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES MENU WIDGET — Compact inline chat for HamburgerMenu
   
   A self-contained mini-chat that lives inside every hamburger menu
   across the platform. Uses /api/geeves/chat for lightweight responses.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── Auth helper (SSR-safe) ───
function getAuthToken() {
    if (typeof window === 'undefined') return null;
    try {
        const keys = ['smarter-poker-auth', 'smarter_poker_auth', 'sp_auth'];
        for (const key of keys) {
            const authData = localStorage.getItem(key);
            if (authData) {
                const parsed = JSON.parse(authData);
                return parsed?.access_token || null;
            }
        }
    } catch { }
    return null;
}

export default function GeevesMenuWidget() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // Focus input on expand
    useEffect(() => {
        if (isExpanded) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isExpanded]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text) return;

        // Add user message
        setMessages(prev => [...prev, { id: Date.now(), content: text, isUser: true }]);
        setInput('');
        setIsTyping(true);

        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch('/api/geeves/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) throw new Error('Failed');

            const data = await response.json();
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                content: data.response || data.message || data.reply || data.answer || 'I had trouble with that. Try again!',
                isUser: false
            }]);
        } catch {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                content: "I'm having trouble connecting. Please try again in a moment.",
                isUser: false
            }]);
        } finally {
            setIsTyping(false);
        }
    }, [input]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Context-aware quick questions based on current page ──
    const getQuickQuestions = useCallback(() => {
        if (typeof window === 'undefined') return ['What is GTO?', 'Help with bankroll', 'How to use this app?'];
        const path = window.location.pathname.toLowerCase();

        if (path.includes('toke-tracker')) return [
            'How do I track my downs?',
            'What are typical toke rates?',
            'How is EHR calculated?',
        ];
        if (path.includes('gto') || path.includes('training') || path.includes('arena')) return [
            'What is GTO strategy?',
            'How do I read range charts?',
            'Explain bet sizing theory',
        ];
        if (path.includes('trivia')) return [
            'Tips for poker trivia',
            'Help with hand rankings',
            'What beats a flush?',
        ];
        if (path.includes('bankroll')) return [
            'How much bankroll do I need?',
            'Explain bankroll management',
            'What is proper buy-in sizing?',
        ];
        if (path.includes('tournament') || path.includes('commander')) return [
            'Explain ICM pressure',
            'Tips for final table play',
            'Short stack push/fold ranges',
        ];
        if (path.includes('sandbox')) return [
            'Analyze my hand setup',
            'Explain pot odds calculation',
            'What is equity realization?',
        ];
        // Default
        return ['What is GTO?', 'Help with bankroll', 'How to use this app?'];
    }, []);

    const quickQuestions = getQuickQuestions();

    // Direct send for quick questions (avoids stale closure from useCallback on input)
    const sendQuickQuestion = useCallback(async (text) => {
        setMessages(prev => [...prev, { id: Date.now(), content: text, isUser: true }]);
        setIsTyping(true);

        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch('/api/geeves/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) throw new Error('Failed');

            const data = await response.json();
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                content: data.response || data.message || 'I had trouble with that. Try again!',
                isUser: false
            }]);
        } catch {
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                content: "I'm having trouble connecting. Please try again in a moment.",
                isUser: false
            }]);
        } finally {
            setIsTyping(false);
        }
    }, []);

    return (
        <div style={{
            margin: '12px 16px',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            background: 'linear-gradient(180deg, rgba(0, 30, 60, 0.9) 0%, rgba(0, 20, 40, 0.95) 100%)',
            transition: 'all 0.3s ease',
        }}>
            {/* Header — Always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#fff',
                }}
            >
                <img
                    src="/images/geeves-avatar.png"
                    alt="Geeves"
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid rgba(0, 212, 255, 0.5)',
                        boxShadow: '0 0 8px rgba(0, 212, 255, 0.2)',
                    }}
                />
                <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "'Rajdhani', 'Inter', sans-serif",
                        letterSpacing: '0.04em',
                    }}>
                        Ask Geeves
                    </div>
                    <div style={{
                        fontSize: 11,
                        color: 'rgba(0, 212, 255, 0.7)',
                        fontFamily: 'Inter, sans-serif',
                    }}>
                        Your AI Help Assistant
                    </div>
                </div>
                <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#10b981',
                    boxShadow: '0 0 6px #10b981',
                }} />
                <span style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.5)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                }}>
                    ▼
                </span>
            </button>

            {/* Expandable Chat Body */}
            <div style={{
                maxHeight: isExpanded ? 320 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease',
            }}>
                {/* Messages Area */}
                <div style={{
                    height: 200,
                    overflowY: 'auto',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {messages.length === 0 && (
                        <div style={{
                            padding: '16px 0 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                        }}>
                            <div style={{
                                fontSize: 12,
                                color: 'rgba(255,255,255,0.4)',
                                marginBottom: 4,
                            }}>
                                Quick questions:
                            </div>
                            {quickQuestions.map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendQuickQuestion(q)}
                                    style={{
                                        padding: '8px 12px',
                                        background: 'rgba(0, 212, 255, 0.08)',
                                        border: '1px solid rgba(0, 212, 255, 0.15)',
                                        borderRadius: 8,
                                        color: 'rgba(255,255,255,0.8)',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 212, 255, 0.08)'}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {messages.map(msg => (
                        <div
                            key={msg.id}
                            style={{
                                alignSelf: msg.isUser ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                padding: '8px 12px',
                                borderRadius: msg.isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                background: msg.isUser
                                    ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                                    : 'rgba(0, 212, 255, 0.1)',
                                border: msg.isUser ? 'none' : '1px solid rgba(0, 212, 255, 0.15)',
                                fontSize: 13,
                                color: '#fff',
                                lineHeight: 1.4,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {msg.content}
                        </div>
                    ))}

                    {isTyping && (
                        <div style={{
                            alignSelf: 'flex-start',
                            padding: '8px 12px',
                            borderRadius: '12px 12px 12px 2px',
                            background: 'rgba(0, 212, 255, 0.1)',
                            border: '1px solid rgba(0, 212, 255, 0.15)',
                            display: 'flex',
                            gap: 4,
                        }}>
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: '50%',
                                        background: 'rgba(0, 212, 255, 0.6)',
                                        animation: `geevesTypingDot 1s ease-in-out ${i * 0.15}s infinite`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{
                    padding: '8px 12px 12px',
                    display: 'flex',
                    gap: 8,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything..."
                        style={{
                            flex: 1,
                            padding: '8px 14px',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 20,
                            color: '#fff',
                            fontSize: 13,
                            outline: 'none',
                            fontFamily: 'Inter, sans-serif',
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        style={{
                            width: 36,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: input.trim()
                                ? 'linear-gradient(135deg, #00d4ff, #0088ff)'
                                : 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '50%',
                            cursor: input.trim() ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Typing animation keyframes */}
            <style jsx global>{`
                @keyframes geevesTypingDot {
                    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
                    30% { opacity: 1; transform: translateY(-3px); }
                }
            `}</style>
        </div>
    );
}
