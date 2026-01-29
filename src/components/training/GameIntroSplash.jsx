/**
 * 🎬 GAME INTRO SPLASH — Chip Explosion Video + Ready Popup
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Flow:
 * 1. Video plays (~3.5 seconds) - SmarterPoker Chip Explosion
 * 2. Ready popup shows with game title, description, and "Ready" button
 * 3. User clicks "Ready" to start the game
 * 
 * PRELOAD: Arena page is prefetched during video to eliminate loading screens
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/router';

export default function GameIntroSplash({ isVisible, game, onComplete }) {
    const router = useRouter();
    const videoRef = useRef(null);
    const [phase, setPhase] = useState('video'); // 'video' | 'ready'

    // 🚀 PRELOAD: Start loading the arena page as soon as video begins
    useEffect(() => {
        if (isVisible && game?.id) {
            // Prefetch the play page route during video playback
            const playRoute = `/hub/training/play/${game.id}`;
            console.log('🎬 Prefetching arena page:', playRoute);
            router.prefetch(playRoute);

            // Also prefetch the arena routes
            router.prefetch(`/hub/training/arena/${game.id}`);

            // Fetch the first question in the background to warm up the API
            fetch(`/api/training/get-question?gameId=${game.id}&engineType=PIO&level=1`)
                .then(() => console.log('✅ Question API warmed up'))
                .catch(() => { }); // Silently fail
        }
    }, [isVisible, game?.id, router]);

    useEffect(() => {
        if (isVisible) {
            // Reset to video phase when splash becomes visible
            setPhase('video');

            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                // Start muted to ensure autoplay works, then try to unmute
                videoRef.current.muted = true;
                videoRef.current.play()
                    .then(() => {
                        console.log('🎬 Video playing, attempting unmute...');
                        // Try to unmute after playback starts (user interaction may be needed)
                        setTimeout(() => {
                            if (videoRef.current) {
                                videoRef.current.muted = false;
                            }
                        }, 100);
                    })
                    .catch(err => {
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
                                autoPlay
                                muted
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

                    {/* READY POPUP PHASE - FULL SCREEN MOBILE */}
                    {phase === 'ready' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            style={styles.readyFullScreen}
                        >
                            {/* Category Badge */}
                            {game?.category && (
                                <div style={{
                                    ...styles.categoryBadge,
                                    background: getCategoryColor(game.category),
                                }}>
                                    {game.category}
                                </div>
                            )}

                            {/* Game Title - Title Case */}
                            <h1 style={styles.gameTitle}>
                                {game?.name || 'Training Game'}
                            </h1>

                            {/* Purpose Section */}
                            <div style={styles.purposeSection}>
                                <div style={styles.sectionLabel}>Purpose</div>
                                <p style={styles.sectionText}>
                                    {game?.purpose || 'Master Critical Decision Making In Common Poker Spots Through Repetition And Instant Feedback.'}
                                </p>
                            </div>

                            {/* What You'll Learn Section */}
                            <div style={styles.learnSection}>
                                <div style={styles.sectionLabel}>What You'll Improve</div>
                                <div style={styles.skillsList}>
                                    {(game?.skills || ['Preflop Hand Selection', 'Position Awareness', 'Bet Sizing', 'Fold Equity']).map((skill, i) => (
                                        <div key={i} style={styles.skillItem}>
                                            <span style={styles.skillCheck}>✓</span>
                                            <span style={styles.skillText}>{skill}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Game Stats */}
                            <div style={styles.gameStatsRow}>
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{game?.hands || 20}</span>
                                    <span style={styles.statLabel}>Hands</span>
                                </div>
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{game?.passThreshold || 85}%</span>
                                    <span style={styles.statLabel}>To Pass</span>
                                </div>
                                <div style={styles.statBox}>
                                    <span style={{ ...styles.statValue, color: '#FFD700' }}>{game?.xpReward || 100}</span>
                                    <span style={styles.statLabel}>XP Reward</span>
                                </div>
                            </div>

                            {/* Ready Button */}
                            <motion.button
                                style={styles.readyButton}
                                onClick={handleReady}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                I'm Ready
                            </motion.button>

                            {/* Tip */}
                            <p style={styles.tipText}>
                                Answer Quickly For Bonus XP
                            </p>
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
        textTransform: 'capitalize',
    },

    // FULL SCREEN MOBILE - Ready popup styles
    readyFullScreen: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        background: 'linear-gradient(180deg, #0d0d14 0%, #0a0a0a 100%)',
        fontFamily: 'Inter, -apple-system, sans-serif',
        textAlign: 'center',
        overflowY: 'auto',
    },

    categoryBadge: {
        display: 'inline-block',
        padding: '8px 20px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 2,
        color: '#fff',
        marginBottom: 16,
        textTransform: 'uppercase',
    },

    gameTitle: {
        fontSize: 28,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 32px 0',
        letterSpacing: 0.5,
        lineHeight: 1.2,
    },

    // Purpose Section
    purposeSection: {
        width: '100%',
        maxWidth: 360,
        marginBottom: 24,
        textAlign: 'left',
    },

    sectionLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        marginBottom: 8,
        textTransform: 'capitalize',
        letterSpacing: 0.5,
    },

    sectionText: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: 1.6,
        margin: 0,
    },

    // Learn Section
    learnSection: {
        width: '100%',
        maxWidth: 360,
        marginBottom: 32,
        textAlign: 'left',
    },

    skillsList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },

    skillItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 10,
    },

    skillCheck: {
        fontSize: 14,
        color: '#4CAF50',
        fontWeight: 700,
    },

    skillText: {
        fontSize: 14,
        color: '#fff',
        fontWeight: 500,
    },

    // Stats Row
    gameStatsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 32,
        width: '100%',
        maxWidth: 360,
    },

    statBox: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 12px',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 12,
        gap: 4,
    },

    statValue: {
        fontSize: 22,
        fontWeight: 700,
        color: '#fff',
    },

    statLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'capitalize',
        letterSpacing: 0.5,
    },

    readyButton: {
        width: '100%',
        maxWidth: 360,
        padding: '18px 32px',
        background: '#fff',
        border: 'none',
        borderRadius: 30,
        color: '#0a0a0a',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        marginBottom: 16,
        WebkitTapHighlightColor: 'transparent',
    },

    tipText: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
        margin: 0,
    },

    // Keep old styles for backwards compatibility
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
    statDivider: {
        width: 1,
        height: 32,
        background: 'rgba(255, 255, 255, 0.2)',
    },
    readyIcon: {
        fontSize: 14,
    },
};
