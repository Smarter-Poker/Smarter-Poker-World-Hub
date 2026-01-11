/* ═══════════════════════════════════════════════════════════════════════════
   FULLSCREEN TOGGLE — Button to enter/exit fullscreen mode
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🖥️ FULLSCREEN TOGGLE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function FullscreenToggle() {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // Sync state with actual fullscreen status
    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
        }
    }, []);

    return (
        <button
            onClick={toggleFullscreen}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isHovered
                    ? 'rgba(0, 212, 255, 0.2)'
                    : 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isHovered ? 'scale(1.05)' : 'scale(1)',
            }}
            title={isFullscreen ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
        >
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isHovered ? '#00d4ff' : '#ffffff'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {isFullscreen ? (
                    // Minimize icon
                    <>
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                ) : (
                    // Maximize icon
                    <>
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                )}
            </svg>
        </button>
    );
}

export default FullscreenToggle;
