/* ═══════════════════════════════════════════════════════════════════════════
   COMPACT MODE TOGGLE — Smaller panel for desktop users
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface CompactModeToggleProps {
    onModeChange?: (isCompact: boolean) => void;
}

export function CompactModeToggle({ onModeChange }: CompactModeToggleProps) {
    const [isCompact, setIsCompact] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('jarvis-compact-mode');
        if (saved === 'true') {
            setIsCompact(true);
        }
    }, []);

    const toggleMode = () => {
        const newMode = !isCompact;
        setIsCompact(newMode);
        localStorage.setItem('jarvis-compact-mode', String(newMode));
        onModeChange?.(newMode);
    };

    return (
        <button
            onClick={toggleMode}
            style={{
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
            }}
            title={`Switch to ${isCompact ? 'normal' : 'compact'} mode`}
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                {isCompact ? (
                    // Expand icon
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                ) : (
                    // Compress icon
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                )}
            </svg>
            {isCompact ? 'Normal' : 'Compact'}
        </button>
    );
}

export function getCompactStyles(isCompact: boolean) {
    if (isCompact) {
        return {
            width: 320,
            fontSize: 13,
            padding: 12,
            avatarSize: 32,
            inputPadding: '10px 14px'
        };
    }

    return {
        width: 420,
        fontSize: 14,
        padding: 16,
        avatarSize: 40,
        inputPadding: '12px 16px'
    };
}
