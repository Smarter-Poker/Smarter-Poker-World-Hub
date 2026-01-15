/**
 * 🎮 ENHANCED GAME CARD — Video Game Quality with Animations
 * ═══════════════════════════════════════════════════════════════════════════
 * Premium game card with:
 * - Framer Motion physics animations
 * - Play status indicators (NEW, PLAYING, MASTERED)
 * - Mastery progress ring
 * - User ranking badges
 * - Custom game icons
 * - Kinetic hover effects
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MasteryRing, PLAY_STATUS, USER_RANKS, getRankFromMastery, getPlayStatus } from './GameBadge';

// Rank badge colors matching reference
const RANK_CONFIG = {
    S: { label: 'S-RANK', bg: 'linear-gradient(135deg, #FFD700, #FFA500)', textColor: '#000' },
    A: { label: 'A-RANK', bg: 'linear-gradient(135deg, #4CAF50, #2E7D32)', textColor: '#fff' },
    B: { label: 'B-RANK', bg: 'linear-gradient(135deg, #2196F3, #1565C0)', textColor: '#fff' },
    C: { label: 'C-RANK', bg: 'linear-gradient(135deg, #FF6B35, #E64A19)', textColor: '#fff' },
    D: { label: 'D-RANK', bg: 'linear-gradient(135deg, #9E9E9E, #616161)', textColor: '#fff' },
};

// Category colors
const CATEGORY_COLORS = {
    MTT: '#FF6B35',
    CASH: '#4CAF50',
    SPINS: '#FFD700',
    PSYCHOLOGY: '#9C27B0',
    ADVANCED: '#2196F3',
};

export default function GameCard({
    game,
    progress = null,
    onClick,
    index = 0,
    image = null,
}) {
    const [isHovered, setIsHovered] = useState(false);

    if (!game) return null;

    // Calculate status and rank from progress
    const status = progress ? getPlayStatus(progress) : PLAY_STATUS.NEW;
    const rank = progress ? getRankFromMastery(progress.mastery) : USER_RANKS.UNRANKED;
    const mastery = progress?.mastery || 0;
    const levelsCompleted = progress?.levelsCompleted || 0;

    // Determine display rank from mastery
    const getDisplayRank = () => {
        if (mastery >= 95) return 'S';
        if (mastery >= 85) return 'A';
        if (mastery >= 70) return 'B';
        if (mastery >= 50) return 'C';
        return 'D';
    };
    const displayRank = mastery > 0 ? getDisplayRank() : null;
    const rankConfig = displayRank ? RANK_CONFIG[displayRank] : null;
    const categoryColor = CATEGORY_COLORS[game.category] || '#FF6B35';

    return (
        <motion.div
            onClick={() => onClick?.(game)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={styles.container}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: index * 0.05,
                type: 'spring',
                stiffness: 300,
                damping: 25
            }}
            whileHover={{
                scale: 1.08,
                y: -8,
                transition: { type: 'spring', stiffness: 400, damping: 20 }
            }}
            whileTap={{ scale: 0.95 }}
        >
            {/* Glow effect on hover */}
            <motion.div
                style={{
                    ...styles.glowEffect,
                    background: `radial-gradient(circle at center, ${categoryColor}40 0%, transparent 70%)`,
                }}
                animate={{ opacity: isHovered ? 1 : 0 }}
            />

            {/* Visual area (top section) */}
            <div style={styles.visualArea}>
                {/* Custom image or fallback to icon */}
                {(image || game.image) ? (
                    <motion.img
                        src={image || game.image}
                        alt={game.name}
                        style={styles.gameImage}
                        animate={isHovered ? { scale: 1.1 } : { scale: 1 }}
                        transition={{ duration: 0.3 }}
                    />
                ) : (
                    <motion.div
                        style={styles.iconContainer}
                        animate={isHovered ? {
                            scale: [1, 1.15, 1],
                            rotate: [0, -5, 5, 0],
                        } : {}}
                        transition={{ duration: 0.4 }}
                    >
                        <span style={styles.gameIcon}>{game.icon}</span>
                    </motion.div>
                )}

                {/* Category indicator */}
                <div style={{
                    ...styles.categoryBadge,
                    background: categoryColor,
                }}>
                    {game.category}
                </div>

                {/* NEW indicator pulse */}
                {status.id === 'new' && (
                    <motion.div
                        style={styles.newBadge}
                        animate={{
                            scale: [1, 1.05, 1],
                            opacity: [0.9, 1, 0.9],
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    >
                        NEW
                    </motion.div>
                )}

                {/* Mastery ring overlay */}
                {mastery > 0 && (
                    <div style={styles.masteryOverlay}>
                        <MasteryRing mastery={mastery} size={36} />
                    </div>
                )}

                {/* Rank badge (diagonal ribbon) */}
                {rankConfig && (
                    <motion.div
                        style={{
                            ...styles.rankBadge,
                            background: rankConfig.bg,
                            color: rankConfig.textColor,
                        }}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        {rankConfig.label}
                    </motion.div>
                )}

                {/* Status indicator (completed/mastered icons) */}
                {status.id !== 'new' && status.id !== 'locked' && (
                    <motion.div
                        style={{
                            ...styles.statusIcon,
                            background: status.color,
                            boxShadow: `0 0 10px ${status.glow}`,
                        }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.3 }}
                    >
                        {status.label}
                    </motion.div>
                )}
            </div>

            {/* Info area (bottom section) */}
            <div style={styles.infoArea}>
                <h3 style={styles.gameTitle}>{game.name}</h3>
                <p style={styles.gameFocus}>{game.focus}</p>

                {/* Difficulty stars with animation */}
                <div style={styles.starsRow}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <motion.span
                            key={i}
                            style={{
                                ...styles.star,
                                color: i < game.difficulty ? '#FFD700' : 'rgba(255,255,255,0.15)',
                            }}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.05 }}
                        >
                            ★
                        </motion.span>
                    ))}
                </div>

                {/* Level progress bar */}
                <div style={styles.progressContainer}>
                    <div style={styles.progressTrack}>
                        <motion.div
                            style={{
                                ...styles.progressFill,
                                background: `linear-gradient(90deg, ${categoryColor}, ${categoryColor}CC)`,
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(levelsCompleted / 10) * 100}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                    </div>
                    <span style={styles.levelText}>{levelsCompleted}/10</span>
                </div>

                {/* Tags row */}
                {game.tags && game.tags.length > 0 && (
                    <div style={styles.tagsRow}>
                        {game.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} style={styles.tag}>{tag.toUpperCase()}</span>
                        ))}
                    </div>
                )}
            </div>

            {/* Hover border effect */}
            <motion.div
                style={{
                    ...styles.hoverBorder,
                    borderColor: categoryColor,
                }}
                animate={{ opacity: isHovered ? 1 : 0 }}
            />
        </motion.div>
    );
}

