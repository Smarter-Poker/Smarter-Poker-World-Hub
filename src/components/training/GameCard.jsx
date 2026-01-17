/**
 * GAME CARD — Fixed Design for 800px Layout (3 cards visible)
 * 3 cards × 230px + gaps + padding = ~750px (fits in 800px with margins)
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
                width: 230, // 3 cards × 230px + gaps = ~750px (fits 800px)
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
                    border: `3px solid ${categoryColor}`,
                    borderRadius: 14,
                    boxShadow: `0 0 24px ${categoryColor}, 0 0 48px ${categoryColor}80, 0 10px 24px rgba(0,0,0,0.6)`,
                    overflow: 'hidden',
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
                        }}
                    />
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
                            padding: '4px 8px',
                            background: 'rgba(255, 107, 53, 0.95)',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            boxShadow: '0 2px 8px rgba(255, 107, 53, 0.5)',
                        }}
                    >
                        <span style={{ fontSize: 12 }}>🔥</span>
                        <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#fff',
                            letterSpacing: 0.5,
                        }}>
                            {progress.streakBest} STREAK
                        </span>
                    </div>
                )}

                {/* S-RANK STYLE LEVEL + SCORE TAG - Hanging off upper right corner */}
                {hasPlayed && !isMastered && (
                    <div
                        style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            padding: '8px 12px',
                            background: 'linear-gradient(135deg, rgba(30, 30, 35, 0.98), rgba(15, 15, 20, 0.95))',
                            border: '2px solid rgba(255, 255, 255, 0.9)',
                            borderRadius: 8,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 2,
                            boxShadow: `
                                0 0 20px rgba(255, 255, 255, 0.6),
                                0 0 40px rgba(255, 255, 255, 0.4),
                                0 4px 12px rgba(0, 0, 0, 0.7)
                            `,
                            minWidth: 50,
                        }}
                    >
                        <div style={{
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#fff',
                            letterSpacing: 1,
                            textShadow: `
                                0 0 10px rgba(255, 255, 255, 0.8),
                                0 0 20px rgba(255, 255, 255, 0.5),
                                0 2px 4px rgba(0, 0, 0, 0.5)
                            `,
                        }}>
                            LVL {currentLevel}
                        </div>
                        <div style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: lastScore >= 85 ? '#4CAF50' : '#FFD700',
                            letterSpacing: 0.5,
                            textShadow: `
                                0 0 10px ${lastScore >= 85 ? 'rgba(76, 175, 80, 0.8)' : 'rgba(255, 215, 0, 0.8)'},
                                0 0 20px ${lastScore >= 85 ? 'rgba(76, 175, 80, 0.5)' : 'rgba(255, 215, 0, 0.5)'},
                                0 2px 4px rgba(0, 0, 0, 0.5)
                            `,
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
