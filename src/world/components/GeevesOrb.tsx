/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES ORB — Header orb that opens the Geeves Live Help panel
   Shows "Geeves" text (renamed from Jarvis per user request)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';

interface GeevesOrbProps {
    onClick?: () => void;
    size?: number;
}

export function GeevesOrb({ onClick, size = 48 }: GeevesOrbProps) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="Ask Geeves"
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(0, 60, 120, 0.8), rgba(0, 30, 80, 0.9))',
                border: '2px solid rgba(0, 212, 255, 0.5)',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                boxShadow: isHovered
                    ? '0 0 20px rgba(0, 212, 255, 0.5), inset 0 0 15px rgba(0, 212, 255, 0.2)'
                    : '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 0 10px rgba(0, 212, 255, 0.1)',
                padding: 0,
            }}
        >
            <span
                style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 11,
                    fontWeight: 700,
                    color: isHovered ? '#00ffff' : '#00d4ff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    filter: isHovered ? 'drop-shadow(0 0 6px rgba(0, 212, 255, 0.8))' : 'none',
                    transition: 'all 0.3s ease',
                }}
            >
                Geeves
            </span>
        </button>
    );
}

// Legacy alias for backward compatibility
export const LiveHelpOrb = GeevesOrb;
export default GeevesOrb;

