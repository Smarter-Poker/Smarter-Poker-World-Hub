/**
 * 🎬 GAME INTRO SPLASH — Chip Explosion Video + Ready Popup
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Flow:
 * 1. Video plays (~3.5 seconds) - SmarterPoker Chip Explosion
 * 2. Ready popup shows with game title, description, and "Ready" button
 * 3. User clicks "Ready" to start the game
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function GameIntroSplash({ isVisible, game, onComplete }) {
    const videoRef = useRef(null);
    const [phase, setPhase] = useState('video'); // 'video' | 'ready'

    useEffect(() => {
        if (isVisible) {
            // Reset to video phase when splash becomes visible
            setPhase('video');

            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(err => {
                    console.warn('Video autoplay blocked:', err);
                    // If autoplay is blocked, skip to ready popup
                    setPhase('ready');
                });
            }
        }
    }, [isVisible]);

    const handleVideoEnd = () => {
        // Video finished, show the ready popup
        setPhase('ready');
    };

    const handleVideoError = () => {
        // If video fails to load, skip to ready popup
        console.warn('Video failed to load, skipping to ready popup');
        setPhase('ready');
    };

    const handleSkipVideo = () => {
        // Allow skipping straight to ready popup
        if (videoRef.current) {
            videoRef.current.pause();
        }
        setPhase('ready');
    };

    const handleReady = () => {
        // User is ready, start the game
        if (onComplete) {
            onComplete();
        }
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={styles.overlay}
                >
                    {/* VIDEO PHASE */}
                    {phase === 'video' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={styles.videoContainer}
                            onClick={handleSkipVideo}
                        >
                            <video
                                ref={videoRef}
                                src="/videos/chip-explosion.mp4"
                                style={styles.video}
                                onEnded={handleVideoEnd}
                                onError={handleVideoError}
                                muted={false}
                                playsInline
                                preload="auto"
                            />

                            {/* Skip hint */}
                            <motion.div
                                style={styles.skipHint}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.5 }}
                                transition={{ delay: 1 }}
                            >
                                Tap to skip
                            </motion.div>
                        </motion.div>
                    )}

                    {/* READY POPUP PHASE */}
                    {phase === 'ready' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            style={styles.readyContainer}
                        >
                            <div style={styles.readyCard}>
                                {/* Game Icon/Image */}
                                {game?.image && (
                                    <div style={styles.gameImageContainer}>
                                        <img
                                            src={game.image}
                                            alt={game?.name || 'Game'}
                                            style={styles.gameImage}
                                        />
                                    </div>
                                )}

                                {/* Category Badge */}
                                {game?.category && (
                                    <div style={{
                                        ...styles.categoryBadge,
                                        background: getCategoryColor(game.category),
                                    }}>
                                        {game.category}
                                    </div>
                                )}

                                {/* Game Title */}
                                <h1 style={styles.gameTitle}>
                                    {game?.name || 'Training Game'}
                                </h1>

                                {/* Game Description */}
                                <p style={styles.gameDescription}>
                                    {game?.description || 'Master this poker concept through interactive scenarios and real-time feedback.'}
                                </p>

                                {/* Game Stats */}
                                <div style={styles.gameStats}>
                                    <div style={styles.statItem}>
                                        <span style={styles.statValue}>{game?.hands || 20}</span>
                                        <span style={styles.statLabel}>Hands</span>
                                    </div>
                                    <div style={styles.statDivider} />
                                    <div style={styles.statItem}>
                                        <span style={styles.statValue}>{game?.passThreshold || 85}%</span>
                                        <span style={styles.statLabel}>To Pass</span>
                                    </div>
                                    <div style={styles.statDivider} />
                                    <div style={styles.statItem}>
                                        <span style={{ ...styles.statValue, color: '#FFD700' }}>
                                            {game?.xpReward || 100} XP
                                        </span>
                                        <span style={styles.statLabel}>Reward</span>
                                    </div>
                                </div>

                                {/* Ready Button */}
                                <motion.button
                                    style={styles.readyButton}
                                    onClick={handleReady}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <span style={styles.readyIcon}>▶</span>
                                    I'M READY
                                </motion.button>

                                {/* Tips */}
                                <p style={styles.tipText}>
                                    💡 Tap the correct answer as fast as you can for bonus XP
                                </p>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Helper function to get category color
function getCategoryColor(category) {
    const colors = {
        MTT: '#FF6B35',
        CASH: '#4CAF50',
        SPINS: '#FFD700',
        PSYCHOLOGY: '#9C27B0',
        ADVANCED: '#2196F3',
    };
    return colors[category] || '#FF6B35';
}

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
    },

    // Video phase styles
    videoContainer: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
    },

    video: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
    },

    skipHint: {
        position: 'absolute',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 14,
        fontFamily: 'Inter, -apple-system, sans-serif',
        letterSpacing: 1,
    },

    // Ready popup styles
    readyContainer: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'radial-gradient(circle at center, #1a2744 0%, #0a0a15 100%)',
    },

    readyCard: {
        width: '100%',
        maxWidth: 400,
        background: 'linear-gradient(180deg, rgba(26, 39, 68, 0.95) 0%, rgba(10, 10, 21, 0.98) 100%)',
        borderRadius: 20,
        padding: '32px 24px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)',
        textAlign: 'center',
    },

    gameImageContainer: {
        width: 120,
        height: 120,
        margin: '0 auto 16px',
        borderRadius: 16,
        overflow: 'hidden',
        border: '3px solid rgba(255, 107, 53, 0.5)',
        boxShadow: '0 0 30px rgba(255, 107, 53, 0.3)',
    },

    gameImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },

    categoryBadge: {
        display: 'inline-block',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 2,
        color: '#fff',
        marginBottom: 12,
        textTransform: 'uppercase',
    },

    gameTitle: {
        fontSize: 24,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 12px 0',
        letterSpacing: 0.5,
        textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
    },

    gameDescription: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
        margin: '0 0 24px 0',
    },

    gameStats: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        marginBottom: 28,
        padding: '16px 0',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },

    statItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    statValue: {
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
    },

    statLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    statDivider: {
        width: 1,
        height: 32,
        background: 'rgba(255, 255, 255, 0.2)',
    },

    readyButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #FF6B35, #E64A19)',
        border: 'none',
        borderRadius: 30,
        color: '#fff',
        fontSize: 16,
        fontWeight: 800,
        letterSpacing: 2,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(255, 107, 53, 0.4), 0 0 30px rgba(255, 107, 53, 0.2)',
        marginBottom: 16,
        WebkitTapHighlightColor: 'transparent',
    },

    readyIcon: {
        fontSize: 14,
    },

    tipText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        margin: 0,
    },
};
