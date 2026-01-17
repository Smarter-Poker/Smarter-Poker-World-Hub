/**
 * GAME CARD — Finalized badge design with three states
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

    // Check if mastered (all 10 levels complete)
    const isMastered = progress?.levelsCompleted >= 10;

    // Get current level and last score
    const currentLevel = progress?.levelsCompleted || 0;
    const lastScore = progress?.bestScore || 0;
    const hasPlayed = currentLevel > 0 || lastScore > 0;

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
                        👑
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
                        <span style={{ fontSize: 14 }}>🔥</span>
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
                    margin: '10px 0 0 0',
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
        </motion.div>
    );
}
