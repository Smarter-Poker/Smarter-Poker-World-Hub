/**
 * 🃏 POKER REPUTATION BADGES
 * src/app/social/components/PokerReputationBadges.jsx
 * 
 * Facebook-style badges with poker terminology and visual flair.
 * These appear on posts and profiles to show poker credibility.
 */

import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🃏 POKER TIER BADGES (Like Facebook Verified but Poker-themed)
// ═══════════════════════════════════════════════════════════════════════════

const POKER_TIERS = {
    fish: {
        name: 'Fish',
        icon: '🐟',
        color: '#6B7280',
        bgColor: 'rgba(107, 114, 128, 0.2)',
        description: 'Still learning the ropes'
    },
    reg: {
        name: 'Reg',
        icon: '♠️',
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.2)',
        description: 'Regular player'
    },
    grinder: {
        name: 'Grinder',
        icon: '💪',
        color: '#8B5CF6',
        bgColor: 'rgba(139, 92, 246, 0.2)',
        description: 'Puts in volume'
    },
    shark: {
        name: 'Shark',
        icon: '🦈',
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.2)',
        description: 'Watch out!'
    },
    whale: {
        name: 'Whale',
        icon: '🐋',
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.2)',
        description: 'High roller'
    },
    gto_master: {
        name: 'GTO Master',
        icon: '👑',
        color: '#FFD700',
        bgColor: 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(0, 255, 255, 0.2))',
        description: '85%+ Mastery Verified',
        animated: true
    }
};

