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

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══ Phase GTO-CLONE: AICoachEngine for local coaching fallback ═══
import { explainDecision, generateStudyPlan, COACH_PERSONALITY } from '../../engines/AICoachEngine';

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
    diamondsEarned: number;
    timeElapsed: number;
    blunders?: BlunderData[];
    bestStreak?: number;
    perfectHands?: number;
}

// AI Coaching response from Grok
interface AICoaching {
    overallGrade: string;
    headline: string;
    strengths: string[];
    areasToImprove: string[];
    detailedFeedback: string;
    recommendedDrill?: {
        name: string;
        reason: string;
    };
    motivationalQuote?: string;
    readyForNextLevel: boolean;
}

interface RoundSummaryProps {
    isOpen: boolean;
    passed: boolean;
    level: number;
    passingGrade: number;
    stats: SessionStats;
    gameName: string;
    gameId?: string;  // For AI coaching API
    mistakes?: Array<{ question: any; userAnswer: string; correctAnswer: string }>;
    // ═══ PHASE 15: Enhanced coaching data ═══
    gtowScore?: number;
    classificationCounts?: Record<string, number>;
    positionStats?: Record<string, { correct: number; total: number }>;
    weakSpots?: Array<{ position: string; street: string; spotType: string; mistakeRate: number }>;
    totalEVLoss?: number;
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
    const [prevCount, setPrevCount] = useState(0);

    useEffect(() => {
        let start = 0;
        const increment = target / (duration / 16);
        const timer = setInterval(() => {
            start += increment;
            if (start >= target) {
                setPrevCount(count);
                setCount(target);
                clearInterval(timer);
            } else {
                setPrevCount(count);
                setCount(Math.floor(start));
            }
        }, 16);
        return () => clearInterval(timer);
    }, [target, duration]);

    return (
        <motion.span
            key={count}
            initial={{ scale: 1.2, color: '#00d4ff' }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ duration: 0.3 }}
        >
            {count}{suffix}
        </motion.span>
    );
};

// ============================================================================
// ENGINE COACHING HELPERS (No AI — Pure Logic)
// ============================================================================

function _identifyStrengths(stats: any, positionStats?: any): string[] {
    const strengths: string[] = [];
    if (stats.accuracy >= 80) strengths.push('Consistent decision-making');
    if (stats.bestStreak >= 8) strengths.push(`Excellent streak of ${stats.bestStreak} correct`);
    else if (stats.bestStreak >= 5) strengths.push('Good streak management');
    if (positionStats) {
        const strongPositions = Object.entries(positionStats || {})
            .filter(([_, v]: [string, any]) => v.total >= 3 && (v.correct / v.total) >= 0.8)
            .map(([pos]) => pos);
        if (strongPositions.length > 0) strengths.push(`Strong from ${strongPositions.join(', ')}`);
    }
    if (strengths.length === 0) strengths.push('Session completed');
    return strengths;
}

function _identifyWeaknesses(stats: any, weakSpots?: any[], classificationCounts?: any): string[] {
    const areas: string[] = [];
    if (classificationCounts?.blunder > 0) areas.push(`${classificationCounts.blunder} blunder${classificationCounts.blunder > 1 ? 's' : ''} — review these hands`);
    if (weakSpots && weakSpots.length > 0) {
        const worst = weakSpots[0];
        areas.push(`Weakest spot: ${worst.position || ''} ${worst.street || ''} ${worst.spotType || ''}`.trim());
    }
    if (stats.accuracy < 60) areas.push('Core GTO fundamentals need work');
    return areas;
}

