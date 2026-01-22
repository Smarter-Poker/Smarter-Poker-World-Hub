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
    finalHealth: number;
    xpEarned: number;
    xpBonus?: number;
    timeElapsed: number;
    blunders: BlunderData[];
    streakBest?: number;
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
// CONSTANTS
// ============================================================================

const CONFETTI_COLORS = ['#FFD700', '#FF6B35', '#00D4FF', '#4CAF50', '#9C27B0'];

// ============================================================================
// ANIMATED COUNTER COMPONENT
// ============================================================================

const AnimatedCounter: React.FC<{
    value: number;
    suffix?: string;
    duration?: number;
    size?: 'small' | 'medium' | 'large';
    color?: string;
}> = ({ value, suffix = '', duration = 1.5, size = 'large', color }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let startTime: number;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.round(eased * value));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [value, duration]);

    const fontSize = size === 'large' ? 72 : size === 'medium' ? 48 : 24;

    return (
        <span style={{
            fontSize,
            fontWeight: 900,
            color: color || '#fff',
            fontFamily: 'Inter, sans-serif',
        }}>
            {displayValue}{suffix}
        </span>
    );
};

// ============================================================================
// XP BAR COMPONENT
// ============================================================================

const XPGainBar: React.FC<{
    earned: number;
    bonus?: number;
    onComplete?: () => void;
}> = ({ earned, bonus = 0, onComplete }) => {
    const [showBonus, setShowBonus] = useState(false);
    const total = earned + bonus;

    useEffect(() => {
        if (bonus > 0) {
            const timer = setTimeout(() => setShowBonus(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [bonus]);

    useEffect(() => {
        if (onComplete) {
            const timer = setTimeout(onComplete, 2500);
            return () => clearTimeout(timer);
        }
    }, [onComplete]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            style={styles.xpContainer}
        >
            <div style={styles.xpHeader}>
                <span style={styles.xpIcon}>⭐</span>
                <span style={styles.xpTitle}>XP EARNED</span>
            </div>

            <div style={styles.xpBreakdown}>
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.8, type: 'spring' }}
                    style={styles.xpMain}
                >
                    +<AnimatedCounter value={earned} size="medium" color="#FFD700" />
                </motion.div>

                <AnimatePresence>
                    {showBonus && bonus > 0 && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            style={styles.xpBonus}
                        >
                            <span style={styles.bonusLabel}>PERFECT BONUS</span>
                            <span style={styles.bonusValue}>+{bonus}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                style={styles.xpTotal}
            >
                Total: <span style={{ color: '#FFD700', fontWeight: 800 }}>{total} XP</span>
            </motion.div>
        </motion.div>
    );
};

// ============================================================================
// BLUNDER CARD COMPONENT
// ============================================================================

const BlunderCard: React.FC<{
    blunder: BlunderData;
    rank: number;
    onReview?: () => void;
}> = ({ blunder, rank, onReview }) => {
    const getRankStyle = () => {
        if (rank === 1) return { bg: '#F44336', label: 'WORST' };
        if (rank === 2) return { bg: '#FF9800', label: '2ND' };
        return { bg: '#FFC107', label: '3RD' };
    };

    const rankStyle = getRankStyle();

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + rank * 0.1 }}
            style={styles.blunderCard}
            onClick={onReview}
        >
            {/* Rank Badge */}
            <div style={{
                ...styles.blunderRank,
                background: rankStyle.bg,
            }}>
                {rankStyle.label}
            </div>

            {/* Hand Info */}
            <div style={styles.blunderInfo}>
                <div style={styles.blunderHand}>
                    <span style={styles.handLabel}>Hand #{blunder.handNumber}</span>
                    <span style={styles.handCards}>{blunder.heroHand}</span>
                    {blunder.board && (
                        <span style={styles.boardCards}>{blunder.board}</span>
                    )}
                </div>

                <div style={styles.blunderActions}>
                    <div style={styles.actionRow}>
                        <span style={styles.actionLabel}>You:</span>
                        <span style={styles.userAction}>{blunder.userAction}</span>
                    </div>
                    <div style={styles.actionRow}>
                        <span style={styles.actionLabel}>Correct:</span>
                        <span style={styles.correctAction}>{blunder.correctAction}</span>
                    </div>
                </div>
            </div>

            {/* Damage */}
            <div style={styles.blunderDamage}>
                <span style={styles.damageValue}>-{blunder.damage}</span>
                <span style={styles.damageLabel}>HP</span>
            </div>

            {/* Review Arrow */}
            {onReview && (
                <div style={styles.reviewArrow}>▶</div>
            )}
        </motion.div>
    );
};