export const PokerTierBadge = ({ tier = 'fish', size = 'md', showLabel = true }) => {
    const tierData = POKER_TIERS[tier] || POKER_TIERS.fish;

    const sizeClasses = {
        sm: { icon: '0.9rem', padding: '2px 6px', fontSize: '0.65rem' },
        md: { icon: '1.1rem', padding: '4px 10px', fontSize: '0.75rem' },
        lg: { icon: '1.4rem', padding: '6px 14px', fontSize: '0.85rem' }
    };

    const currentSize = sizeClasses[size];

    return (
        <div
            className={`poker-tier-badge ${tierData.animated ? 'animated' : ''}`}
            style={{
                '--tier-color': tierData.color,
                '--tier-bg': tierData.bgColor
            }}
        >
            <span className="tier-icon" style={{ fontSize: currentSize.icon }}>
                {tierData.icon}
            </span>
            {showLabel && (
                <span
                    className="tier-label"
                    style={{
                        padding: currentSize.padding,
                        fontSize: currentSize.fontSize
                    }}
                >
                    {tierData.name}
                </span>
            )}

            <style>{`
                .poker-tier-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: var(--tier-bg);
                    border: 1px solid var(--tier-color);
                    border-radius: 20px;
                    padding: 2px 8px;
                    color: var(--tier-color);
                    font-weight: 600;
                    white-space: nowrap;
                }

                .poker-tier-badge.animated {
                    animation: tier-shimmer 2s ease-in-out infinite;
                    box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
                }

                @keyframes tier-shimmer {
                    0%, 100% { 
                        box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
                        transform: scale(1);
                    }
                    50% { 
                        box-shadow: 0 0 25px rgba(255, 215, 0, 0.5);
                        transform: scale(1.02);
                    }
                }

                .tier-icon {
                    filter: drop-shadow(0 0 3px var(--tier-color));
                }

                .tier-label {
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// ♠️ HAND STRENGTH REACTION (Like Facebook Reactions but Poker-themed)
// ═══════════════════════════════════════════════════════════════════════════

const POKER_REACTIONS = {
    fold: { icon: '🃏', label: 'Fold', color: '#6B7280' },
    call: { icon: '✋', label: 'Call', color: '#3B82F6' },
    raise: { icon: '🔥', label: 'Raise', color: '#F59E0B' },
    allIn: { icon: '💎', label: 'All-In', color: '#8B5CF6' },
    nuts: { icon: '🥜', label: 'The Nuts!', color: '#22C55E' },
    cooler: { icon: '🧊', label: 'Cooler', color: '#06B6D4' }
};

export const PokerReactionBar = ({
    reactions = {},
    userReaction = null,
    onReact = () => { },
    compact = false
}) => {
    const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);

    return (
        <div className={`poker-reaction-bar ${compact ? 'compact' : ''}`}>
            <div className="reaction-buttons">
                {Object.entries(POKER_REACTIONS).map(([key, reaction]) => (
                    <button
                        key={key}
                        className={`reaction-btn ${userReaction === key ? 'active' : ''}`}
                        onClick={() => onReact(key)}
                        title={reaction.label}
                        style={{ '--reaction-color': reaction.color }}
                    >
                        <span className="reaction-icon">{reaction.icon}</span>
                        {!compact && reactions[key] > 0 && (
                            <span className="reaction-count">{reactions[key]}</span>
                        )}
                    </button>
                ))}
            </div>

            {totalReactions > 0 && (
                <div className="reaction-summary">
                    <span className="total-count">{totalReactions} reactions</span>
                </div>
            )}

            <style>{`
                .poker-reaction-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .reaction-buttons {
                    display: flex;
                    gap: 4px;
                }

                .reaction-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 6px 10px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid transparent;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    color: rgba(255, 255, 255, 0.7);
                }

                .reaction-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: scale(1.1);
                }

                .reaction-btn.active {
                    background: rgba(var(--reaction-color), 0.2);
                    border-color: var(--reaction-color);
                    color: var(--reaction-color);
                }

                .reaction-icon {
                    font-size: 1.1rem;
                }

                .reaction-count {
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .reaction-summary {
                    font-size: 0.8rem;
                    color: rgba(255, 255, 255, 0.5);
                }

                .compact .reaction-btn {
                    padding: 4px 6px;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 WIN RATE DISPLAY (Like Facebook Insights)
// ═══════════════════════════════════════════════════════════════════════════

export const WinRateDisplay = ({
    winRate = 0,
    handsPlayed = 0,
    profitLoss = 0,
    showDetails = true
}) => {
    const getWinRateColor = (rate) => {
        if (rate >= 60) return '#22C55E'; // Green - Crushing
        if (rate >= 52) return '#3B82F6'; // Blue - Winning
        if (rate >= 48) return '#F59E0B'; // Orange - Breaking even
        return '#EF4444'; // Red - Losing
    };

    const formatProfitLoss = (value) => {
        if (value >= 0) return `+$${value.toLocaleString()}`;
        return `-$${Math.abs(value).toLocaleString()}`;
    };

    return (
        <div className="winrate-display">
            <div className="winrate-main">
                <span
                    className="winrate-value"
                    style={{ color: getWinRateColor(winRate) }}
                >
                    {winRate.toFixed(1)}%
                </span>
                <span className="winrate-label">Win Rate</span>
            </div>

            {showDetails && (
                <div className="winrate-details">
                    <div className="detail-item">
                        <span className="detail-value">{handsPlayed.toLocaleString()}</span>
                        <span className="detail-label">Hands</span>
                    </div>
                    <div className="detail-item">
                        <span
                            className="detail-value"
                            style={{
                                color: profitLoss >= 0 ? '#22C55E' : '#EF4444'
                            }}
                        >
                            {formatProfitLoss(profitLoss)}
                        </span>
                        <span className="detail-label">P/L (Diamonds)</span>
                    </div>
                </div>
            )}

            <style>{`
                .winrate-display {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .winrate-main {
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                }

                .winrate-value {
                    font-size: 2rem;
                    font-weight: 700;
                    letter-spacing: -1px;
                }

                .winrate-label {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .winrate-details {
                    display: flex;
                    gap: 24px;
                }

                .detail-item {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .detail-value {
                    font-size: 1.1rem;
                    font-weight: 600;
                    color: white;
                }

                .detail-label {
                    font-size: 0.7rem;
                    color: rgba(255, 255, 255, 0.4);
                    text-transform: uppercase;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 🏆 ACHIEVEMENT BADGE (Like Facebook Badges)
// ═══════════════════════════════════════════════════════════════════════════

const POKER_ACHIEVEMENTS = {
    first_hand: { icon: '🃏', name: 'First Hand', rarity: 'common' },
    first_win: { icon: '🏆', name: 'Winner Winner', rarity: 'common' },
    streak_3: { icon: '🔥', name: '3-Day Streak', rarity: 'uncommon' },
    streak_7: { icon: '⚡', name: 'Week Warrior', rarity: 'rare' },
    royal_flush: { icon: '👑', name: 'Royal Flush', rarity: 'legendary' },
    bad_beat: { icon: '💔', name: 'Bad Beat Survivor', rarity: 'rare' },
    bluff_master: { icon: '🎭', name: 'Bluff Master', rarity: 'epic' },
    gto_certified: { icon: '🧠', name: 'GTO Certified', rarity: 'epic' },
    diamond_hands: { icon: '💎', name: 'Diamond Hands', rarity: 'legendary' }
};

const RARITY_COLORS = {
    common: { primary: '#6B7280', glow: 'rgba(107, 114, 128, 0.3)' },
    uncommon: { primary: '#22C55E', glow: 'rgba(34, 197, 94, 0.3)' },
    rare: { primary: '#3B82F6', glow: 'rgba(59, 130, 246, 0.3)' },
    epic: { primary: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.3)' },
    legendary: { primary: '#FFD700', glow: 'rgba(255, 215, 0, 0.3)' }
};

export const PokerAchievementBadge = ({ achievementId, earnedAt = null, showName = true }) => {
    const achievement = POKER_ACHIEVEMENTS[achievementId];
    if (!achievement) return null;

    const rarity = RARITY_COLORS[achievement.rarity];

    return (
        <div
            className={`achievement-badge rarity-${achievement.rarity}`}
            style={{
                '--rarity-color': rarity.primary,
                '--rarity-glow': rarity.glow
            }}
            title={`${achievement.name}${earnedAt ? ` • Earned ${new Date(earnedAt).toLocaleDateString()}` : ''}`}
        >
            <span className="achievement-icon">{achievement.icon}</span>
            {showName && <span className="achievement-name">{achievement.name}</span>}

            <style>{`
                .achievement-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid var(--rarity-color);
                    border-radius: 20px;
                    box-shadow: 0 0 15px var(--rarity-glow);
                }

                .achievement-badge.rarity-legendary {
                    animation: legendary-pulse 2s ease-in-out infinite;
                }

                @keyframes legendary-pulse {
                    0%, 100% {
                        box-shadow: 0 0 15px var(--rarity-glow);
                    }
                    50% {
                        box-shadow: 0 0 25px var(--rarity-glow), 0 0 40px var(--rarity-glow);
                    }
                }

                .achievement-icon {
                    font-size: 1.2rem;
                    filter: drop-shadow(0 0 5px var(--rarity-glow));
                }

                .achievement-name {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--rarity-color);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
            `}</style>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    PokerTierBadge,
    PokerReactionBar,
    WinRateDisplay,
    PokerAchievementBadge,
    POKER_TIERS,
    POKER_REACTIONS,
    POKER_ACHIEVEMENTS
};
