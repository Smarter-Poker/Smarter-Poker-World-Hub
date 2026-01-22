/**
 * RoundSummary.tsx
 * =================
 * Post-game victory/defeat screen with XP animation and blunder review.
 * The "addicting" part that shows progress and unlocks.
 *
 * Features:
 * - Large animated accuracy score
 * - Pass/Fail with themed visuals (gold vs red)
 * - XP gain animation with level-up effects
 * - Top 3 Blunders review section
 * - Next Level / Retry / Exit buttons
 * - Confetti celebration on pass
 *
 * @author Smarter.Poker Engineering
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface BlunderData {
    handNumber: number;
    heroHand: string;
    board?: string;
    userAction: string;
    correctAction: string;
    evLoss: number;
    damage: number;
}

interface SessionStats {
    handsPlayed: number;
    correctAnswers: number;
    accuracy: number;
    passed: boolean;
    finalHealth: number;
    xpEarned: number;
    timeElapsed: number;
    blunders?: BlunderData[];
    bestStreak?: number;
    perfectHands?: number;
}

interface RoundSummaryProps {
    isOpen: boolean;
    passed: boolean;
    level: number;
    passingGrade: number;
    stats: SessionStats;
    gameName: string;
    onNextLevel: () => void;
    onRetry: () => void;
    onExit: () => void;
    onReviewHand?: (blunder: BlunderData) => void;
}

// ============================================================================
// CONFETTI COMPONENT
// ============================================================================

const Confetti: React.FC<{ count: number }> = ({ count }) => {
    const colors = ['#ffd700', '#ff6b35', '#00d4ff', '#00ff88', '#aa66ff'];
    const pieces = Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: colors[i % colors.length],
        rotation: Math.random() * 360,
    }));

    return (
        <div style={styles.confettiContainer}>
            {pieces.map((piece) => (
                <motion.div
                    key={piece.id}
                    initial={{ y: -20, x: `${piece.x}vw`, opacity: 1, rotate: 0 }}
                    animate={{
                        y: '100vh',
                        rotate: piece.rotation + 720,
                        opacity: [1, 1, 0],
                    }}
                    transition={{
                        duration: 3 + Math.random() * 2,
                        delay: piece.delay,
                        ease: 'linear',
                    }}
                    style={{
                        position: 'absolute',
                        width: 10,
                        height: 10,
                        background: piece.color,
                        borderRadius: Math.random() > 0.5 ? '50%' : 0,
                    }}
                />
            ))}
        </div>
    );
};

// ============================================================================
// ANIMATED COUNTER
// ============================================================================

const AnimatedCounter: React.FC<{ target: number; duration?: number; suffix?: string }> = ({
    target,
    duration = 1500,
    suffix = '',
}) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let start = 0;
        const increment = target / (duration / 16);
        const timer = setInterval(() => {
            start += increment;
            if (start >= target) {
                setCount(target);
                clearInterval(timer);
            } else {
                setCount(Math.floor(start));
            }
        }, 16);
        return () => clearInterval(timer);
    }, [target, duration]);

    return <span>{count}{suffix}</span>;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RoundSummary: React.FC<RoundSummaryProps> = ({
    isOpen,
    passed,
    level,
    passingGrade,
    stats,
    gameName,
    onNextLevel,
    onRetry,
    onExit,
    onReviewHand,
}) => {
    const [phase, setPhase] = useState<'SCORE' | 'XP' | 'BLUNDERS' | 'ACTIONS'>('SCORE');
    const [showConfetti, setShowConfetti] = useState(false);

    // Animate through phases
    useEffect(() => {
        if (!isOpen) {
            setPhase('SCORE');
            return;
        }

        const timers: NodeJS.Timeout[] = [];

        // Phase 1: Show score (immediate)
        setPhase('SCORE');

        // Phase 2: Show XP after 1.5s
        timers.push(setTimeout(() => setPhase('XP'), 1500));

        // Phase 3: Show blunders after 3s
        timers.push(setTimeout(() => setPhase('BLUNDERS'), 3000));

        // Phase 4: Show actions after 4s
        timers.push(setTimeout(() => setPhase('ACTIONS'), 4000));

        // Show confetti if passed
        if (passed) {
            timers.push(setTimeout(() => setShowConfetti(true), 500));
        }

        return () => timers.forEach(clearTimeout);
    }, [isOpen, passed]);

    if (!isOpen) return null;

    const topBlunders = (stats.blunders || [])
        .sort((a, b) => b.damage - a.damage)
        .slice(0, 3);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.overlay}
            >
                {/* Confetti */}
                {showConfetti && passed && <Confetti count={80} />}

                <motion.div
                    initial={{ scale: 0.8, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    style={{
                        ...styles.card,
                        borderColor: passed ? '#ffd700' : '#ff4444',
                    }}
                >
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={styles.header}
                    >
                        <div style={{
                            fontSize: 72,
                            marginBottom: 12,
                        }}>
                            {passed ? '🏆' : '💪'}
                        </div>
                        <h1 style={{
                            ...styles.title,
                            color: passed ? '#ffd700' : '#ff6666',
                        }}>
                            {passed ? 'LEVEL CLEARED!' : 'KEEP PRACTICING'}
                        </h1>
                        <p style={styles.subtitle}>
                            {gameName} — Level {level}
                        </p>
                    </motion.div>

                    {/* Score Ring */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.4, type: 'spring' }}
                        style={styles.scoreContainer}
                    >
                        <div style={{
                            ...styles.scoreRing,
                            borderColor: passed ? '#ffd700' : '#ff4444',
                        }}>
                            <div style={styles.scoreValue}>
                                <AnimatedCounter target={Math.round(stats.accuracy)} suffix="%" />
                            </div>
                            <div style={styles.scoreLabel}>ACCURACY</div>
                        </div>
                        <div style={styles.passingInfo}>
                            Passing: {passingGrade}%
                        </div>
                    </motion.div>

                    {/* Stats Row */}
                    {(phase === 'XP' || phase === 'BLUNDERS' || phase === 'ACTIONS') && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={styles.statsRow}
                        >
                            <div style={styles.statBox}>
                                <span style={styles.statIcon}>✓</span>
                                <span style={styles.statValue}>{stats.correctAnswers}/{stats.handsPlayed}</span>
                                <span style={styles.statLabel}>Correct</span>
                            </div>
                            <div style={styles.statBox}>
                                <span style={styles.statIcon}>❤️</span>
                                <span style={styles.statValue}>{stats.finalHealth}</span>
                                <span style={styles.statLabel}>HP Left</span>
                            </div>
                            <div style={styles.statBox}>
                                <span style={styles.statIcon}>⭐</span>
                                <motion.span
                                    style={styles.statValue}
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5, delay: 0.5 }}
                                >
                                    +{stats.xpEarned}
                                </motion.span>
                                <span style={styles.statLabel}>XP Earned</span>
                            </div>
                            {stats.bestStreak && stats.bestStreak > 3 && (
                                <div style={styles.statBox}>
                                    <span style={styles.statIcon}>🔥</span>
                                    <span style={styles.statValue}>{stats.bestStreak}</span>
                                    <span style={styles.statLabel}>Best Streak</span>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Blunders Review */}
                    {(phase === 'BLUNDERS' || phase === 'ACTIONS') && topBlunders.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={styles.blundersSection}
                        >
                            <h3 style={styles.blundersTitle}>📝 Review Your Mistakes</h3>
                            <div style={styles.blundersList}>
                                {topBlunders.map((blunder, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        style={styles.blunderCard}
                                        onClick={() => onReviewHand?.(blunder)}
                                    >
                                        <div style={styles.blunderHand}>
                                            {blunder.heroHand}
                                        </div>
                                        <div style={styles.blunderInfo}>
                                            <div style={styles.blunderAction}>
                                                You: <span style={{ color: '#ff4444' }}>{blunder.userAction}</span>
                                                {' → '}
                                                Correct: <span style={{ color: '#00ff88' }}>{blunder.correctAction}</span>
                                            </div>
                                            <div style={styles.blunderDamage}>
                                                -{blunder.damage} HP
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Action Buttons */}
                    {phase === 'ACTIONS' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={styles.actionsRow}
                        >
                            {passed ? (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onNextLevel}
                                    style={styles.nextLevelBtn}
                                >
                                    Next Level →
                                </motion.button>
                            ) : (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onRetry}
                                    style={styles.retryBtn}
                                >
                                    🔄 Try Again
                                </motion.button>
                            )}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onExit}
                                style={styles.exitBtn}
                            >
                                Exit
                            </motion.button>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

// ============================================================================
// STYLES
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
    },
    confettiContainer: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 201,
    },
    card: {
        background: 'linear-gradient(135deg, #1a1a2e 0%, #0d0d1a 100%)',
        borderRadius: 24,
        padding: 40,
        maxWidth: 500,
        width: '90%',
        border: '3px solid',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        zIndex: 202,
    },
    header: {
        textAlign: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 800,
        margin: 0,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 8,
    },
    scoreContainer: {
        textAlign: 'center',
        marginBottom: 24,
    },
    scoreRing: {
        width: 140,
        height: 140,
        borderRadius: '50%',
        border: '6px solid',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 12px',
        background: 'rgba(0, 0, 0, 0.4)',
    },
    scoreValue: {
        fontSize: 42,
        fontWeight: 800,
        color: '#fff',
    },
    scoreLabel: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    passingInfo: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    statsRow: {
        display: 'flex',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 24,
        flexWrap: 'wrap',
    },
    statBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        minWidth: 70,
    },
    statIcon: {
        fontSize: 20,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 20,
        fontWeight: 700,
        color: '#00d4ff',
    },
    statLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
    },
    blundersSection: {
        marginBottom: 24,
    },
    blundersTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 12,
        textAlign: 'center',
    },
    blundersList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    blunderCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        background: 'rgba(255, 68, 68, 0.1)',
        borderRadius: 8,
        border: '1px solid rgba(255, 68, 68, 0.2)',
        cursor: 'pointer',
    },
    blunderHand: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        padding: '4px 10px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 6,
    },
    blunderInfo: {
        flex: 1,
    },
    blunderAction: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.8)',
    },
    blunderDamage: {
        fontSize: 11,
        color: '#ff4444',
        marginTop: 2,
    },
    actionsRow: {
        display: 'flex',
        gap: 12,
        justifyContent: 'center',
    },
    nextLevelBtn: {
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #ffd700, #ffaa00)',
        border: 'none',
        borderRadius: 12,
        color: '#000',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
    },
    retryBtn: {
        padding: '14px 32px',
        background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    exitBtn: {
        padding: '14px 32px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
};

export default RoundSummary;