// ============================================================================
// CONFETTI EFFECT
// ============================================================================

const ConfettiPiece: React.FC<{
    color: string;
    index: number;
}> = ({ color, index }) => {
    const randomX = Math.random() * 100;
    const randomDelay = Math.random() * 0.5;
    const randomDuration = 2 + Math.random() * 2;
    const randomRotation = Math.random() * 720 - 360;

    return (
        <motion.div
            initial={{
                x: `${randomX}vw`,
                y: -20,
                rotate: 0,
                opacity: 1,
            }}
            animate={{
                y: '100vh',
                rotate: randomRotation,
                opacity: 0,
            }}
            transition={{
                duration: randomDuration,
                delay: randomDelay,
                ease: 'easeIn',
            }}
            style={{
                position: 'fixed',
                width: 10,
                height: 10,
                background: color,
                borderRadius: index % 2 === 0 ? '50%' : 2,
                zIndex: 1001,
                pointerEvents: 'none',
            }}
        />
    );
};

const Confetti: React.FC<{ count?: number }> = ({ count = 50 }) => {
    return (
        <>
            {[...Array(count)].map((_, i) => (
                <ConfettiPiece
                    key={i}
                    color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
                    index={i}
                />
            ))}
        </>
    );
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
    const [showConfetti, setShowConfetti] = useState(false);
    const [animationPhase, setAnimationPhase] = useState(0);

    // Trigger confetti on pass
    useEffect(() => {
        if (isOpen && passed) {
            const timer = setTimeout(() => setShowConfetti(true), 500);
            return () => clearTimeout(timer);
        }
    }, [isOpen, passed]);

    // Animation phases
    useEffect(() => {
        if (!isOpen) {
            setAnimationPhase(0);
            return;
        }

        const timers = [
            setTimeout(() => setAnimationPhase(1), 300),  // Score
            setTimeout(() => setAnimationPhase(2), 1500), // Stats
            setTimeout(() => setAnimationPhase(3), 2500), // Blunders
            setTimeout(() => setAnimationPhase(4), 3500), // Buttons
        ];

        return () => timers.forEach(clearTimeout);
    }, [isOpen]);

    // Get top 3 blunders sorted by damage
    const topBlunders = [...(stats.blunders || [])]
        .sort((a, b) => b.damage - a.damage)
        .slice(0, 3);

    // Calculate bonus XP
    const bonusXP = stats.perfectHands ? stats.perfectHands * 5 : 0;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.overlay}
            >
                {/* Confetti on pass */}
                {showConfetti && passed && <Confetti count={80} />}

                <motion.div
                    initial={{ scale: 0.8, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.8, y: 50 }}
                    style={{
                        ...styles.modal,
                        borderColor: passed ? '#FFD700' : '#F44336',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        ...styles.header,
                        background: passed
                            ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                            : 'linear-gradient(135deg, #F44336, #D32F2F)',
                    }}>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                            style={styles.headerIcon}
                        >
                            {passed ? '🏆' : '💪'}
                        </motion.div>
                        <h1 style={styles.headerTitle}>
                            {passed ? 'LEVEL CLEARED!' : 'KEEP TRAINING'}
                        </h1>
                        <p style={styles.headerSubtitle}>
                            {gameName} - Level {level}
                        </p>
                    </div>

                    {/* Score Section */}
                    <div style={styles.scoreSection}>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={animationPhase >= 1 ? { scale: 1 } : {}}
                            transition={{ type: 'spring', stiffness: 150 }}
                            style={styles.scoreCircle}
                        >
                            <div style={styles.scoreInner}>
                                <AnimatedCounter
                                    value={Math.round(stats.accuracy)}
                                    suffix="%"
                                    color={passed ? '#4CAF50' : '#F44336'}
                                />
                                <span style={styles.scoreLabel}>ACCURACY</span>
                            </div>
                            <svg style={styles.scoreRing} viewBox="0 0 100 100">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.1)"
                                    strokeWidth="8"
                                />
                                <motion.circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke={passed ? '#4CAF50' : '#F44336'}
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 45}`}
                                    initial={{ strokeDashoffset: 2 * Math.PI * 45 }}
                                    animate={{
                                        strokeDashoffset: 2 * Math.PI * 45 * (1 - stats.accuracy / 100),
                                    }}
                                    transition={{ duration: 1.5, delay: 0.5 }}
                                    style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                                />
                            </svg>
                        </motion.div>

                        <div style={styles.passingInfo}>
                            <span style={{
                                color: passed ? '#4CAF50' : '#F44336',
                                fontWeight: 700,
                            }}>
                                {passed ? '✓' : '✗'} {passingGrade}% required to pass
                            </span>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <AnimatePresence>
                        {animationPhase >= 2 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={styles.statsGrid}
                            >
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{stats.correctAnswers}</span>
                                    <span style={styles.statLabel}>Correct</span>
                                </div>
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{stats.handsPlayed - stats.correctAnswers}</span>
                                    <span style={styles.statLabel}>Mistakes</span>
                                </div>
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{stats.finalHealth}</span>
                                    <span style={styles.statLabel}>HP Left</span>
                                </div>
                                <div style={styles.statBox}>
                                    <span style={styles.statValue}>{Math.floor(stats.timeElapsed / 60)}:{(stats.timeElapsed % 60).toString().padStart(2, '0')}</span>
                                    <span style={styles.statLabel}>Time</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* XP Section */}
                    <AnimatePresence>
                        {animationPhase >= 2 && (
                            <XPGainBar earned={stats.xpEarned} bonus={bonusXP} />
                        )}
                    </AnimatePresence>

                    {/* Blunders Review */}
                    <AnimatePresence>
                        {animationPhase >= 3 && topBlunders.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={styles.blundersSection}
                            >
                                <h3 style={styles.blundersTitle}>
                                    📋 Top Blunders to Review
                                </h3>
                                <div style={styles.blundersList}>
                                    {topBlunders.map((blunder, index) => (
                                        <BlunderCard
                                            key={index}
                                            blunder={blunder}
                                            rank={index + 1}
                                            onReview={onReviewHand ? () => onReviewHand(blunder) : undefined}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action Buttons */}
                    <AnimatePresence>
                        {animationPhase >= 4 && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={styles.buttonSection}
                            >
                                {passed ? (
                                    <>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onNextLevel}
                                            style={styles.nextButton}
                                        >
                                            <span>Next Level</span>
                                            <span style={styles.nextArrow}>▶</span>
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onRetry}
                                            style={styles.retryButtonSecondary}
                                        >
                                            Practice Again
                                        </motion.button>
                                    </>
                                ) : (
                                    <>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onRetry}
                                            style={styles.retryButton}
                                        >
                                            <span>🔄</span>
                                            <span>Try Again</span>
                                        </motion.button>
                                    </>
                                )}
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={onExit}
                                    style={styles.exitButton}
                                >
                                    Exit to Menu
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Streak Badge */}
                    {stats.streakBest && stats.streakBest > 3 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 2 }}
                            style={styles.streakBadge}
                        >
                            🔥 {stats.streakBest} Hand Streak!
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

const styles: { [key: string]: React.CSSProperties } = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
        overflow: 'auto',
    },

    modal: {
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)',
        borderRadius: 24,
        width: '100%',
        maxWidth: 500,
        maxHeight: '90vh',
        overflow: 'auto',
        border: '3px solid',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    },

    header: {
        padding: '24px 20px',
        textAlign: 'center',
        borderRadius: '21px 21px 0 0',
    },

    headerIcon: {
        fontSize: 56,
        marginBottom: 8,
    },

    headerTitle: {
        margin: 0,
        fontSize: 28,
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 2px 4px rgba(0,0,0,0.3)',
        letterSpacing: 2,
    },

    headerSubtitle: {
        margin: '8px 0 0',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },

    scoreSection: {
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    scoreCircle: {
        position: 'relative',
        width: 180,
        height: 180,
    },

    scoreInner: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },

    scoreLabel: {
        fontSize: 12,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
        letterSpacing: 2,
    },

    scoreRing: {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
    },

    passingInfo: {
        marginTop: 16,
        fontSize: 14,
    },

    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        padding: '0 20px 24px',
    },

    statBox: {
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        padding: '12px 8px',
        textAlign: 'center',
    },

    statValue: {
        display: 'block',
        fontSize: 20,
        fontWeight: 800,
        color: '#00D4FF',
    },

    statLabel: {
        display: 'block',
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 4,
        textTransform: 'uppercase',
    },

    xpContainer: {
        padding: '20px',
        margin: '0 20px 20px',
        background: 'rgba(255, 215, 0, 0.1)',
        borderRadius: 16,
        border: '1px solid rgba(255, 215, 0, 0.3)',
    },

    xpHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },

    xpIcon: {
        fontSize: 20,
    },

    xpTitle: {
        fontSize: 12,
        fontWeight: 700,
        color: '#FFD700',
        letterSpacing: 2,
    },

    xpBreakdown: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
    },

    xpMain: {
        fontSize: 36,
        fontWeight: 900,
        color: '#FFD700',
    },

    xpBonus: {
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 12px',
        background: 'rgba(76, 175, 80, 0.2)',
        borderRadius: 8,
    },

    bonusLabel: {
        fontSize: 9,
        color: '#4CAF50',
        letterSpacing: 1,
    },

    bonusValue: {
        fontSize: 18,
        fontWeight: 800,
        color: '#4CAF50',
    },

    xpTotal: {
        marginTop: 12,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
    },

    blundersSection: {
        padding: '0 20px 20px',
    },

    blundersTitle: {
        margin: '0 0 12px',
        fontSize: 14,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.8)',
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
        padding: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'background 0.2s ease',
    },

    blunderRank: {
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
        textAlign: 'center',
    },

    blunderInfo: {
        flex: 1,
    },

    blunderHand: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },

    handLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    handCards: {
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
    },

    boardCards: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },

    blunderActions: {
        display: 'flex',
        gap: 16,
    },

    actionRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    },

    actionLabel: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.4)',
    },

    userAction: {
        fontSize: 12,
        fontWeight: 600,
        color: '#F44336',
    },

    correctAction: {
        fontSize: 12,
        fontWeight: 600,
        color: '#4CAF50',
    },

    blunderDamage: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },

    damageValue: {
        fontSize: 18,
        fontWeight: 800,
        color: '#F44336',
    },

    damageLabel: {
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.4)',
    },

    reviewArrow: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.3)',
    },

    buttonSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },

    nextButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
        border: 'none',
        borderRadius: 16,
        fontSize: 18,
        fontWeight: 800,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)',
    },

    nextArrow: {
        fontSize: 14,
    },

    retryButton: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
        border: 'none',
        borderRadius: 16,
        fontSize: 18,
        fontWeight: 800,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 4px 15px rgba(0, 212, 255, 0.4)',
    },

    retryButtonSecondary: {
        padding: '12px 24px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },

    exitButton: {
        padding: '12px 24px',
        background: 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.6)',
        cursor: 'pointer',
    },

    streakBadge: {
        position: 'absolute',
        top: -15,
        right: 20,
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #FF6B35, #FF4500)',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        boxShadow: '0 4px 15px rgba(255, 107, 53, 0.5)',
    },
};

export default RoundSummary;
