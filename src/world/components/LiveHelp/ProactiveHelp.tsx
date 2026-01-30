/* ═══════════════════════════════════════════════════════════════════════════
   PROACTIVE HELP — Subtle help prompts based on user behavior
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface ProactiveHelpProps {
    onAccept: (suggestion: string) => void;
    onDismiss: () => void;
}

export function ProactiveHelp({ onAccept, onDismiss }: ProactiveHelpProps) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [suggestion, setSuggestion] = useState('');
    const [inactivityTimer, setInactivityTimer] = useState<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Track user inactivity
        let timer: NodeJS.Timeout;

        const resetTimer = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                // After 30 seconds of inactivity, show help
                const suggestions = [
                    'Need help navigating? I can guide you!',
                    'Looking for something specific? Ask me!',
                    'Having trouble? I\'m here to help!',
                    'Want a quick tour of this page?'
                ];
                const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
                setSuggestion(randomSuggestion);
                setShowPrompt(true);
            }, 30000); // 30 seconds
        };

        // Reset timer on user activity
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, resetTimer);
        });

        resetTimer();

        return () => {
            if (timer) clearTimeout(timer);
            events.forEach(event => {
                document.removeEventListener(event, resetTimer);
            });
        };
    }, []);

    if (!showPrompt) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '100px',
            right: '24px',
            maxWidth: '300px',
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.95), rgba(0, 136, 255, 0.95))',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            zIndex: 150,
            animation: 'slideInUp 0.4s ease-out'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span style={{ fontSize: '20px' }}>💡</span>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#fff'
                    }}>
                        Jarvis Here!
                    </span>
                </div>
                <button
                    onClick={() => {
                        setShowPrompt(false);
                        onDismiss();
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: 0,
                        width: '20px',
                        height: '20px',
                        opacity: 0.7
                    }}
                >
                    ×
                </button>
            </div>

            <p style={{
                fontSize: '14px',
                color: '#fff',
                margin: '0 0 12px 0',
                lineHeight: 1.4
            }}>
                {suggestion}
            </p>

            <div style={{
                display: 'flex',
                gap: '8px'
            }}>
                <button
                    onClick={() => {
                        setShowPrompt(false);
                        onAccept(suggestion);
                    }}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#0088ff',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Yes, Help Me!
                </button>
                <button
                    onClick={() => {
                        setShowPrompt(false);
                        onDismiss();
                    }}
                    style={{
                        padding: '8px 16px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    No Thanks
                </button>
            </div>

            <style jsx>{`
                @keyframes slideInUp {
                    from {
                        transform: translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
