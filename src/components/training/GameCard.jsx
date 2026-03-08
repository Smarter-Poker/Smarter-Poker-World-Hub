/**
 * GAME CARD — Enhanced with Progress Bar and Action States
 * 
 * Features:
 * - Visual progress bar showing "Level X/10"
 * - Three action states: START / RESUME / MASTERED
 * - Gold border for mastered games
 * - Streak badge for completed games
 */

import { motion } from 'framer-motion';

export default function GameCard({ game, onClick, index = 0, image, progress }) {
    if (!game) return null;

    const CATEGORY_COLORS = {
        MTT: '#FF6B35',
        CASH: '#4CAF50',
        SPINS: '#FFD700',
        PSYCHOLOGY: '#9C27B0',
        ADVANCED: '#2196F3',
    };

    const categoryColor = CATEGORY_COLORS[game.category] || '#FF6B35';

    // Progress state calculations
    const currentLevel = progress?.levelsCompleted || 0;
    const maxLevel = 10;
    const progressPercent = (currentLevel / maxLevel) * 100;
    const lastScore = progress?.bestScore || 0;

    // Game states
    const isMastered = currentLevel >= maxLevel;
    const hasPlayed = currentLevel > 0 || lastScore > 0;
    const isNew = !hasPlayed;

    // Action button state
    const getActionState = () => {
        if (isMastered) return { text: '✓ MASTERED', color: '#FFD700', bg: 'linear-gradient(135deg, #FFD700, #FFA500)' };
        if (hasPlayed) return { text: '▶ RESUME', color: '#fff', bg: 'linear-gradient(135deg, #4CAF50, #45a049)' };
        return { text: '▶ START', color: '#fff', bg: 'linear-gradient(135deg, #00D4FF, #0099CC)' };
    };
    const actionState = getActionState();

    return (
        <motion.div
            onClick={() => onClick?.(game)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                width: 230,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: 210,
                    height: 210,
                    background: '#1a2744',
                    borderRadius: 14,
                    overflow: 'visible',
                    border: isMastered
                        ? '4px solid #FFD700'
                        : `3px solid ${categoryColor}`,
                    boxShadow: isMastered
                        ? '0 0 30px rgba(255, 215, 0, 0.6), 0 0 60px rgba(255, 215, 0, 0.3), 0 10px 24px rgba(0,0,0,0.6)'
                        : `0 0 24px ${categoryColor}, 0 0 48px ${categoryColor}80, 0 10px 24px rgba(0,0,0,0.6)`,
                }}
            >
                {(image || game.image) && (
                    <img
                        src={image || game.image}
                        alt={game.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: 10,
                        }}
                    />
                )}

                {/* CROWN ICON - Only for mastered games */}
                {isMastered && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: 52,
                            opacity: 0.25,
                            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6))',
                            zIndex: 1,
                        }}
                    >
                        ★
                    </div>
                )}

                {/* MASTERED BADGE - Shows when all 10 levels complete */}
                {isMastered && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            right: 8,
                            padding: '6px 12px',
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#000',
                            letterSpacing: 1,
                            textAlign: 'center',
                            boxShadow: '0 4px 12px rgba(255, 215, 0, 0.6)',
                            zIndex: 5,
                        }}
                    >
                        ✓ MASTERED
                    </div>
                )}

                {/* STREAK BADGE - Only shows AFTER mastering */}
                {isMastered && progress?.streakBest > 0 && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 8,
                            left: 8,
                            right: 8,
                            padding: '5px 10px',
                            background: 'rgba(255, 107, 53, 0.95)',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            boxShadow: '0 2px 8px rgba(255, 107, 53, 0.5)',
                            zIndex: 5,
                        }}
                    >
                        <span style={{ fontSize: 14 }}></span>
                        <span style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: '#fff',
                            letterSpacing: 0.5,
                        }}>
                            {progress.streakBest} STREAK
                        </span>
                    </div>
                )}

                {/* LEVEL + SCORE BADGE - Straight pill shape overlapping corner */}
                {hasPlayed && !isMastered && (
                    <div
                        style={{
                            position: 'absolute',
                            top: -8,
                            right: -8,
                            padding: '5px 12px',
                            background: 'linear-gradient(135deg, rgba(200, 200, 210, 0.98), rgba(170, 170, 185, 0.95))',
                            border: '3px solid #fff',
                            borderRadius: 20,
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            boxShadow: `
                                0 0 20px rgba(255, 255, 255, 0.8),
                                0 0 40px rgba(255, 255, 255, 0.5),
                                0 4px 12px rgba(0, 0, 0, 0.7)
                            `,
                            zIndex: 10,
                        }}
                    >
                        <div style={{
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#1a1a1a',
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                        }}>
                            LVL {currentLevel}
                        </div>
                        <div style={{
                            fontSize: 11,
                            fontWeight: 900,
                            color: lastScore >= 85 ? '#4CAF50' : '#FF6B35',
                            letterSpacing: 0.5,
                            lineHeight: 1,
                        }}>
                            {lastScore}%
                        </div>
                    </div>
                )}
            </div>

            <h3
                style={{
                    margin: '10px 0 4px 0',
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#fff',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    textAlign: 'center',
                    width: '100%',
                }}
            >
                {game.name}
            </h3>

            {/* PROGRESS RING — Circular animated progress */}
            {!isMastered && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    marginTop: 8,
                    width: '100%',
                }}>
                    {/* SVG Ring */}
                    <div style={{ position: 'relative', width: 34, height: 34 }}>
                        <svg width="34" height="34" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                            {/* Track */}
                            <circle
                                cx="18" cy="18" r="15"
                                fill="none"
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth="3"
                            />
                            {/* Fill */}
                            <motion.circle
                                cx="18" cy="18" r="15"
                                fill="none"
                                stroke={hasPlayed ? '#4CAF50' : '#00D4FF'}
                                strokeWidth="3"
                                strokeDasharray="94.2" // 2 * pi * 15
                                initial={{ strokeDashoffset: 94.2 }}
                                animate={{ strokeDashoffset: 94.2 - (94.2 * progressPercent) / 100 }}
                                transition={{ duration: 1, delay: index * 0.05, ease: 'easeOut' }}
                                strokeLinecap="round"
                            />
                        </svg>
                        {/* Percent text inside ring */}
                        <div style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 800, color: '#fff',
                        }}>
                            {Math.round(progressPercent)}%
                        </div>
                    </div>

                    {/* Level Text */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                    }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                            Progress
                        </span>
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 800 }}>
                            Level {currentLevel} <span style={{ color: 'rgba(255,255,255,0.3)' }}>/ {maxLevel}</span>
                        </span>
                    </div>
                </div>
            )}

            {/* ACTION BUTTON — Start / Resume / Mastered */}
            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                    marginTop: 8,
                    padding: '6px 16px',
                    background: actionState.bg,
                    borderRadius: 16,
                    fontSize: 11,
                    fontWeight: 800,
                    color: isMastered ? '#000' : actionState.color,
                    letterSpacing: 0.5,
                    boxShadow: isMastered
                        ? '0 2px 12px rgba(255, 215, 0, 0.5)'
                        : '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
            >
                {actionState.text}
            </motion.div>
        </motion.div>
    );
}
