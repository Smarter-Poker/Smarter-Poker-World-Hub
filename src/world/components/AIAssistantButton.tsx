/* ═══════════════════════════════════════════════════════════════════════════
   AI ASSISTANT BUTTON — Opens Live Help panel
   Subtle, non-intrusive, always available
   Matching site aesthetics with cyber/poker theme
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

interface AIAssistantButtonProps {
    onClick?: () => void;
}

export function AIAssistantButton({ onClick }: AIAssistantButtonProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [glowIntensity, setGlowIntensity] = useState(0.3);

    // Subtle pulsing glow animation
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pulse = (Math.sin(elapsed * 1.5) + 1) / 2;
            setGlowIntensity(0.2 + pulse * 0.4);
            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, []);

    const handleClick = () => {
        onClick?.();
    };

    return (
        <div
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                position: 'relative',
            }}
        >
            {/* Expanded Label */}
            <div
                style={{
                    padding: '8px 14px',
                    background: 'rgba(0, 20, 40, 0.8)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 20,
                    border: '1px solid rgba(0, 212, 255, 0.4)',
                    opacity: isExpanded ? 1 : 0,
                    transform: isExpanded ? 'translateX(0)' : 'translateX(10px)',
                    transition: 'all 0.3s ease',
                    pointerEvents: isExpanded ? 'auto' : 'none',
                }}
            >
                <span
                    style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#00d4ff',
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}
                >
                    Live Help
                </span>
            </div>

            {/* Main Button */}
            <button
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{
                    width: 56,
                    height: 56,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(0, 60, 120, 0.9), rgba(0, 30, 80, 0.95))',
                    border: '2px solid rgba(0, 212, 255, 0.6)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: `
                        0 0 ${15 + glowIntensity * 20}px rgba(0, 212, 255, ${glowIntensity}),
                        0 4px 20px rgba(0, 0, 0, 0.4),
                        inset 0 0 20px rgba(0, 212, 255, 0.1)
                    `,
                    position: 'relative',
                }}
                title="Live Help — Get Expert Assistance"
            >
                {/* Brain/Chat Icon */}
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isHovered ? '#00ffff' : '#00d4ff'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        filter: `drop-shadow(0 0 ${isHovered ? '8px' : '4px'} rgba(0, 212, 255, 0.6))`,
                        transition: 'filter 0.3s ease',
                    }}
                >
                    {/* Chat bubble with person */}
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="10" r="3" fill="#00d4ff" opacity="0.3" />
                    <path d="M9 10h.01M12 10h.01M15 10h.01" strokeWidth="2" />
                </svg>
            </button>

            {/* Pulse ring animation */}
            <div
                style={{
                    position: 'absolute',
                    right: 0,
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: '2px solid rgba(0, 212, 255, 0.3)',
                    animation: 'assistantPulse 2s ease-out infinite',
                    pointerEvents: 'none',
                }}
            />

            {/* Keyframes for pulse */}
            <style>{`
                @keyframes assistantPulse {
                    0% {
                        transform: scale(1);
                        opacity: 0.6;
                    }
                    100% {
                        transform: scale(1.5);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}

export default AIAssistantButton;
