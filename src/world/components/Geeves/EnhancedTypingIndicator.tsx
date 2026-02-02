/* ═══════════════════════════════════════════════════════════════════════════
   ENHANCED TYPING INDICATOR — Shows Jarvis thinking with rotating messages
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

const THINKING_MESSAGES = [
    "Jarvis is thinking...",
    "Searching knowledge base...",
    "Analyzing your question...",
    "Preparing response..."
];

export function EnhancedTypingIndicator() {
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
        }, 2000); // Rotate every 2 seconds

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: 'rgba(0, 212, 255, 0.05)',
            borderRadius: '12px',
            border: '1px solid rgba(0, 212, 255, 0.2)'
        }}>
            {/* Animated dots */}
            <div style={{
                display: 'flex',
                gap: '4px'
            }}>
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#00d4ff',
                            animation: `bounce 1.4s infinite ease-in-out`,
                            animationDelay: `${i * 0.16}s`
                        }}
                    />
                ))}
            </div>

            {/* Rotating message */}
            <span style={{
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontStyle: 'italic',
                transition: 'opacity 0.3s ease',
                opacity: 1
            }}>
                {THINKING_MESSAGES[messageIndex]}
            </span>

            <style jsx>{`
                @keyframes bounce {
                    0%, 80%, 100% {
                        transform: scale(0);
                        opacity: 0.5;
                    }
                    40% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
