/* ═══════════════════════════════════════════════════════════════════════════
   JARVIS AVATAR — Animated avatar with pulse and glow effects
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
                    background: 'radial-gradient(circle, rgba(0, 212, 255, 0.4), transparent 70%)',
                    borderRadius: '50%',
                    animation: 'pulse 2s infinite'
                }} />
            )}

            {/* Avatar circle */}
            <div style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00d4ff, #0088ff)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.5,
                fontWeight: 700,
                color: '#fff',
                boxShadow: isTyping
                    ? '0 0 20px rgba(0, 212, 255, 0.6)'
                    : '0 2px 8px rgba(0, 0, 0, 0.2)',
                transition: 'box-shadow 0.3s ease',
                animation: isTyping ? 'avatarPulse 1.5s infinite' : 'none'
            }}>
                J
            </div>

            {/* Particle effects (optional) */}
            {isTyping && (
                <>
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                width: 4,
                                height: 4,
                                background: '#00d4ff',
                                borderRadius: '50%',
                                top: '50%',
                                left: '50%',
                                animation: `particle${i} 2s infinite`,
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
                @keyframes particle0 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(20px, -20px); opacity: 0; }
                }
                @keyframes particle1 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(-20px, -15px); opacity: 0; }
                }
                @keyframes particle2 {
                    0% { transform: translate(0, 0); opacity: 1; }
                    100% { transform: translate(0, -25px); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
