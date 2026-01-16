/**
 * 🎮 TRAINING PLAY PAGE — FULL VIDEO GAME EXPERIENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features:
 * - Haptic vibrations on actions
 * - Sound effects (correct, incorrect, tick, streak)
 * - Intense pressure countdown with visual/audio feedback
 * - Physics-based card dealing animations
 * - Chip stacks with movement
 * - Screen shake on correct/incorrect
 * - Streak fire effects
 * - XP burst animations
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getGameById, TRAINING_LIBRARY } from '../../../../src/data/TRAINING_LIBRARY';
import useTrainingProgress from '../../../../src/hooks/useTrainingProgress';
import feedback, { EFFECT_STYLES, screenEffects } from '../../../../src/engine/HapticsFeedback';
import { getQuestionsForGame } from '../../../../src/data/QUESTIONS_LIBRARY';
import { WorldNavHeader } from '../../../../src/components/navigation/WorldNavHeader';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const QUESTIONS_PER_RUN = 20;
const PASS_THRESHOLD = 85;
const TIME_PER_QUESTION = 15;

// Card suits
const SUITS = {
    s: { symbol: '♠', color: '#1a1a2e' },
    h: { symbol: '♥', color: '#e53935' },
    d: { symbol: '♦', color: '#42a5f5' },
    c: { symbol: '♣', color: '#43a047' },
};

// Seat positions - Hero at bottom middle (270°)
const SEATS = [
    { id: 'hero', angle: 270, label: 'HERO', isHero: true },
    { id: 'sb', angle: 225, label: 'SB' },
    { id: 'bb', angle: 180, label: 'BB' },
    { id: 'utg', angle: 135, label: 'UTG' },
    { id: 'hj', angle: 90, label: 'HJ' },
    { id: 'co', angle: 45, label: 'CO' },
    { id: 'btn', angle: 315, label: 'BTN' },
    { id: 'mp', angle: 0, label: 'MP' },
];

// Sample scenarios
const SAMPLE_SCENARIOS = [
    {
        id: 1,
        title: 'River Bluff Spot',
        situation: 'You raised preflop from CO with A♠K♦, BB called. Flop: J♠7♥2♣. You c-bet, villain calls. Turn: 4♦. Check-check. River: 9♠. Villain checks.',
        heroCards: ['As', 'Kd'],
        board: ['Js', '7h', '2c', '4d', '9s'],
        potSize: 12,
        villainStack: 45,
        options: [
            { id: 'check', text: 'CHECK', ev: -1.2 },
            { id: 'bet-33', text: 'BET 33%', ev: 0.8 },
            { id: 'bet-75', text: 'BET 75%', ev: 2.1, isCorrect: true },
            { id: 'bet-125', text: 'OVERBET 125%', ev: 0.4 },
        ],
        explanation: 'With zero showdown value, betting is mandatory. 75% pot targets villain\'s medium-strength hands that might hero-call but can\'t raise.',
    },
    {
        id: 2,
        title: 'Value Bet Sizing',
        situation: 'BTN raises, you 3-bet from BB with Q♥Q♠, BTN calls. Flop: Q♦8♣3♠. You bet 33%, BTN calls. Turn: 5♥. What\'s your action?',
        heroCards: ['Qh', 'Qs'],
        board: ['Qd', '8c', '3s', '5h'],
        potSize: 18,
        villainStack: 72,
        options: [
            { id: 'check', text: 'CHECK', ev: 3.2 },
            { id: 'bet-33', text: 'BET 33%', ev: 5.8, isCorrect: true },
            { id: 'bet-75', text: 'BET 75%', ev: 4.1 },
            { id: 'all-in', text: 'ALL-IN', ev: -2.3 },
        ],
        explanation: 'With top set on a dry board, we use small sizing to keep villain\'s entire range in.',
    },
    {
        id: 3,
        title: 'ICM Pressure',
        situation: 'Final table bubble, 6 left pay 5. You have 25BB in SB. Folds to you. BB covers with 40BB. You have K♠J♠.',
        heroCards: ['Ks', 'Js'],
        board: [],
        potSize: 1.5,
        villainStack: 40,
        options: [
            { id: 'fold', text: 'FOLD', ev: -0.3 },
            { id: 'limp', text: 'LIMP', ev: 0.1 },
            { id: 'raise-2.5', text: 'RAISE 2.5x', ev: 0.4 },
            { id: 'shove', text: 'ALL-IN', ev: 1.2, isCorrect: true },
        ],
        explanation: 'With 25BB, KJs is a clear shove from SB. ICM pressure means BB must fold wide.',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function PlayingCard({ card, size = 'medium', delay = 0, faceDown = false }) {
    if (!card) return null;

    const suit = card[card.length - 1];
    const rank = card.slice(0, -1);
    const suitConfig = SUITS[suit] || SUITS.s;

    const sizes = {
        small: { w: 36, h: 50, font: 12, suit: 14 },
        medium: { w: 48, h: 68, font: 16, suit: 18 },
        large: { w: 60, h: 84, font: 20, suit: 24 },
    };
    const s = sizes[size] || sizes.medium;

    return (
        <motion.div
            style={{
                width: s.w,
                height: s.h,
                borderRadius: 6,
                background: faceDown
                    ? 'linear-gradient(135deg, #1a2744, #2d3a5a)'
                    : 'linear-gradient(135deg, #fff, #f0f0f0)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            initial={{ y: -100, rotateY: 180, opacity: 0 }}
            animate={{ y: 0, rotateY: 0, opacity: 1 }}
            transition={{ delay, type: 'spring', stiffness: 300, damping: 20 }}
            onAnimationComplete={() => feedback.deal()}
        >
            {!faceDown && (
                <>
                    <span style={{ fontSize: s.font, fontWeight: 800, color: suitConfig.color }}>{rank}</span>
                    <span style={{ fontSize: s.suit, color: suitConfig.color }}>{suitConfig.symbol}</span>
                </>
            )}
        </motion.div>
    );
}

function ChipStack({ amount }) {
    const chipColors = ['#FFD700', '#4CAF50', '#E53935', '#2196F3', '#9C27B0'];
    const chipCount = Math.min(Math.ceil(amount / 10), 5);

    return (
        <motion.div style={styles.chipStack}>
            {[...Array(chipCount)].map((_, i) => (
                <motion.div
                    key={i}
                    style={{
                        ...styles.chip,
                        background: chipColors[i % chipColors.length],
                        transform: `translateY(${-i * 3}px)`,
                    }}
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1, y: -i * 3 }}
                    transition={{ delay: i * 0.05 }}
                    onAnimationComplete={() => i === 0 && feedback.chip()}
                />
            ))}
            <span style={styles.chipAmount}>{amount}BB</span>
        </motion.div>
    );
}

// INTENSE PRESSURE TIMER with haptics and visual effects
function PressureTimer({ timeLeft, maxTime, onTick }) {
    const percent = (timeLeft / maxTime) * 100;
    const isLow = percent < 30;
    const isCritical = percent < 15;

    // Trigger haptic on tick when low
    useEffect(() => {
        if (isLow && timeLeft > 0) {
            feedback.tick(timeLeft, maxTime);
        }
        if (isCritical && timeLeft > 0 && timeLeft % 1 < 0.1) {
            feedback.pressure();
        }
    }, [Math.round(timeLeft), isLow, isCritical]);

    const getColor = () => {
        if (isCritical) return '#FF1744';
        if (isLow) return '#FF6B35';
        if (percent < 50) return '#FFD700';
        return '#4CAF50';
    };

    return (
        <motion.div
            style={styles.timerContainer}
            animate={isCritical ? {
                scale: [1, 1.1, 1],
                boxShadow: ['0 0 0 0 rgba(255,23,68,0)', '0 0 30px 10px rgba(255,23,68,0.5)', '0 0 0 0 rgba(255,23,68,0)']
            } : {}}
            transition={{ duration: 0.5, repeat: isCritical ? Infinity : 0 }}
        >
            <svg width={70} height={70} style={{ transform: 'rotate(-90deg)' }}>
                <circle
                    cx={35} cy={35} r={30}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={5}
                />
                <motion.circle
                    cx={35} cy={35} r={30}
                    fill="none"
                    stroke={getColor()}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={188}
                    strokeDashoffset={188 - (188 * percent) / 100}
                    style={{ filter: `drop-shadow(0 0 ${isCritical ? 15 : 8}px ${getColor()})` }}
                />
            </svg>
            <div style={styles.timerInner}>
                <motion.span
                    style={{
                        ...styles.timerValue,
                        color: getColor(),
                        fontSize: isCritical ? 28 : 22,
                    }}
                    animate={isCritical ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.3, repeat: isCritical ? Infinity : 0 }}
                >
                    {Math.ceil(timeLeft)}
                </motion.span>
                <span style={styles.timerLabel}>SEC</span>
            </div>
            {isCritical && (
                <motion.div
                    style={styles.urgentPulse}
                    animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                />
            )}
        </motion.div>
    );
}

// Streak Fire Display
function StreakFire({ streak }) {
    if (streak < 2) return null;

    const getStreakLevel = () => {
        if (streak >= 10) return { text: 'ON FIRE!', color: '#FF1744', emoji: '🔥🔥🔥' };
        if (streak >= 7) return { text: 'BLAZING!', color: '#FF6B35', emoji: '🔥🔥' };
        if (streak >= 5) return { text: 'HOT!', color: '#FFD700', emoji: '🔥' };
        if (streak >= 3) return { text: 'NICE!', color: '#4CAF50', emoji: '✨' };
        return { text: '', color: '#fff', emoji: '' };
    };

    const level = getStreakLevel();

    return (
        <motion.div
            style={{ ...styles.streakDisplay, color: level.color }}
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            key={streak}
        >
            <span style={styles.streakEmoji}>{level.emoji}</span>
            <span style={styles.streakCount}>{streak}</span>
            <span style={styles.streakText}>{level.text}</span>
        </motion.div>
    );
}

// XP Burst Animation
function XPBurst({ amount, isVisible }) {
    if (!isVisible) return null;

    return (
        <motion.div
            style={styles.xpBurst}
            initial={{ scale: 0, y: 0, opacity: 1 }}
            animate={{ scale: 1.5, y: -50, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
        >
            +{amount} XP
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;
    const { recordSession, getGameProgress } = useTrainingProgress();
    const arenaRef = useRef(null);

    // State
    const [game, setGame] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
    const [showResult, setShowResult] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isComplete, setIsComplete] = useState(false);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [xpEarned, setXpEarned] = useState(0);
    const [showXPBurst, setShowXPBurst] = useState(false);
    const [lastXP, setLastXP] = useState(0);

    const timerRef = useRef(null);
    const currentScenario = questions[questionIndex] || questions[0];

    // Load game and questions
    useEffect(() => {
        if (gameId) {
            const foundGame = getGameById(gameId);
            if (foundGame) {
                setGame(foundGame);
                // Load questions from database
                const gameQuestions = getQuestionsForGame(gameId);
                setQuestions(gameQuestions);
            }
        }
    }, [gameId]);

    // Timer with haptic feedback
    useEffect(() => {
        if (showResult || isComplete) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0.1) {
                    handleAnswer(null);
                    return 0;
                }
                return prev - 0.1;
            });
        }, 100);

        return () => clearInterval(timerRef.current);
    }, [questionIndex, showResult, isComplete]);

    // Handle answer
    const handleAnswer = useCallback((optionId) => {
        if (showResult || !currentScenario?.options) return;
        clearInterval(timerRef.current);
        feedback.tap();

        const correct = currentScenario.options.find(o => o.id === optionId);
        const isCorrect = correct?.isCorrect || false;

        setSelectedAnswer(optionId);
        setShowResult(true);

        if (isCorrect) {
            // SUCCESS feedback
            feedback.correct();
            screenEffects.flash(arenaRef.current, 'green');

            setCorrectCount(prev => prev + 1);
            const newStreak = streak + 1;
            setStreak(newStreak);
            setBestStreak(prev => Math.max(prev, newStreak));

            if (newStreak >= 3) {
                feedback.streak(newStreak);
            }

            // XP calculation
            const baseXP = 100;
            const streakMultiplier = newStreak >= 10 ? 2.5 : newStreak >= 7 ? 2.0 : newStreak >= 5 ? 1.75 : newStreak >= 3 ? 1.5 : 1.0;
            const speedMultiplier = timeLeft > TIME_PER_QUESTION * 0.8 ? 2.0 : timeLeft > TIME_PER_QUESTION * 0.6 ? 1.5 : 1.0;
            const earned = Math.round(baseXP * streakMultiplier * speedMultiplier);

            setLastXP(earned);
            setXpEarned(prev => prev + earned);
            setShowXPBurst(true);
            setTimeout(() => setShowXPBurst(false), 800);
        } else {
            // FAILURE feedback
            feedback.incorrect();
            screenEffects.shake(arenaRef.current, 'medium');
            screenEffects.flash(arenaRef.current, 'red');
            setStreak(0);
        }
    }, [showResult, currentScenario, streak, timeLeft]);

    // Next question
    const handleNext = () => {
        feedback.tap();

        if (questionIndex + 1 >= QUESTIONS_PER_RUN) {
            setIsComplete(true);
            const accuracy = Math.round((correctCount / QUESTIONS_PER_RUN) * 100);
            const passed = accuracy >= PASS_THRESHOLD;

            if (passed) {
                feedback.levelUp();
            }

            recordSession(gameId, {
                accuracy,
                score: correctCount,
                xpEarned,
                bestStreak,
                passed,
                level: 1,
            });
        } else {
            setQuestionIndex(prev => prev + 1);
            setShowResult(false);
            setSelectedAnswer(null);
            setTimeLeft(TIME_PER_QUESTION);
        }
    };

    const handleExit = () => {
        feedback.tap();
        router.push('/hub/training');
    };

    if (!game || questions.length === 0 || !currentScenario || !currentScenario.options) {
        return (
            <div style={styles.loading}>
                <motion.div
                    style={styles.spinner}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
            </div>
        );
    }

    // Complete screen
    if (isComplete) {
        const accuracy = Math.round((correctCount / QUESTIONS_PER_RUN) * 100);
        const passed = accuracy >= PASS_THRESHOLD;

        return (
            <>
                <Head><title>{passed ? 'Level Passed!' : 'Try Again'}</title></Head>
                <style>{EFFECT_STYLES}</style>
                <div style={styles.completeScreen}>
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                        style={{ textAlign: 'center' }}
                    >
                        <motion.div
                            style={{ fontSize: 80, marginBottom: 16 }}
                            animate={passed ? { rotate: [0, -10, 10, -10, 0] } : {}}
                            transition={{ delay: 0.5, duration: 0.5 }}
                        >
                            {passed ? '🏆' : '🔄'}
                        </motion.div>
                        <h1 style={{ fontSize: 32, color: passed ? '#4CAF50' : '#fff', marginBottom: 12 }}>
                            {passed ? 'LEVEL PASSED!' : 'TRY AGAIN'}
                        </h1>
                        <div style={styles.scoreDisplay}>
                            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>ACCURACY</span>
                            <motion.span
                                style={{ fontSize: 56, fontWeight: 800, color: passed ? '#4CAF50' : '#FF6B35' }}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.3, type: 'spring' }}
                            >
                                {accuracy}%
                            </motion.span>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                            {correctCount}/{QUESTIONS_PER_RUN} • Best streak: {bestStreak} • {xpEarned.toLocaleString()} XP
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                            {!passed && (
                                <motion.button
                                    style={styles.retryButton}
                                    onClick={() => {
                                        setQuestionIndex(0);
                                        setCorrectCount(0);
                                        setStreak(0);
                                        setBestStreak(0);
                                        setXpEarned(0);
                                        setIsComplete(false);
                                        setShowResult(false);
                                        setTimeLeft(TIME_PER_QUESTION);
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    RETRY
                                </motion.button>
                            )}
                            <motion.button style={styles.exitButton} onClick={handleExit} whileTap={{ scale: 0.95 }}>
                                {passed ? 'CONTINUE' : 'BACK'}
                            </motion.button>
                        </div>
                    </motion.div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head>
                <title>{game.name} — PokerIQ</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>
            <style>{EFFECT_STYLES}</style>
            <style>{`
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { background: #0a1628; overflow: hidden; touch-action: manipulation; }
                button { -webkit-tap-highlight-color: transparent; }
            `}</style>

            <div ref={arenaRef} style={styles.arena}>
                {/* World Navigation Header */}
                <WorldNavHeader
                    title={game.name}
                    backTo="/hub/training"
                    backLabel="Training"
                />

                {/* ═══════════════════════════════════════════════════════════════════
                    SITUATION PANEL — TOP (Easy to read)
                ═══════════════════════════════════════════════════════════════════ */}
                <div style={styles.situationPanel}>
                    <div style={styles.questionNumber}>
                        QUESTION {questionIndex + 1} of {QUESTIONS_PER_RUN}
                    </div>
                    <h2 style={styles.situationTitle}>{currentScenario.title || currentScenario.scenario}</h2>
                    <p style={styles.situationText}>{currentScenario.situation || currentScenario.action}</p>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                    TABLE AREA — CENTER (Premium poker room)
                ═══════════════════════════════════════════════════════════════════ */}
                <div style={styles.tableArea}>
                    {/* Streak display */}
                    <StreakFire streak={streak} />

                    {/* Premium Poker Table */}
                    <div style={styles.premiumTableContainer}>
                        {/* Table image */}
                        <img
                            src="/images/training/premium-table.jpg"
                            alt=""
                            style={styles.tableImage}
                        />

                        {/* Ambient glow */}
                        <div style={styles.tableGlow} />

                        {/* Board & Pot - centered on table */}
                        <div style={styles.tableOverlay}>
                            {/* Board cards */}
                            <div style={styles.boardArea}>
                                {currentScenario.board && currentScenario.board.length > 0 ? (
                                    currentScenario.board.map((card, i) => (
                                        <PlayingCard key={i} card={card} size="medium" delay={i * 0.1} />
                                    ))
                                ) : (
                                    <div style={styles.preFlopBadge}>PREFLOP</div>
                                )}
                            </div>

                            {/* Pot */}
                            <div style={styles.potDisplay}>
                                <span style={styles.potLabel}>POT</span>
                                <span style={styles.potAmount}>{currentScenario.potSize || 12} BB</span>
                            </div>
                        </div>

                        {/* Seat badges around table */}
                        {SEATS.map(seat => (
                            <motion.div
                                key={seat.id}
                                style={{
                                    ...styles.seatBadge,
                                    top: `${50 + Math.sin(seat.angle * Math.PI / 180) * 42}%`,
                                    left: `${50 + Math.cos(seat.angle * Math.PI / 180) * 40}%`,
                                    background: seat.isHero
                                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                                        : 'rgba(20, 20, 40, 0.95)',
                                    boxShadow: seat.isHero
                                        ? '0 0 20px rgba(255, 215, 0, 0.6)'
                                        : '0 2px 10px rgba(0,0,0,0.5)',
                                    border: seat.isHero
                                        ? '2px solid #FFD700'
                                        : '1px solid rgba(255, 215, 0, 0.3)',
                                }}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.1 }}
                            >
                                <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: seat.isHero ? '#1a1a2e' : '#FFD700',
                                    letterSpacing: 1,
                                }}>
                                    {seat.label}
                                </span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Hero hole cards - positioned below table */}
                    <motion.div style={styles.heroCards}>
                        {(currentScenario.heroCards || currentScenario.heroHand)?.map((card, i) => (
                            <PlayingCard key={i} card={card} size="large" delay={0.3 + i * 0.15} />
                        )) || null}
                    </motion.div>

                    {/* Timer */}
                    <div style={styles.timerPosition}>
                        <PressureTimer timeLeft={timeLeft} maxTime={TIME_PER_QUESTION} />
                    </div>

                    {/* XP Burst */}
                    <XPBurst amount={lastXP} isVisible={showXPBurst} />
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                    ACTION HUD — BOTTOM
                ═══════════════════════════════════════════════════════════════════ */}
                <div style={styles.actionHUD}>
                    <AnimatePresence mode="wait">
                        {!showResult ? (
                            <motion.div
                                key="actions"
                                style={styles.actionGrid}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -20, opacity: 0 }}
                            >
                                {currentScenario.options?.map((option, i) => (
                                    <motion.button
                                        key={option.id}
                                        style={styles.actionButton}
                                        onClick={() => handleAnswer(option.id)}
                                        whileTap={{ scale: 0.95 }}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        {option.text}
                                    </motion.button>
                                )) || null}
                            </motion.div>
                        ) : (
                            /* GTO STRATEGY POPUP CARD - Reference Design */
                            <motion.div
                                key="result"
                                style={styles.resultOverlay}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <motion.div
                                    style={styles.resultCard}
                                    initial={{ scale: 0.8, y: 50 }}
                                    animate={{ scale: 1, y: 0 }}
                                    transition={{ type: 'spring', damping: 20 }}
                                >
                                    {/* Answer Badge */}
                                    <div style={styles.answerBadgeContainer}>
                                        <div style={{
                                            ...styles.answerBadge,
                                            background: currentScenario.options.find(o => o.id === selectedAnswer)?.isCorrect
                                                ? 'linear-gradient(135deg, #4CAF50, #2E7D32)'
                                                : 'linear-gradient(135deg, #E53935, #C62828)',
                                        }}>
                                            {currentScenario.gtoStrategy?.primary || 'Raise'}
                                        </div>
                                    </div>

                                    {/* Card Body - Scrollable */}
                                    <div style={styles.cardBody}>
                                        {/* Explanation Section */}
                                        <div style={styles.sectionCard}>
                                            <div style={styles.sectionHeader}>
                                                <span style={styles.sectionIcon}>💡</span>
                                                <span style={styles.sectionLabel}>Explanation</span>
                                            </div>
                                            <p style={styles.sectionText}>{currentScenario.explanation}</p>
                                        </div>

                                        {/* GTO Approach Section */}
                                        {currentScenario.gtoStrategy && (
                                            <div style={styles.sectionCardHighlight}>
                                                <div style={styles.sectionHeader}>
                                                    <span style={styles.sectionIconCyan}>↗</span>
                                                    <span style={styles.sectionLabelCyan}>GTO Approach</span>
                                                </div>
                                                <p style={styles.sectionText}>{currentScenario.gtoStrategy.reasoning}</p>
                                            </div>
                                        )}

                                        {/* Alternate Lines Section */}
                                        {currentScenario.alternatives && currentScenario.alternatives.length > 0 && (
                                            <>
                                                <div style={styles.altLinesHeader}>Alternate Lines</div>
                                                {currentScenario.alternatives.map((alt, i) => (
                                                    <div key={i} style={styles.altLineItem}>
                                                        <div style={styles.altLineTop}>
                                                            <span style={styles.altLineAction}>{alt.action.toUpperCase()}</span>
                                                            <span style={styles.altLineFreq}>— {alt.frequency}% FREQUENCY</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {/* Add a second alternate line for completeness */}
                                                <div style={styles.altLineItem}>
                                                    <div style={styles.altLineTop}>
                                                        <span style={styles.altLineAction}>RAISE — LARGE SIZING</span>
                                                        <span style={styles.altLineFreq}>— 0% FREQUENCY</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Next Button */}
                                    <motion.button
                                        style={styles.cardNextButton}
                                        onClick={handleNext}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        {questionIndex + 1 >= QUESTIONS_PER_RUN ? 'VIEW RESULTS' : 'NEXT HAND →'}
                                    </motion.button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* XP Counter */}
                <motion.div
                    style={styles.xpCounter}
                    key={xpEarned}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.3 }}
                >
                    ⚡ {xpEarned.toLocaleString()} XP
                </motion.div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES - Mobile-first, fixed sizes
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a1628',
    },
    spinner: {
        width: 40,
        height: 40,
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#00D4FF',
        borderRadius: '50%',
    },
    arena: {
        height: '100vh',
        height: '100dvh',
        background: 'linear-gradient(180deg, #0a1628 0%, #1a2744 100%)',
        color: '#fff',
        fontFamily: 'Inter, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        height: 48,
        minHeight: 48,
        background: 'rgba(0,0,0,0.4)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
    },
    backButton: {
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        fontSize: 12,
        cursor: 'pointer',
    },
    gameInfo: { flex: 1, textAlign: 'center' },
    gameName: { fontSize: 14, fontWeight: 600 },
    progressInfo: { display: 'flex', gap: 10, alignItems: 'center' },
    questionCount: { fontSize: 14, fontWeight: 700, fontFamily: 'monospace' },
    correctBadge: { color: '#4CAF50', fontWeight: 600, fontSize: 12 },
    tableArea: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '0 12px',
        // Premium poker room background with ambient lighting
        background: 'radial-gradient(ellipse at 50% 60%, rgba(80, 50, 20, 0.3) 0%, transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(255, 180, 80, 0.08) 0%, transparent 50%), linear-gradient(180deg, #080810 0%, #0d0a14 50%, #080810 100%)',
    },

    // Premium table container - crops to show only the table
    premiumTableContainer: {
        position: 'relative',
        width: '100%',
        maxWidth: 320,
        height: 200,
        overflow: 'hidden',
        borderRadius: 100, // Oval shape to match table
    },
    tableImage: {
        width: '100%',
        height: '240%', // Zoom in to crop background
        objectFit: 'cover',
        objectPosition: 'center 15%', // Focus on the table, cut off dark background
        filter: 'brightness(1.15) contrast(1.1) saturate(1.1)',
    },
    tableGlow: {
        position: 'absolute',
        inset: 0,
        borderRadius: 100,
        background: 'radial-gradient(ellipse at center, rgba(255, 200, 100, 0.1) 0%, transparent 60%)',
        pointerEvents: 'none',
        boxShadow: 'inset 0 0 40px rgba(255, 180, 80, 0.15), 0 0 60px rgba(255, 180, 80, 0.2)',
    },
    tableOverlay: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },

    boardArea: {
        display: 'flex',
        gap: 6,
        padding: '10px 14px',
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 215, 0, 0.2)',
    },
    preFlopBadge: {
        padding: '10px 24px',
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 140, 0, 0.25))',
        border: '2px solid rgba(255, 215, 0, 0.5)',
        borderRadius: 25,
        fontSize: 13,
        fontWeight: 800,
        color: '#FFD700',
        letterSpacing: 4,
        textShadow: '0 0 15px rgba(255, 215, 0, 0.6)',
    },
    potDisplay: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '10px 20px',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.7), rgba(30, 20, 10, 0.7))',
        borderRadius: 16,
        border: '1px solid rgba(255, 215, 0, 0.4)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
    potLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255, 215, 0, 0.8)',
        letterSpacing: 2,
    },
    potAmount: {
        fontSize: 22,
        fontWeight: 800,
        color: '#FFD700',
        textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
    },
    seatBadge: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        padding: '5px 10px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 38,
        zIndex: 10,
    },

    // Hero cards - below the table
    heroCards: {
        display: 'flex',
        gap: 8,
        marginTop: 16,
    },

    // Keep old styles for backwards compatibility
    table: {
        display: 'none',
    },
    tableFelt: {
        display: 'none',
    },
    preFlopLabel: { fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 2 },
    seat: {
        position: 'absolute',
        width: 36,
        height: 36,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    holeCards: {
        position: 'absolute',
        bottom: 80,
        display: 'flex',
        gap: 6,
    },
    timerPosition: {
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
    },
    timerContainer: {
        position: 'relative',
        width: 70,
        height: 70,
    },
    timerInner: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerValue: { fontWeight: 800, fontFamily: 'monospace' },
    timerLabel: { fontSize: 8, color: 'rgba(255,255,255,0.5)' },
    urgentPulse: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '2px solid #FF1744',
    },
    streakDisplay: {
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
    },
    streakEmoji: { fontSize: 16 },
    streakCount: { fontSize: 20, fontWeight: 800 },
    streakText: { fontSize: 10, fontWeight: 600, letterSpacing: 1 },
    xpBurst: {
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 24,
        fontWeight: 800,
        color: '#FFD700',
        textShadow: '0 0 20px rgba(255,215,0,0.8)',
    },

    // Situation Panel - TOP of page, prominent
    situationPanel: {
        padding: '16px 20px',
        background: 'linear-gradient(180deg, rgba(20, 15, 30, 0.95), rgba(15, 12, 25, 0.9))',
        borderBottom: '1px solid rgba(255, 215, 0, 0.2)',
    },
    questionNumber: {
        fontSize: 10,
        fontWeight: 700,
        color: '#00D4FF',
        letterSpacing: 2,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    situationTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
        lineHeight: 1.3,
    },
    situationText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.85)',
        lineHeight: 1.5,
    },
    actionHUD: {
        padding: '12px 16px 24px',
        background: 'rgba(0,0,0,0.4)',
        minHeight: 120,
    },
    actionGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
    },
    actionButton: {
        padding: '14px 8px',
        fontSize: 13,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
    },

    // GTO Result Popup Card
    resultOverlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 1000,
    },
    resultCard: {
        width: '100%',
        maxWidth: 400,
        maxHeight: '85vh',
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)',
        borderRadius: 20,
        border: '1px solid rgba(255, 215, 0, 0.2)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.1)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '16px 20px',
    },
    cardHeaderIcon: {
        fontSize: 24,
        color: '#fff',
    },
    cardHeaderText: {
        fontSize: 18,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 2,
    },
    cardBody: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px 20px',
    },

    // GTO Card Section (inside popup)
    gtoCard: {
        padding: 16,
        background: 'rgba(0, 212, 255, 0.08)',
        borderRadius: 14,
        border: '1px solid rgba(0, 212, 255, 0.25)',
        marginBottom: 16,
    },
    gtoCardLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#00D4FF',
        letterSpacing: 3,
        marginBottom: 10,
    },
    gtoCardMain: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    gtoCardAction: {
        fontSize: 20,
        fontWeight: 800,
        color: '#fff',
    },
    gtoCardFreq: {
        fontSize: 24,
        fontWeight: 800,
        color: '#00D4FF',
    },
    frequencyBarLarge: {
        width: '100%',
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    frequencyFillLarge: {
        height: '100%',
        background: 'linear-gradient(90deg, #00D4FF, #4CAF50)',
        borderRadius: 4,
    },
    gtoCardReason: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.75)',
        lineHeight: 1.5,
        margin: 0,
    },

    // Alternative Card Section (inside popup)
    altCard: {
        padding: 14,
        background: 'rgba(255, 215, 0, 0.06)',
        borderRadius: 14,
        border: '1px solid rgba(255, 215, 0, 0.2)',
        marginBottom: 16,
    },
    altCardLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#FFD700',
        letterSpacing: 3,
        marginBottom: 10,
    },
    altCardItem: {
        padding: 12,
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 10,
        marginBottom: 8,
    },
    altCardTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    altCardAction: {
        fontSize: 15,
        fontWeight: 700,
        color: '#FFD700',
    },
    altCardFreq: {
        fontSize: 14,
        fontWeight: 700,
        color: 'rgba(255, 215, 0, 0.8)',
    },
    altCardWhen: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.4,
        margin: 0,
    },
    cardSummary: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.5,
        textAlign: 'center',
        margin: 0,
    },
    cardNextButton: {
        margin: 16,
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        border: 'none',
        borderRadius: 30,
        color: '#1a1a2e',
        fontSize: 16,
        fontWeight: 800,
        cursor: 'pointer',
        letterSpacing: 1,
        boxShadow: '0 4px 20px rgba(255, 215, 0, 0.3)',
    },

    // Keep old styles for backwards compatibility
    resultPanel: {
        textAlign: 'center',
        maxHeight: '60vh',
        overflowY: 'auto',
        padding: '0 4px',
    },
    resultBanner: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 10,
        marginBottom: 10,
        color: '#fff',
    },

    // GTO Strategy Section
    gtoSection: {
        width: '100%',
        marginBottom: 12,
        padding: 12,
        background: 'rgba(0, 212, 255, 0.1)',
        borderRadius: 10,
        border: '1px solid rgba(0, 212, 255, 0.3)',
    },
    gtoHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    gtoLabel: {
        fontSize: 9,
        fontWeight: 700,
        color: '#00D4FF',
        letterSpacing: 2,
    },
    gtoFrequency: {
        fontSize: 14,
        fontWeight: 800,
        color: '#00D4FF',
    },
    gtoPrimary: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 8,
    },
    frequencyBar: {
        width: '100%',
        height: 6,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    frequencyFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #00D4FF, #4CAF50)',
        borderRadius: 3,
    },
    gtoReasoning: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.4,
        margin: 0,
    },

    // Alternative Plays Section
    alternativesSection: {
        width: '100%',
        marginBottom: 12,
    },
    altHeader: {
        fontSize: 9,
        fontWeight: 700,
        color: '#FFD700',
        letterSpacing: 2,
        marginBottom: 8,
    },
    altItem: {
        padding: 10,
        background: 'rgba(255, 215, 0, 0.08)',
        borderRadius: 8,
        border: '1px solid rgba(255, 215, 0, 0.2)',
        marginBottom: 6,
    },
    altTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    altAction: {
        fontSize: 13,
        fontWeight: 600,
        color: '#FFD700',
    },
    altFreq: {
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(255, 215, 0, 0.8)',
    },
    altWhen: {
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.4,
        margin: 0,
    },

    explanation: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        lineHeight: 1.5,
        marginBottom: 12,
    },
    nextButton: {
        padding: '12px 32px',
        background: 'linear-gradient(135deg, #4CAF50, #2E7D32)',
        border: 'none',
        borderRadius: 20,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
    xpCounter: {
        position: 'absolute',
        top: 56,
        right: 12,
        padding: '6px 12px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 16,
        fontSize: 12,
        fontWeight: 700,
        color: '#FFD700',
    },
    chipStack: {
        position: 'absolute',
        bottom: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    chip: {
        width: 20,
        height: 20,
        borderRadius: '50%',
        border: '2px dashed rgba(255,255,255,0.4)',
        position: 'absolute',
    },
    chipAmount: {
        marginTop: 30,
        fontSize: 10,
        fontWeight: 700,
        color: '#FFD700',
    },
    completeScreen: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a1628',
        color: '#fff',
        padding: 20,
    },
    scoreDisplay: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 12,
    },
    retryButton: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #FF6B35, #E64A19)',
        border: 'none',
        borderRadius: 20,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
    exitButton: {
        padding: '12px 24px',
        background: 'rgba(255,255,255,0.1)',
        border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: 20,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },
};
