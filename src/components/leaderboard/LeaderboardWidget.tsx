/**
 * 🏆 LEADERBOARD WIDGET - The Glory Board
 * 
 * Competitive rankings to drive engagement:
 * - Daily Grinder: Most hands played today
 * - Sharpshooter: Highest accuracy (min 50 hands)
 * - Whale Hunter: Most diamonds earned this week
 * 
 * Friends are pinned to top for rivalry!
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type LeaderboardCategory = 'daily_grinder' | 'sharpshooter' | 'whale_hunter';

export interface LeaderboardEntry {
    rank: number;
    playerId: string;
    playerName: string;
    avatarUrl: string;
    value: number;
    isFriend: boolean;
    isCurrentUser: boolean;
    trend?: 'up' | 'down' | 'stable';
}

interface LeaderboardData {
    daily_grinder: LeaderboardEntry[];
    sharpshooter: LeaderboardEntry[];
    whale_hunter: LeaderboardEntry[];
}

interface LeaderboardWidgetProps {
    isExpanded?: boolean;
    data: LeaderboardData;
    onToggleExpand?: () => void;
    currentUserId: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_CONFIG: Record<LeaderboardCategory, {
    label: string;
    emoji: string;
    unit: string;
    color: string;
    description: string;
}> = {
    daily_grinder: {
        label: 'Daily Grinder',
        emoji: '🔥',
        unit: 'hands',
        color: '#f59e0b',
        description: 'Most hands played today'
    },
    sharpshooter: {
        label: 'Sharpshooter',
        emoji: '🎯',
        unit: '%',
        color: '#22c55e',
        description: 'Highest accuracy (min 50 hands)'
    },
    whale_hunter: {
        label: 'Whale Hunter',
        emoji: '💎',
        unit: 'diamonds',
        color: '#00d4ff',
        description: 'Most diamonds this week'
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

export function generateMockLeaderboard(currentUserId: string, friendIds: string[]): LeaderboardData {
    const names = [
        'PokerShark99', 'BluffMaster', 'TheNit', 'AgressoKing',
        'CoolPlayer42', 'AceHunter', 'ChipStacker', 'RiverRat',
        'StackCrusher', 'BetBig123', 'FoldEquity', 'ValueTown'
    ];

    const generateEntries = (maxValue: number, isPercent: boolean = false): LeaderboardEntry[] => {
        return names.map((name, i) => {
            const playerId = `player_${i}`;
            const baseValue = isPercent
                ? 95 - (i * 3) + Math.random() * 2
                : maxValue - (i * Math.floor(maxValue / 15)) + Math.floor(Math.random() * 50);

            return {
                rank: i + 1,
                playerId,
                playerName: playerId === currentUserId ? 'You' : name,
                avatarUrl: `/avatars/avatar${(i % 10) + 1}.png`,
                value: Math.max(0, Math.floor(baseValue * 10) / 10),
                isFriend: friendIds.includes(playerId),
                isCurrentUser: playerId === currentUserId,
                trend: Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable'
            };
        }).sort((a, b) => b.value - a.value)
            .map((entry, i) => ({ ...entry, rank: i + 1 }));
    };

    return {
        daily_grinder: generateEntries(500),
        sharpshooter: generateEntries(95, true),
        whale_hunter: generateEntries(10000)
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function LeaderboardWidget({
    isExpanded = false,
    data,
    onToggleExpand,
    currentUserId
}: LeaderboardWidgetProps) {
    const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>('daily_grinder');

    const currentData = data[activeCategory];
    const config = CATEGORY_CONFIG[activeCategory];

    // Sort with friends at top, then by rank
    const sortedData = useMemo(() => {
        const friends = currentData.filter(e => e.isFriend || e.isCurrentUser);
        const others = currentData.filter(e => !e.isFriend && !e.isCurrentUser);
        return [...friends.slice(0, 3), ...others.slice(0, isExpanded ? 10 : 5)];
    }, [currentData, isExpanded]);

    return (
        <motion.div
            layout
            style={{
                background: 'linear-gradient(135deg, rgba(20,20,40,0.95), rgba(10,10,30,0.95))',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                overflow: 'hidden',
                width: isExpanded ? '350px' : '300px'
            }}
        >
            {/* Header */}
            <div style={{
                padding: '16px',
                background: `linear-gradient(135deg, ${config.color}22, transparent)`,
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        margin: 0,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        🏆 Glory Board
                    </h3>
                    <p style={{
                        fontSize: '11px',
                        color: '#888',
                        margin: '4px 0 0'
                    }}>
                        {config.description}
                    </p>
                </div>
                {onToggleExpand && (
                    <button
                        onClick={onToggleExpand}
                        style={{
                            width: '28px',
                            height: '28px',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        {isExpanded ? '−' : '+'}
                    </button>
                )}
            </div>

            {/* Category Tabs */}
            <div style={{
                display: 'flex',
                gap: '4px',
                padding: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <button
                        key={key}
                        onClick={() => setActiveCategory(key as LeaderboardCategory)}
                        style={{
                            flex: 1,
                            padding: '8px 4px',
                            background: activeCategory === key
                                ? `${cfg.color}22`
                                : 'transparent',
                            border: activeCategory === key
                                ? `1px solid ${cfg.color}`
                                : '1px solid transparent',
                            borderRadius: '8px',
                            color: activeCategory === key ? cfg.color : '#666',
                            fontSize: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title={cfg.label}
                    >
                        {cfg.emoji}
                    </button>
                ))}
            </div>

            {/* Rankings */}
            <div style={{ padding: '8px 12px 16px' }}>
                <AnimatePresence mode="popLayout">
                    {sortedData.map((entry, index) => (
                        <motion.div
                            key={entry.playerId}
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <LeaderboardRow
                                entry={entry}
                                unit={config.unit}
                                accentColor={config.color}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD ROW
// ═══════════════════════════════════════════════════════════════════════════

interface LeaderboardRowProps {
    entry: LeaderboardEntry;
    unit: string;
    accentColor: string;
}

function LeaderboardRow({ entry, unit, accentColor }: LeaderboardRowProps) {
    const isTop3 = entry.rank <= 3;
    const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']; // Gold, Silver, Bronze

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 8px',
            marginBottom: '4px',
            background: entry.isCurrentUser
                ? 'rgba(245,158,11,0.15)'
                : entry.isFriend
                    ? 'rgba(59,130,246,0.1)'
                    : 'transparent',
            borderRadius: '10px',
            border: entry.isCurrentUser
                ? '1px solid rgba(245,158,11,0.3)'
                : entry.isFriend
                    ? '1px solid rgba(59,130,246,0.2)'
                    : '1px solid transparent'
        }}>
            {/* Rank */}
            <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: isTop3 ? rankColors[entry.rank - 1] : 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                color: isTop3 ? '#000' : '#888'
            }}>
                {entry.rank}
            </div>

            {/* Avatar */}
            <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${accentColor}44, #1a1a2e)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                border: entry.isFriend ? '2px solid #3b82f6' : 'none'
            }}>
                👤
            </div>

            {/* Name */}
            <div style={{ flex: 1 }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: entry.isCurrentUser ? 700 : 500,
                    color: entry.isCurrentUser ? '#f59e0b' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {entry.playerName}
                    {entry.isFriend && !entry.isCurrentUser && (
                        <span style={{ fontSize: '10px' }}>🤝</span>
                    )}
                </div>
                {entry.trend && (
                    <div style={{
                        fontSize: '10px',
                        color: entry.trend === 'up' ? '#22c55e' : entry.trend === 'down' ? '#ef4444' : '#888'
                    }}>
                        {entry.trend === 'up' ? '↑' : entry.trend === 'down' ? '↓' : '−'}
                    </div>
                )}
            </div>

            {/* Value */}
            <div style={{
                fontSize: '14px',
                fontWeight: 700,
                color: accentColor
            }}>
                {entry.value.toLocaleString()}{unit === '%' ? '%' : ''}
                {unit !== '%' && <span style={{ fontSize: '10px', color: '#888', marginLeft: '2px' }}>{unit}</span>}
            </div>
        </div>
    );
}

export default LeaderboardWidget;
