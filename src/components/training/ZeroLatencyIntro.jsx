/**
 * 🎬 ZERO-LATENCY INTRO MODAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Masked loading architecture:
 * - Shows explosion + game info modal
 * - Generates Level 1 in background during intro
 * - Instant reveal when user clicks "Start"
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateLevel } from '../lib/PokerScenarioGenerator';

export default function ZeroLatencyIntro({ isVisible, game, onComplete, onLevelReady }) {
    const videoRef = useRef(null);
    const [phase, setPhase] = useState('video'); // 'video' | 'ready' | 'complete'
    const [level1Data, setLevel1Data] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // CRITICAL: Generate Level 1 immediately when component mounts
    useEffect(() => {
        if (isVisible && !level1Data && !isGenerating) {
            setIsGenerating(true);
            console.log('🎲 [MASKED LOADING] Generating Level 1 during intro...');

            // Generate in background
            setTimeout(() => {
                const levelData = generateLevel(1);
                setLevel1Data(levelData);
                setIsGenerating(false);
                console.log('✅ [MASKED LOADING] Level 1 ready!', levelData);

                // Notify parent that level is ready
                if (onLevelReady) {
                    onLevelReady(levelData);
                }
            }, 0);
        }
    }, [isVisible, level1Data, isGenerating, onLevelReady]);

    useEffect(() => {
        if (isVisible) {
            setPhase('video');

            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(err => {
                    console.warn('Video autoplay blocked:', err);
                    setPhase('ready');
                });
            }
        }
    }, [isVisible]);

    const handleVideoEnd = () => {
        setPhase('ready');
    };

    const handleVideoError = () => {
        console.warn('Video failed to load, skipping to ready popup');
        setPhase('ready');
    };

    const handleSkipVideo = () => {
        if (videoRef.current) {
            videoRef.current.pause();
        }
        setPhase('ready');
    };

    const handleStart = () => {
        // User clicked "Start" - Level 1 should already be generated!
        if (!level1Data) {
            console.warn('⚠️ Level 1 not ready yet! This should never happen.');
            // Fallback: generate now (defeats the purpose but prevents crash)
            const levelData = generateLevel(1);
            if (onLevelReady) {
                onLevelReady(levelData);
            }
        }

        console.log('🚀 [ZERO-LATENCY] Starting game with pre-generated Level 1');
        setPhase('complete');

        if (onComplete) {
            onComplete();
        }
    };

    return (
        <AnimatePresence>
            {isVisible && phase !== 'complete' && (
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

                            <motion.div
                                style={styles.skipHint}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.5 }}
                                transition={{ delay: 1 }}
                            >
                                Tap to skip
                            </motion.div>

                            {/* Loading indicator (hidden but shows generation status) */}
                            {isGenerating && (
                                <div style={styles.debugInfo}>
                                    Generating Level 1...
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* READY POPUP PHASE */}
                    {phase === 'ready' && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
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

                            {/* Game Title */}
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

                            {/* Start Button - Shows loading state if Level 1 not ready */}
                            <motion.button
                                style={{
                                    ...styles.readyButton,
                                    opacity: level1Data ? 1 : 0.6,
                                    cursor: level1Data ? 'pointer' : 'wait'
                                }}
                                onClick={handleStart}
                                disabled={!level1Data}
                                whileHover={level1Data ? { scale: 1.02 } : {}}
                                whileTap={level1Data ? { scale: 0.98 } : {}}
                            >
                                {level1Data ? "I'm Ready" : 'Preparing...'}
                            </motion.button>

                            {/* Tip */}
                            <p style={styles.tipText}>
                                {level1Data ? 'Answer Quickly For Bonus XP' : 'Loading first scenario...'}
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

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
    videoContainer: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
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
    debugInfo: {
        position: 'absolute',
        top: 20,
        right: 20,
        background: 'rgba(0,0,0,0.8)',
        padding: '8px 12px',
        borderRadius: 4,
        color: '#FFD700',
        fontSize: 12,
        fontFamily: 'monospace',
    },
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
        transition: 'opacity 0.3s ease',
    },
    tipText: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
        margin: 0,
    },
};
