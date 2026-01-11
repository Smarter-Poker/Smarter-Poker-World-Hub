/* ═══════════════════════════════════════════════════════════════════════════
   AUDIO CONTROLS — Sound/Music toggle for World Hub
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 🔊 AUDIO CONTROLS COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function AudioControls() {
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleMute = () => setIsMuted(!isMuted);

    return (
        <div
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(10px)',
                borderRadius: 20,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.3s ease',
            }}
        >
            {/* Mute/Unmute Button */}
            <button
                onClick={toggleMute}
                style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    borderRadius: '50%',
                    transition: 'background 0.2s ease',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isMuted ? '#ff4444' : '#ffffff'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    {isMuted ? (
                        <>
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <line x1="23" y1="9" x2="17" y2="15" />
                            <line x1="17" y1="9" x2="23" y2="15" />
                        </>
                    ) : (
                        <>
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </>
                    )}
                </svg>
            </button>

            {/* Volume Slider (shown on hover) */}
            {isExpanded && (
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (val > 0 && isMuted) setIsMuted(false);
                        if (val === 0) setIsMuted(true);
                    }}
                    style={{
                        width: 80,
                        height: 4,
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        background: `linear-gradient(to right, #00d4ff ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`,
                        borderRadius: 2,
                        cursor: 'pointer',
                    }}
                />
            )}
        </div>
    );
}

export default AudioControls;