function _buildDetailedFeedback(stats: any, gtowScore?: number, totalEVLoss?: number, classificationCounts?: any): string {
    let feedback = `You played ${stats.handsPlayed} hands with ${stats.accuracy}% accuracy.`;
    if (gtowScore !== undefined) feedback += ` GTOW Score: ${gtowScore}.`;
    if (totalEVLoss !== undefined && totalEVLoss > 0) feedback += ` Total EV loss: ${totalEVLoss.toFixed(1)} BB.`;
    if (stats.bestStreak > 5) feedback += ` Great streak of ${stats.bestStreak}!`;
    else feedback += ' Work on building longer correct streaks.';
    if (classificationCounts) {
        const best = classificationCounts.best || 0;
        const correct = classificationCounts.correct || 0;
        if (best + correct > 0) feedback += ` ${best + correct} optimal/correct decisions.`;
    }
    return feedback;
}

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
    gameId,
    mistakes,
    // ═══ PHASE 15: Enhanced coaching data ═══
    gtowScore,
    classificationCounts,
    positionStats,
    weakSpots,
    totalEVLoss,
    onNextLevel,
    onRetry,
    onExit,
    onReviewHand,
}) => {
    const [phase, setPhase] = useState<'SCORE' | 'DIAMONDS' | 'COACHING' | 'BLUNDERS' | 'ACTIONS'>('SCORE');
    const [showConfetti, setShowConfetti] = useState(false);
    const [aiCoaching, setAiCoaching] = useState<AICoaching | null>(null);
    const [isLoadingCoaching, setIsLoadingCoaching] = useState(false);

    // ═══ Generate coaching from local AICoachEngine (no AI API) ═══
    useEffect(() => {
        if (!isOpen || !gameId) return;

        setIsLoadingCoaching(true);
        try {
            const localCoaching: AICoaching = {
                overallGrade: stats.accuracy >= 90 ? 'A+' : stats.accuracy >= 80 ? 'A' : stats.accuracy >= 70 ? 'B' : stats.accuracy >= 60 ? 'C' : 'D',
                headline: stats.accuracy >= 90
                    ? 'Exceptional session — GTO mastery in action.'
                    : stats.accuracy >= 80
                    ? 'Strong session — your GTO fundamentals are solid.'
                    : stats.accuracy >= 70
                    ? 'Good session — a few spots to tighten up.'
                    : stats.accuracy >= 60
                    ? 'Decent session with room for improvement.'
                    : 'Focus on the basics — review your biggest mistakes.',
                strengths: _identifyStrengths(stats, positionStats),
                areasToImprove: _identifyWeaknesses(stats, weakSpots, classificationCounts),
                detailedFeedback: _buildDetailedFeedback(stats, gtowScore, totalEVLoss, classificationCounts),
                readyForNextLevel: stats.accuracy >= 85 && (gtowScore === undefined || gtowScore >= 70),
            };

            // Generate study plan from mistakes
            if (mistakes && mistakes.length > 0) {
                const studyPlan = generateStudyPlan(mistakes.map(m => ({
                    type: 'mistake',
                    title: m.correctAnswer || 'Unknown',
                    description: `Chose ${m.userAnswer} instead of ${m.correctAnswer}`,
                    severity: 'major',
                })));
                if (studyPlan && studyPlan.plan && studyPlan.plan.length > 0) {
                    localCoaching.recommendedDrill = {
                        name: (studyPlan.plan[0] as any).focus || 'Review Mistakes',
                        reason: (studyPlan.plan[0] as any).tip || 'Practice your weakest spots',
                    };
                }
            }
            setAiCoaching(localCoaching);
        } catch (err) {
            console.warn('[RoundSummary] Engine coaching failed:', err);
        } finally {
            setIsLoadingCoaching(false);
        }
    }, [isOpen, gameId, gameName, level, stats, mistakes]);

    // Animate through phases
    useEffect(() => {
        if (!isOpen) {
            setPhase('SCORE');
            return;
        }

        const timers: NodeJS.Timeout[] = [];

        // Phase 1: Show score (immediate)
        setPhase('SCORE');

        // Phase 2: Show Diamonds after 1.5s
        timers.push(setTimeout(() => setPhase('DIAMONDS'), 1500));

        // Phase 3: Show coaching after 2.5s (if AI coaching available)
        timers.push(setTimeout(() => setPhase('COACHING'), 2500));

        // Phase 4: Show blunders after 4s
        timers.push(setTimeout(() => setPhase('BLUNDERS'), 4000));

        // Phase 5: Show actions after 5s
        timers.push(setTimeout(() => setPhase('ACTIONS'), 5000));

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
                    className="round-summary-card"
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
                            {passed ? '': ''}
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
                        <motion.div
                            animate={{
                                borderColor: passed ? '#ffd700' : '#ff4444',
                                boxShadow: passed
                                    ? '0 0 30px rgba(255, 215, 0, 0.5), inset 0 0 20px rgba(255, 215, 0, 0.2)'
                                    : '0 0 20px rgba(255, 68, 68, 0.4), inset 0 0 15px rgba(255, 68, 68, 0.1)'
                            }}
                            transition={{ duration: 0.5 }}
                            style={{
                                ...styles.scoreRing,
                                borderColor: passed ? '#ffd700' : '#ff4444',
                            }}
                        >
                            <div style={styles.scoreValue}>
                                <AnimatedCounter target={Math.round(stats.accuracy)} suffix="%" />
                            </div>
                            <div style={styles.scoreLabel}>ACCURACY</div>
                        </motion.div>
                        <div style={styles.passingInfo}>
                            Passing: {passingGrade}%
                        </div>
                    </motion.div>

                    {/* Stats Row */}
                    {(phase === 'DIAMONDS' || phase === 'COACHING' || phase === 'BLUNDERS' || phase === 'ACTIONS') && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={styles.statsRow}
                        >
                            <motion.div
                                whileHover={{ scale: 1.1, background: 'rgba(255, 255, 255, 0.08)' }}
                                style={styles.statBox}
                            >
                                <span style={styles.statIcon}>✓</span>
                                <span style={styles.statValue}>{stats.correctAnswers}/{stats.handsPlayed}</span>
                                <span style={styles.statLabel}>Correct</span>
                            </motion.div>
                            <motion.div
                                whileHover={{ scale: 1.1, background: 'rgba(255, 255, 255, 0.08)' }}
                                style={styles.statBox}
                            >
                                <span style={styles.statIcon}></span>
                                <span style={styles.statValue}>{stats.finalHealth}</span>
                                <span style={styles.statLabel}>HP Left</span>
                            </motion.div>
                            <motion.div
                                whileHover={{ scale: 1.1, background: 'rgba(255, 215, 0, 0.15)' }}
                                style={styles.statBox}
                            >
                                <span style={styles.statIcon}>★</span>
                                <motion.span
                                    style={styles.statValue}
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ duration: 0.5, delay: 0.5 }}
                                >
                                    +{stats.diamondsEarned}
                                </motion.span>
                                <span style={styles.statLabel}>Diamonds Earned</span>
                            </motion.div>
                            {stats.bestStreak && stats.bestStreak > 3 && (
                                <motion.div
                                    whileHover={{ scale: 1.1, background: 'rgba(255, 100, 50, 0.15)' }}
                                    style={styles.statBox}
                                >
                                    <span style={styles.statIcon}>▲</span>
                                    <span style={styles.statValue}>{stats.bestStreak}</span>
                                    <span style={styles.statLabel}>Best Streak</span>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {/* JARVIS AI COACHING */}
                    {(phase === 'COACHING' || phase === 'BLUNDERS' || phase === 'ACTIONS') && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                marginBottom: 24,
                                padding: 16,
                                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 212, 255, 0.05))',
                                borderRadius: 12,
                                border: '1px solid rgba(0, 212, 255, 0.3)'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 12,
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#00d4ff',
                                textTransform: 'uppercase',
                                letterSpacing: 1
                            }}>
                                 Jarvis Coach
                                {isLoadingCoaching && (
                                    <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                        style={{ marginLeft: 8 }}
                                    >
                                        ⏳
                                    </motion.span>
                                )}
                            </div>

                            {aiCoaching ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Headline */}
                                    <p style={{
                                        fontSize: 16,
                                        fontWeight: 600,
                                        color: '#fff',
                                        margin: 0,
                                        lineHeight: 1.4
                                    }}>
                                        {aiCoaching.headline}
                                    </p>

                                    {/* Detailed Feedback */}
                                    <p style={{
                                        fontSize: 13,
                                        color: 'rgba(255,255,255,0.8)',
                                        margin: 0,
                                        lineHeight: 1.5
                                    }}>
                                        {aiCoaching.detailedFeedback}
                                    </p>

                                    {/* Strengths & Improvements */}
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {aiCoaching.strengths?.length > 0 && (
                                            <div style={{ flex: 1, minWidth: 140 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>
                                                    ✓ STRENGTHS
                                                </div>
                                                {aiCoaching.strengths.slice(0, 2).map((s, i) => (
                                                    <p key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '2px 0' }}>
                                                        • {s}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                        {aiCoaching.areasToImprove?.length > 0 && (
                                            <div style={{ flex: 1, minWidth: 140 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
                                                     FOCUS AREAS
                                                </div>
                                                {aiCoaching.areasToImprove.slice(0, 2).map((a, i) => (
                                                    <p key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: '2px 0' }}>
                                                        • {a}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Recommended Drill */}
                                    {aiCoaching.recommendedDrill && (
                                        <div style={{
                                            padding: '10px 12px',
                                            background: 'rgba(255, 215, 0, 0.1)',
                                            borderRadius: 8,
                                            border: '1px solid rgba(255, 215, 0, 0.3)'
                                        }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>
                                                 RECOMMENDED NEXT
                                            </div>
                                            <p style={{ fontSize: 12, color: '#fff', margin: 0, fontWeight: 500 }}>
                                                {aiCoaching.recommendedDrill.name}
                                            </p>
                                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>
                                                {aiCoaching.recommendedDrill.reason}
                                            </p>
                                        </div>
                                    )}

                                    {/* Motivational Quote */}
                                    {aiCoaching.motivationalQuote && (
                                        <p style={{
                                            fontSize: 11,
                                            fontStyle: 'italic',
                                            color: 'rgba(255,255,255,0.5)',
                                            margin: '4px 0 0 0',
                                            textAlign: 'center'
                                        }}>
                                            "{aiCoaching.motivationalQuote}"
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div style={{
                                    textAlign: 'center',
                                    padding: 16,
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: 13
                                }}>
                                    {isLoadingCoaching ? 'Jarvis is analyzing your session...' : 'Coaching feedback unavailable'}
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
                            <h3 style={styles.blundersTitle}> Review Your Mistakes</h3>
                            <div style={styles.blundersList}>
                                {topBlunders.map((blunder, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        whileHover={{
                                            scale: 1.03,
                                            x: 8,
                                            boxShadow: '0 8px 24px rgba(255, 68, 68, 0.3)'
                                        }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                            ...styles.blunderCard,
                                            transition: 'all 0.2s ease'
                                        }}
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
                                     Try Again
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
        overflowY: 'auto',
        maxHeight: '90vh',
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
        padding: '0 10px',
    },
    statBox: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        minWidth: 70,
        transition: 'all 0.3s ease',
        cursor: 'default',
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
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
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
        flexWrap: 'wrap',
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
        boxShadow: '0 4px 16px rgba(255, 215, 0, 0.4)',
        transition: 'all 0.3s ease',
        minWidth: 120,
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
        boxShadow: '0 4px 16px rgba(0, 212, 255, 0.3)',
        transition: 'all 0.3s ease',
        minWidth: 120,
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
        transition: 'all 0.3s ease',
        minWidth: 100,
    },
};

// ============================================================================
// LOADING SKELETON
// ============================================================================

export const RoundSummarySkeleton: React.FC = () => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={styles.overlay}
        >
            <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                style={{
                    ...styles.card,
                    borderColor: 'rgba(255,255,255,0.2)'
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div className="skeleton-pulse" style={{
                        width: 72,
                        height: 72,
                        margin: '0 auto 12px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)'
                    }} />
                    <div className="skeleton-pulse" style={{
                        width: 200,
                        height: 28,
                        margin: '0 auto 8px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.1)'
                    }} />
                    <div className="skeleton-pulse" style={{
                        width: 120,
                        height: 14,
                        margin: '0 auto',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.05)'
                    }} />
                </div>

                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div className="skeleton-pulse" style={{
                        width: 140,
                        height: 140,
                        margin: '0 auto',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)'
                    }} />
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 20,
                    marginBottom: 24,
                    flexWrap: 'wrap'
                }}>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="skeleton-pulse" style={{
                            width: 70,
                            height: 80,
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.05)'
                        }} />
                    ))}
                </div>

                <div style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'center'
                }}>
                    <div className="skeleton-pulse" style={{
                        width: 120,
                        height: 48,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.1)'
                    }} />
                    <div className="skeleton-pulse" style={{
                        width: 80,
                        height: 48,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)'
                    }} />
                </div>

                <style>{`
                    @keyframes skeleton-pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.4; }
                    }
                    .skeleton-pulse {
                        animation: skeleton-pulse 2s ease-in-out infinite;
                    }
                    @media (max-width: 640px) {
                        .round-summary-card {
                            padding: 20px !important;
                            width: 95% !important;
                        }
                    }
                `}</style>
            </motion.div>
        </motion.div>
    );
};

export default RoundSummary;
