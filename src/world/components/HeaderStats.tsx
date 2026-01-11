/* ═══════════════════════════════════════════════════════════════════════════
   HEADER STATS — Inline Diamond and XP displays for top bar
   Both bars have same height (32px) and font size (13px)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 📊 MOCK USER DATA (Replace with real data from store/API)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_USER_STATS = {
    diamonds: 12450,
    xp: 8750,
    level: 12,
    streak: 7,
    streakMultiplier: 1.5,
};

// Shared bar height for consistency
const BAR_HEIGHT = 32;
const FONT_SIZE = 13;

// ─────────────────────────────────────────────────────────────────────────────
// 💎 DIAMOND STAT — With + button to buy more
// ─────────────────────────────────────────────────────────────────────────────
interface DiamondStatProps {
    onBuyClick?: () => void;
}

export function DiamondStat({ onBuyClick }: DiamondStatProps) {
    const [count] = useState(MOCK_USER_STATS.diamonds);
    const [isPlusHovered, setIsPlusHovered] = useState(false);

    const handleBuyClick = () => {
        console.log('Buy diamonds clicked');
        onBuyClick?.();
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 8px 0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.4)',
            }}
        >
            <span style={{ fontSize: 16 }}>💎</span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#00d4ff',
                }}
            >
                {count.toLocaleString()}
            </span>
            {/* + Button to buy more */}
            <button
                onClick={handleBuyClick}
                onMouseEnter={() => setIsPlusHovered(true)}
                onMouseLeave={() => setIsPlusHovered(false)}
                style={{
                    width: 22,
                    height: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isPlusHovered
                        ? 'rgba(0, 212, 255, 0.3)'
                        : 'rgba(0, 212, 255, 0.15)',
                    border: '1px solid rgba(0, 212, 255, 0.5)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: isPlusHovered ? 'scale(1.1)' : 'scale(1)',
                    padding: 0,
                    marginLeft: 2,
                }}
                title="Buy Diamonds"
            >
                <span
                    style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#00d4ff',
                        lineHeight: 1,
                    }}
                >
                    +
                </span>
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⬆️ XP STAT — Shows "XP: total • LV level" (same height as Diamond)
// ─────────────────────────────────────────────────────────────────────────────
export function XPStat() {
    const { xp, level } = MOCK_USER_STATS;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.4)',
            }}
        >
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255, 255, 255, 0.6)',
                    textTransform: 'uppercase',
                }}
            >
                XP
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#00d4ff',
                }}
            >
                {xp.toLocaleString()}
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                }}
            >
                •
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: '#ffffff',
                }}
            >
                LV {level}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 STREAK STAT (kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export function StreakStat() {
    const { streak, streakMultiplier } = MOCK_USER_STATS;
    const [isFlaming, setIsFlaming] = useState(false);

    useEffect(() => {
        if (streak >= 5) {
            const interval = setInterval(() => setIsFlaming(prev => !prev), 600);
            return () => clearInterval(interval);
        }
    }, [streak]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: BAR_HEIGHT,
                padding: '0 14px',
                background: 'rgba(0, 20, 40, 0.6)',
                borderRadius: 20,
                border: `1px solid ${streak >= 5 ? 'rgba(255, 100, 0, 0.5)' : 'rgba(0, 212, 255, 0.4)'}`,
            }}
        >
            <span
                style={{
                    fontSize: 16,
                    transform: isFlaming ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.3s ease',
                }}
            >
                🔥
            </span>
            <span
                style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: FONT_SIZE,
                    fontWeight: 600,
                    color: streak >= 5 ? '#ff6600' : '#00d4ff',
                }}
            >
                {streak}
            </span>
            {streakMultiplier > 1 && (
                <span
                    style={{
                        fontFamily: 'Orbitron, monospace',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#00ff88',
                    }}
                >
                    {streakMultiplier}x
                </span>
            )}
        </div>
    );
}
