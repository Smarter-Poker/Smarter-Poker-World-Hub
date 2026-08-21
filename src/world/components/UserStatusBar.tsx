/* ═══════════════════════════════════════════════════════════════════════════
   USER STATUS BAR — Diamond Balance, Tier, Daily Streak
   Displays key user stats in a sleek horizontal bar
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 📊 DEFAULT USER STATS (Replace with real data from store/API)
// Streak defaults to 0 (no fake streak data)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_USER_STATS = {
    diamonds: 300,
    diamonds_earned: 50,
    level: 1,
    tier: 'Bronze',
    streak: 0,          // Default to 0 (no fake streak)
    streakMultiplier: 1.0,
    xpToday: 0,
};

// Tier colors and icons
const TIER_CONFIG: Record<string, { color: string; icon: string }> = {
    Bronze: { color: '#cd7f32', icon: '🥉' },
    Silver: { color: '#c0c0c0', icon: '🥈' },
    Gold: { color: '#ffd700', icon: '🥇' },
    Platinum: { color: '#e5e4e2', icon: '<img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/>' },
    Diamond: { color: '#00d4ff', icon: '💠' },
};

// ─────────────────────────────────────────────────────────────────────────────
// <img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> DIAMOND DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function DiamondDisplay({ count }: { count: number }) {
    const [displayCount, setDisplayCount] = useState(count);
    const [isAnimating, setIsAnimating] = useState(false);

    // Animate count changes
    useEffect(() => {
        if (count !== displayCount) {
            setIsAnimating(true);
            const diff = count - displayCount;
            const step = Math.ceil(Math.abs(diff) / 20);
            const interval = setInterval(() => {
                setDisplayCount(prev => {
                    if (Math.abs(count - prev) <= step) {
                        clearInterval(interval);
                        setIsAnimating(false);
                        return count;
                    }
                    return prev + (diff > 0 ? step : -step);
                });
            }, 30);
            return () => clearInterval(interval);
        }
    }, [count, displayCount]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'linear-gradient(135deg, rgba(0, 180, 255, 0.15), rgba(0, 100, 180, 0.25))',
                borderRadius: 20,
                border: '1px solid rgba(0, 212, 255, 0.3)',
                boxShadow: isAnimating ? '0 0 12px rgba(0, 212, 255, 0.5)' : 'none',
                transition: 'box-shadow 0.3s ease',
            }}
        >
            <span style={{ fontSize: 18 }}><img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/></span>
            <span
                style={{
                    fontFamily: 'Rajdhani, monospace',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#00d4ff',
                    textShadow: '0 0 8px rgba(0, 212, 255, 0.5)',
                }}
            >
                {displayCount.toLocaleString()}
            </span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⬆️ TIER DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function TierDisplay({ level, tier }: { level: number; tier: string }) {
    const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.Bronze;
    const progress = ((level % 12) / 12) * 100;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: `linear-gradient(135deg, rgba(${tier === 'Diamond' ? '0, 180, 255' : '255, 215, 0'}, 0.1), rgba(0, 0, 0, 0.3))`,
                borderRadius: 20,
                border: `1px solid ${tierConfig.color}40`,
            }}
        >
            <span style={{ fontSize: 16 }}>{tierConfig.icon}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                        style={{
                            fontFamily: 'Rajdhani, monospace',
                            fontSize: 12,
                            fontWeight: 700,
                            color: tierConfig.color,
                            textTransform: 'uppercase',
                        }}
                    >
                        {tier}
                    </span>
                    <span
                        style={{
                            fontFamily: 'Rajdhani, monospace',
                            fontSize: 11,
                            color: 'rgba(255, 255, 255, 0.7)',
                        }}
                    >
                        LV {level}
                    </span>
                </div>
                {/* Level Progress bar */}
                <div
                    style={{
                        width: 60,
                        height: 3,
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: 2,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: `linear-gradient(90deg, ${tierConfig.color}, ${tierConfig.color}cc)`,
                            transition: 'width 0.5s ease',
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 STREAK DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function StreakDisplay({ streak, multiplier }: { streak: number; multiplier: number }) {
    const [isFlaming, setIsFlaming] = useState(false);

    // Flame animation on high streaks
    useEffect(() => {
        if (streak >= 5) {
            const interval = setInterval(() => {
                setIsFlaming(prev => !prev);
            }, 500);
            return () => clearInterval(interval);
        }
    }, [streak]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: streak >= 5
                    ? 'linear-gradient(135deg, rgba(255, 100, 0, 0.2), rgba(255, 50, 0, 0.3))'
                    : 'linear-gradient(135deg, rgba(255, 150, 0, 0.1), rgba(0, 0, 0, 0.3))',
                borderRadius: 20,
                border: `1px solid ${streak >= 5 ? 'rgba(255, 100, 0, 0.5)' : 'rgba(255, 150, 0, 0.3)'}`,
                boxShadow: isFlaming ? '0 0 15px rgba(255, 100, 0, 0.4)' : 'none',
                transition: 'box-shadow 0.3s ease',
            }}
        >
            <span
                style={{
                    fontSize: 18,
                    transform: isFlaming ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.3s ease',
                }}
            >
                🔥
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span
                    style={{
                        fontFamily: 'Rajdhani, monospace',
                        fontSize: 14,
                        fontWeight: 700,
                        color: streak >= 5 ? '#ff6600' : '#ffaa00',
                    }}
                >
                    {streak} Day{streak !== 1 ? 's' : ''}
                </span>
                {multiplier > 1 && (
                    <span
                        style={{
                            fontFamily: 'Rajdhani, monospace',
                            fontSize: 10,
                            color: '#00ff88',
                        }}
                    >
                        {multiplier}x Bonus
                    </span>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📈 MAIN STATUS BAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function UserStatusBar() {
    const stats = MOCK_USER_STATS; // TODO: Replace with real store

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(10px)',
                borderRadius: 30,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
        >
            <DiamondDisplay count={stats.diamonds} />
            <TierDisplay level={stats.level} tier={stats.tier} />
            <StreakDisplay streak={stats.streak} multiplier={stats.streakMultiplier} />
        </div>
    );
}

export default UserStatusBar;
