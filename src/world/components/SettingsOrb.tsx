/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS ORB — Gear icon for Settings page navigation
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

interface SettingsOrbProps {
    onClick: () => void;
    size?: number;
}

export function SettingsOrb({ onClick, size = 48 }: SettingsOrbProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [glowOpacity, setGlowOpacity] = useState(0.3);
    const [rotation, setRotation] = useState(0);

    // Gentle pulsing glow like other orbs
    useEffect(() => {
        let animFrame: number;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const pulse = (Math.sin(elapsed * 0.5) + 1) / 2;
            setGlowOpacity(0.2 + pulse * 0.3);

            // Slow rotation on hover
            if (isHovered) {
                setRotation(prev => prev + 0.5);
            }

            animFrame = requestAnimationFrame(animate);
        };

        animate();
        return () => cancelAnimationFrame(animFrame);
    }, [isHovered]);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(60, 60, 70, 0.8), rgba(40, 40, 50, 0.9))',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'transform 0.2s ease-out',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                boxShadow: `
                    0 0 ${8 + glowOpacity * 12}px rgba(150, 150, 170, ${glowOpacity}),
                    0 4px 16px rgba(0, 0, 0, 0.4)
                `,
                flexShrink: 0,
            }}
            title="Settings"
        >
            <svg
                width={size * 0.45}
                height={size * 0.45}
                viewBox="0 0 24 24"
                fill="none"
                stroke={isHovered ? '#00d4ff' : '#ffffff'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    transition: 'transform 0.1s ease-out',
                    transform: `rotate(${rotation}deg)`,
                }}
            >
                {/* Gear icon */}
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
        </button>
    );
}

export default SettingsOrb;
