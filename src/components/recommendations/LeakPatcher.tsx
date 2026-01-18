/**
 * 🔧 LEAK PATCHER - Smart Recommendations System
 * 
 * Uses LeakDetector stats to recommend training modules.
 * Identifies weaknesses and links to specific drill games.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getGameDefinition, GAMES_LIST } from '../../lib/MasterGameLibrary';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LeakStats {
    // Preflop Leaks
    foldTo3BetRate: number;      // % of times folding to 3-bets
    openRaiseFrequency: number;  // % of hands opened preflop
    blindDefenseRate: number;    // % of blind defense vs steals

    // Postflop Leaks
    cbetFrequency: number;       // C-bet frequency when IP
    foldToCbetRate: number;      // % folding to c-bets
    riverCallRate: number;       // River call frequency
    riverBluffRate: number;      // River bluff frequency

    // Tournament Leaks
    bubbleAggression: number;    // Aggression near bubble
    shortStackPlay: number;      // Short stack accuracy
    icmAwareness: number;        // ICM decision accuracy

    // General
    totalHandsPlayed: number;
    overallAccuracy: number;
}

export interface LeakRecommendation {
    id: string;
    category: 'critical' | 'warning' | 'tip';
    title: string;
    message: string;
    gameId: string;
    gameName: string;
    priority: number;
}

interface LeakPatcherProps {
    stats: LeakStats;
    onPlayGame: (gameId: string) => void;
    maxRecommendations?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETECTION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

function detectLeaks(stats: LeakStats): LeakRecommendation[] {
    const leaks: LeakRecommendation[] = [];

    // ─── PREFLOP LEAKS ───

    // Folding too much to 3-bets
    if (stats.foldTo3BetRate > 70) {
        leaks.push({
            id: 'leak_3bet_fold',
            category: 'critical',
            title: '3-Bet Defense Weakness',
            message: `You're folding ${stats.foldTo3BetRate.toFixed(0)}% to 3-bets. This makes you exploitable.`,
            gameId: 'cash_200bb_deep_3bp',
            gameName: 'Deep Stack 3-Bet Pots',
            priority: 95
        });
    } else if (stats.foldTo3BetRate > 55) {
        leaks.push({
            id: 'leak_3bet_fold_mild',
            category: 'warning',
            title: '3-Bet Response',
            message: `Your 3-bet fold rate is ${stats.foldTo3BetRate.toFixed(0)}%. Consider widening your continue range.`,
            gameId: 'cash_200bb_deep_3bp',
            gameName: 'Deep Stack 3-Bet Pots',
            priority: 70
        });
    }

    // Opening too tight/loose
    if (stats.openRaiseFrequency < 15) {
        leaks.push({
            id: 'leak_tight_open',
            category: 'warning',
            title: 'Tight Opening Range',
            message: `You're only opening ${stats.openRaiseFrequency.toFixed(0)}% of hands. You may be too passive.`,
            gameId: 'cash_100bb_6max_btn_open',
            gameName: 'Button Opening',
            priority: 60
        });
    } else if (stats.openRaiseFrequency > 35) {
        leaks.push({
            id: 'leak_loose_open',
            category: 'warning',
            title: 'Wide Opening Range',
            message: `Opening ${stats.openRaiseFrequency.toFixed(0)}% of hands. Consider tightening from early position.`,
            gameId: 'cash_100bb_6max_btn_open',
            gameName: 'Button Opening',
            priority: 55
        });
    }

    // Blind defense weakness
    if (stats.blindDefenseRate < 30) {
        leaks.push({
            id: 'leak_blind_defense',
            category: 'critical',
            title: 'Blind Defense Leak',
            message: `You're only defending your blinds ${stats.blindDefenseRate.toFixed(0)}% of the time. Players are stealing freely.`,
            gameId: 'cash_6max_cbet_defense',
            gameName: 'Flop Floating',
            priority: 85
        });
    }

    // ─── POSTFLOP LEAKS ───

    // C-bet frequency issues
    if (stats.cbetFrequency > 80) {
        leaks.push({
            id: 'leak_cbet_high',
            category: 'warning',
            title: 'Excessive C-Betting',
            message: `Your c-bet frequency is ${stats.cbetFrequency.toFixed(0)}%. Good players will exploit this.`,
            gameId: 'drill_cbet_wet_board',
            gameName: 'Wet Board C-Bet',
            priority: 65
        });
    } else if (stats.cbetFrequency < 40) {
        leaks.push({
            id: 'leak_cbet_low',
            category: 'warning',
            title: 'Low C-Bet Frequency',
            message: `You're only c-betting ${stats.cbetFrequency.toFixed(0)}%. You may be giving up too much equity.`,
            gameId: 'drill_cbet_wet_board',
            gameName: 'Wet Board C-Bet',
            priority: 60
        });
    }

    // Folding too much to c-bets
    if (stats.foldToCbetRate > 65) {
        leaks.push({
            id: 'leak_fold_cbet',
            category: 'critical',
            title: 'Folding to C-Bets',
            message: `You fold ${stats.foldToCbetRate.toFixed(0)}% to c-bets. Your opponents can bluff you profitably.`,
            gameId: 'cash_6max_cbet_defense',
            gameName: 'Flop Floating',
            priority: 90
        });
    }

    // River call/bluff imbalance
    if (stats.riverCallRate < 20) {
        leaks.push({
            id: 'leak_river_fold',
            category: 'warning',
            title: 'River Overfolding',
            message: `You only call ${stats.riverCallRate.toFixed(0)}% of river bets. You may be folding too many bluff catchers.`,
            gameId: 'drill_river_hero_call',
            gameName: 'River Bluff Catch',
            priority: 75
        });
    }

    // ─── TOURNAMENT LEAKS ───

    // Bubble play
    if (stats.bubbleAggression < 40) {
        leaks.push({
            id: 'leak_bubble_passive',
            category: 'warning',
            title: 'Passive Bubble Play',
            message: `Your bubble aggression is only ${stats.bubbleAggression.toFixed(0)}%. You're missing ICM pressure spots.`,
            gameId: 'mtt_bubble_abuse',
            gameName: 'Bubble Pressure',
            priority: 70
        });
    }

    // Short stack play
    if (stats.shortStackPlay < 70 && stats.totalHandsPlayed > 100) {
        leaks.push({
            id: 'leak_short_stack',
            category: 'critical',
            title: 'Short Stack Mistakes',
            message: `Your short stack accuracy is only ${stats.shortStackPlay.toFixed(0)}%. Master push/fold strategy.`,
            gameId: 'mtt_15bb_push_fold',
            gameName: 'Push/Fold Mastery',
            priority: 85
        });
    }

    // ICM awareness
    if (stats.icmAwareness < 60) {
        leaks.push({
            id: 'leak_icm',
            category: 'warning',
            title: 'ICM Awareness',
            message: `Your ICM accuracy is ${stats.icmAwareness.toFixed(0)}%. Study payout implications more.`,
            gameId: 'sat_bubble_folding',
            gameName: 'Satellite Bubble',
            priority: 65
        });
    }

    // ─── POSITIVE REINFORCEMENT ───

    if (stats.overallAccuracy >= 85) {
        leaks.push({
            id: 'tip_advanced',
            category: 'tip',
            title: 'Ready for Advanced Play',
            message: `Your ${stats.overallAccuracy.toFixed(0)}% accuracy shows mastery. Try advanced scenarios!`,
            gameId: 'mtt_final_table_hu',
            gameName: 'Heads Up for the Trophy',
            priority: 50
        });
    }

    return leaks.sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function LeakPatcher({
    stats,
    onPlayGame,
    maxRecommendations = 3
}: LeakPatcherProps) {
    const recommendations = useMemo(() =>
        detectLeaks(stats).slice(0, maxRecommendations),
        [stats, maxRecommendations]
    );

    if (recommendations.length === 0) {
        return (
            <div style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(20,20,40,0.8))',
                borderRadius: '16px',
                border: '1px solid rgba(34,197,94,0.3)',
                padding: '20px',
                textAlign: 'center'
            }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✨</div>
                <h3 style={{ fontSize: '16px', color: '#22c55e', margin: '0 0 8px' }}>
                    No Leaks Detected!
                </h3>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                    Your game is solid. Keep grinding!
                </p>
            </div>
        );
    }

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(20,20,40,0.9), rgba(10,10,30,0.9))',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), transparent)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <span style={{ fontSize: '24px' }}>🔧</span>
                <div>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        margin: 0,
                        color: '#fff'
                    }}>
                        Recommended For You
                    </h3>
                    <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>
                        Based on your play patterns
                    </p>
                </div>
            </div>

            {/* Recommendations */}
            <div style={{ padding: '12px' }}>
                {recommendations.map((rec, index) => (
                    <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <RecommendationCard
                            recommendation={rec}
                            onPlay={() => onPlayGame(rec.gameId)}
                        />
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION CARD
// ═══════════════════════════════════════════════════════════════════════════

interface RecommendationCardProps {
    recommendation: LeakRecommendation;
    onPlay: () => void;
}

function RecommendationCard({ recommendation, onPlay }: RecommendationCardProps) {
    const categoryStyles = {
        critical: {
            bg: 'rgba(239,68,68,0.1)',
            border: 'rgba(239,68,68,0.3)',
            color: '#ef4444',
            icon: '🚨'
        },
        warning: {
            bg: 'rgba(245,158,11,0.1)',
            border: 'rgba(245,158,11,0.3)',
            color: '#f59e0b',
            icon: '⚠️'
        },
        tip: {
            bg: 'rgba(34,197,94,0.1)',
            border: 'rgba(34,197,94,0.3)',
            color: '#22c55e',
            icon: '💡'
        }
    };

    const style = categoryStyles[recommendation.category];

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            style={{
                background: style.bg,
                borderRadius: '12px',
                border: `1px solid ${style.border}`,
                padding: '14px',
                marginBottom: '10px',
                cursor: 'pointer'
            }}
            onClick={onPlay}
        >
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
            }}>
                <span style={{ fontSize: '20px' }}>{style.icon}</span>
                <div style={{ flex: 1 }}>
                    <h4 style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: style.color,
                        margin: '0 0 4px'
                    }}>
                        {recommendation.title}
                    </h4>
                    <p style={{
                        fontSize: '12px',
                        color: '#aaa',
                        margin: '0 0 10px',
                        lineHeight: 1.4
                    }}>
                        {recommendation.message}
                    </p>
                    <button
                        onClick={(e) => { e.stopPropagation(); onPlay(); }}
                        style={{
                            padding: '6px 14px',
                            background: style.color,
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🎮 Train: {recommendation.gameName}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK STATS GENERATOR (for testing)
// ═══════════════════════════════════════════════════════════════════════════

export function generateMockLeakStats(): LeakStats {
    return {
        foldTo3BetRate: 65 + Math.random() * 20,
        openRaiseFrequency: 20 + Math.random() * 15,
        blindDefenseRate: 25 + Math.random() * 20,
        cbetFrequency: 50 + Math.random() * 30,
        foldToCbetRate: 45 + Math.random() * 25,
        riverCallRate: 20 + Math.random() * 15,
        riverBluffRate: 10 + Math.random() * 15,
        bubbleAggression: 35 + Math.random() * 30,
        shortStackPlay: 60 + Math.random() * 25,
        icmAwareness: 50 + Math.random() * 30,
        totalHandsPlayed: Math.floor(100 + Math.random() * 500),
        overallAccuracy: 65 + Math.random() * 25
    };
}

export default LeakPatcher;
