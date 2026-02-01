/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES AVATAR — Animated top hat avatar for poker expert
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

interface JarvisAvatarProps {
    isTyping?: boolean;
    size?: number;
}

export function JarvisAvatar({ isTyping = false, size = 40 }: JarvisAvatarProps) {
    return (
        <div style={{
            position: 'relative',
            width: size,
            height: size
        }}>
            {/* Glow effect when typing */}
            {isTyping && (
                <div style={{
                    position: 'absolute',
                    inset: -4,
                    background: 'radial-gradient(circle, rgba(255, 215, 0, 0.4), transparent 70%)',
                    borderRadius: '50%',
                    animation: 'pulse 2s infinite'
                }} />
            )}

            {/* Avatar circle with top hat */}
            <div style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.6,
                color: '#000',
                boxShadow: isTyping
                    ? '0 0 20px rgba(255, 215, 0, 0.6)'
                    : '0 2px 8px rgba(0, 0, 0, 0.3)',
                transition: 'box-shadow 0.3s ease',
                animation: isTyping ? 'avatarPulse 1.5s infinite' : 'none',
                fontWeight: 700
            }}>
                🎩
            </div>

            {/* Sparkle effects when typing */}
            {isTyping && (
                <>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                width: 4,
                                height: 4,
                                background: '#FFD700',
                                borderRadius: '50%',
                                top: '50%',
                                left: '50%',
                                animation: `sparkle${i} 2s infinite`,
                                animationDelay: `${i * 0.3}s`
                            }}
                        />
                    ))}
                </>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.6; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
                @keyframes avatarPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes sparkle0 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(20px, -20px); opacity: 0; }
                }
                @keyframes sparkle1 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(-20px, -15px); opacity: 0; }
                }
                @keyframes sparkle2 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(0, -25px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
