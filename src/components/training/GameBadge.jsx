/**
 * GAME BADGE — Custom Game Indicators with Status
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * - Unique icons per game type
 * - Play status indicators (NEW, IN PROGRESS, COMPLETED, MASTERED)
 * - User ranking display
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { motion } from 'framer-motion';

// Play status definitions
export const PLAY_STATUS = {
    NEW: { id: 'new', label: 'NEW', color: '#00D4FF', glow: 'rgba(0, 212, 255, 0.5)' },
    LOCKED: { id: 'locked', label: '■', color: '#666', glow: 'none' },
    IN_PROGRESS: { id: 'in_progress', label: 'PLAYING', color: '#FFD700', glow: 'rgba(255, 215, 0, 0.5)' },
    COMPLETED: { id: 'completed', label: '✓', color: '#4CAF50', glow: 'rgba(76, 175, 80, 0.5)' },
    MASTERED: { id: 'mastered', label: '', color: '#FFD700', glow: 'rgba(255, 215, 0, 0.6)' },
    BOSS_DEFEATED: { id: 'boss_defeated', label: '', color: '#FF6B35', glow: 'rgba(255, 107, 53, 0.6)' },
};

// User rank tiers
export const USER_RANKS = {
    UNRANKED: { id: 'unranked', label: '-', color: '#444', border: '#555' },
    BRONZE: { id: 'bronze', label: 'III', color: '#CD7F32', border: '#8B5A2B' },
    SILVER: { id: 'silver', label: 'II', color: '#C0C0C0', border: '#A8A8A8' },
    GOLD: { id: 'gold', label: 'I', color: '#FFD700', border: '#DAA520' },
    DIAMOND: { id: 'diamond', label: '◆', color: '#00D4FF', border: '#0099CC' },
    CHAMPION: { id: 'champion', label: '', color: '#FF6B35', border: '#E64A19' },
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

// Standalone status indicator

// Mastery progress ring

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
        fontSize: 12,
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
        fontSize: 12,
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
        fontSize: 12,
        fontWeight: 800,
        color: '#fff',
    },

    statusIndicator: {
        padding: '3px 8px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
    },

    masteryRing: {
        transform: 'rotate(-90deg)',
    },
};
