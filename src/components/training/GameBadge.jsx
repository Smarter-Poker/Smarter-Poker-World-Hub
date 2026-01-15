/**
 * 🎮 GAME BADGE — Custom Game Indicators with Status
 * ═══════════════════════════════════════════════════════════════════════════
 * - Unique icons per game type
 * - Play status indicators (NEW, IN PROGRESS, COMPLETED, MASTERED)
 * - User ranking display
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { motion } from 'framer-motion';

// Play status definitions
export const PLAY_STATUS = {
    NEW: { id: 'new', label: 'NEW', color: '#00D4FF', glow: 'rgba(0, 212, 255, 0.5)' },
    LOCKED: { id: 'locked', label: '🔒', color: '#666', glow: 'none' },
    IN_PROGRESS: { id: 'in_progress', label: 'PLAYING', color: '#FFD700', glow: 'rgba(255, 215, 0, 0.5)' },
    COMPLETED: { id: 'completed', label: '✓', color: '#4CAF50', glow: 'rgba(76, 175, 80, 0.5)' },
    MASTERED: { id: 'mastered', label: '⭐', color: '#FFD700', glow: 'rgba(255, 215, 0, 0.6)' },
    BOSS_DEFEATED: { id: 'boss_defeated', label: '👑', color: '#FF6B35', glow: 'rgba(255, 107, 53, 0.6)' },
};

// User rank tiers
export const USER_RANKS = {
    UNRANKED: { id: 'unranked', label: '-', color: '#444', border: '#555' },
    BRONZE: { id: 'bronze', label: 'III', color: '#CD7F32', border: '#8B5A2B' },
    SILVER: { id: 'silver', label: 'II', color: '#C0C0C0', border: '#A8A8A8' },
    GOLD: { id: 'gold', label: 'I', color: '#FFD700', border: '#DAA520' },
    DIAMOND: { id: 'diamond', label: '💎', color: '#00D4FF', border: '#0099CC' },
    CHAMPION: { id: 'champion', label: '👑', color: '#FF6B35', border: '#E64A19' },
};

// Calculate rank from mastery percentage
export const getRankFromMastery = (mastery) => {
    if (mastery >= 95) return USER_RANKS.CHAMPION;
    if (mastery >= 85) return USER_RANKS.DIAMOND;
    if (mastery >= 70) return USER_RANKS.GOLD;
    if (mastery >= 50) return USER_RANKS.SILVER;
    if (mastery >= 25) return USER_RANKS.BRONZE;
    return USER_RANKS.UNRANKED;
};

// Get play status from progress data
export const getPlayStatus = (progress) => {
    if (!progress || !progress.lastPlayed) return PLAY_STATUS.NEW;
    if (progress.mastery >= 95) return PLAY_STATUS.BOSS_DEFEATED;
    if (progress.mastery >= 85) return PLAY_STATUS.MASTERED;
    if (progress.levelsCompleted >= 1) return PLAY_STATUS.COMPLETED;
    if (progress.attempts > 0) return PLAY_STATUS.IN_PROGRESS;
    return PLAY_STATUS.NEW;
};

// Main badge component
export default function GameBadge({
    icon,
    status = PLAY_STATUS.NEW,
    rank = USER_RANKS.UNRANKED,
    size = 'medium',
    showRank = true,
    showStatus = true,
    animate = true,
}) {
    const sizes = {
        small: { badge: 32, icon: 16, font: 8 },
        medium: { badge: 48, icon: 24, font: 10 },
        large: { badge: 64, icon: 32, font: 12 },
    };
    const s = sizes[size] || sizes.medium;

    return (
        <div style={styles.container}>
            {/* Main badge circle */}
            <motion.div
                style={{
                    ...styles.badge,
                    width: s.badge,
                    height: s.badge,
                    boxShadow: status.glow !== 'none'
                        ? `0 0 15px ${status.glow}, inset 0 0 10px rgba(0,0,0,0.3)`
                        : 'inset 0 0 10px rgba(0,0,0,0.3)',
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={animate ? { scale: 1.1 } : {}}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
                <span style={{ fontSize: s.icon }}>{icon}</span>
            </motion.div>

            {/* Status indicator (top-right) */}
            {showStatus && status.id !== 'new' && (
                <motion.div
                    style={{
                        ...styles.statusBadge,
                        background: status.color,
                        boxShadow: `0 0 8px ${status.glow}`,
                    }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                >
                    {status.label}
                </motion.div>
            )}

            {/* NEW pulse effect */}
            {showStatus && status.id === 'new' && (
                <motion.div
                    style={styles.newPulse}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                >
                    NEW
                </motion.div>
            )}

            {/* Rank badge (bottom-right) */}
            {showRank && rank.id !== 'unranked' && (
                <motion.div
                    style={{
                        ...styles.rankBadge,
                        background: `linear-gradient(135deg, ${rank.color}, ${rank.border})`,
                        border: `2px solid ${rank.border}`,
                    }}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    {rank.label}
                </motion.div>
            )}
        </div>
    );
}

// Standalone status indicator
export function PlayStatusIndicator({ status, size = 'small' }) {
    const isNew = status.id === 'new';

    return (
        <motion.div
            style={{
                ...styles.statusIndicator,
                background: status.color,
                boxShadow: `0 0 10px ${status.glow}`,
            }}
            animate={isNew ? { scale: [1, 1.1, 1] } : {}}
            transition={isNew ? { duration: 1.5, repeat: Infinity } : {}}
        >
            {isNew ? 'NEW' : status.label}
        </motion.div>
    );
}

// Mastery progress ring
export function MasteryRing({ mastery = 0, size = 48 }) {
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (mastery / 100) * circumference;

    const getColor = () => {
        if (mastery >= 85) return '#4CAF50';
        if (mastery >= 70) return '#FFD700';
        if (mastery >= 50) return '#FF9800';
        return '#666';
    };

    return (
        <svg width={size} height={size} style={styles.masteryRing}>
            {/* Background circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={getColor()}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1, ease: 'easeOut' }}
            />
        </svg>
    );
}

const styles = {
    container: {
        position: 'relative',
        display: 'inline-flex',
    },

    badge: {
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #1a2744, #0d1628)',
        border: '2px solid rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    statusBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
    },

    newPulse: {
        position: 'absolute',
        top: -8,
        right: -12,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
        color: '#fff',
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: 0.5,
    },

    rankBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 18,
        height: 18,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 800,
        color: '#fff',
    },

    statusIndicator: {
        padding: '3px 8px',
        borderRadius: 10,
        fontSize: 9,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
    },

    masteryRing: {
        transform: 'rotate(-90deg)',
    },
};