const styles = {
    container: {
        position: 'relative',
        width: 140, // Fixed width, mobile-optimized
        minWidth: 140,
        height: 190, // Fixed height
        minHeight: 190,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'linear-gradient(180deg, #1a2744 0%, #0d1628 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
    },

    glowEffect: {
        position: 'absolute',
        inset: -20,
        pointerEvents: 'none',
        zIndex: 0,
    },

    visualArea: {
        position: 'relative',
        height: 80, // Compact for mobile
        minHeight: 80,
        background: 'linear-gradient(135deg, rgba(26,39,68,0.8), rgba(13,22,40,0.9))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 1,
    },

    gameImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        position: 'absolute',
        top: 0,
        left: 0,
    },

    iconContainer: {
        width: 44, // Smaller for mobile
        height: 44,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid rgba(255,255,255,0.1)',
    },

    gameIcon: {
        fontSize: 22,
    },

    categoryBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 8,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },

    newBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        padding: '3px 8px',
        borderRadius: 4,
        background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
        color: '#fff',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 1,
    },

    masteryOverlay: {
        position: 'absolute',
        bottom: 8,
        right: 8,
    },

    rankBadge: {
        position: 'absolute',
        top: 6,
        right: -8,
        padding: '3px 12px 3px 8px',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: 0.5,
        transform: 'rotate(15deg)',
    },

    statusIcon: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
    },

    infoArea: {
        padding: '8px 10px',
        height: 110, // Fixed height
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1,
        position: 'relative',
    },

    gameTitle: {
        fontSize: 12, // Compact for mobile
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 2px 0',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },

    gameFocus: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.5)',
        margin: '0 0 6px 0',
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },

    starsRow: {
        marginBottom: 8,
        display: 'flex',
        gap: 2,
    },

    star: {
        fontSize: 12,
    },

    progressContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 'auto',
    },

    progressTrack: {
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
    },

    progressFill: {
        height: '100%',
        borderRadius: 2,
    },

    levelText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        fontWeight: 600,
    },

    tagsRow: {
        display: 'flex',
        gap: 4,
        marginTop: 6,
    },

    tag: {
        padding: '2px 5px',
        borderRadius: 3,
        background: 'rgba(255,255,255,0.1)',
        fontSize: 7,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 0.5,
    },

    hoverBorder: {
        position: 'absolute',
        inset: 0,
        borderRadius: 14,
        border: '2px solid',
        pointerEvents: 'none',
        zIndex: 2,
    },
};
