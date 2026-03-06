/**
 * TRIVIA GAME — Core gameplay component with addictive game mechanics
 * 
 * Features:
 * - Fire Mode / Combo System (3+ streak = fire, escalating multipliers)
 * - Escalating Stakes (risk diamonds, cash out option)
 * - Circular SVG Timer Ring with heartbeat pressure
 * - Visual Juice (confetti, screen shake, diamond float-up, card-deal transitions)
 * - Ghost Opponent integration
 * - Synthesized sound effects
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronRight, ChevronDown, ChevronUp, CheckCircle, XCircle, Zap, Gem, Flame, Volume2, VolumeX } from 'lucide-react';
import HintButtons, { applyHint } from './HintButtons';
import GhostOpponent from './GhostOpponent';
import { toTitleCase } from '../../lib/trivia/titleCase';
import * as audio from '../../lib/trivia/triviaAudio';
import confetti from 'canvas-confetti';

// ══ Escalating stake values per question ══
const STAKE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 55 total possible

export default function TriviaGame({
    questions,
    mode,
    timeLimit = null,
    onComplete,
    onAnswer,
    userDiamonds = 0,
    onDiamondsChange,
    enableHints = true,
    enableStakes = false,     // Escalating diamond stakes
    enableGhostOpponent = true, // Show ghost opponent
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [answers, setAnswers] = useState([]);
    const [timeRemaining, setTimeRemaining] = useState(timeLimit);
    const [isLocked, setIsLocked] = useState(false);

    // Hint system state
    const [hintsUsed, setHintsUsed] = useState({ fiftyFifty: false, skip: false, extraTime: false });
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [diamonds, setDiamonds] = useState(userDiamonds);

    // ══ NEW: Combo / Fire Mode state ══
    const [streak, setStreak] = useState(0);
    const [showCombo, setShowCombo] = useState(false);
    const [isFireMode, setIsFireMode] = useState(false);
    const [showStreakLost, setShowStreakLost] = useState(false);

    // ══ NEW: Visual juice state ══
    const [showCorrectFlash, setShowCorrectFlash] = useState(false);
    const [showWrongShake, setShowWrongShake] = useState(false);
    const [floatingDiamonds, setFloatingDiamonds] = useState([]);
    const [showBust, setShowBust] = useState(false);

    // ══ NEW: Stakes state ══
    const [stakePot, setStakePot] = useState(0);
    const [cashedOut, setCashedOut] = useState(false);

    // ══ NEW: Game active state for ghost opponent ══
    const [isGameActive, setIsGameActive] = useState(true);
    const [correctCount, setCorrectCount] = useState(0);

    // ══ NEW: Audio mute ══
    const [muted, setMuted] = useState(audio.isMuted());

    const timerRef = useRef(null);
    const startTimeRef = useRef(Date.now());
    const gameContainerRef = useRef(null);

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion?.correct_index;
    const isArcadeMode = mode === 'arcade';

    // ── Multiplier from streak ──
    const getMultiplier = () => {
        if (streak >= 7) return 5;
        if (streak >= 5) return 3;
        if (streak >= 3) return 2;
        return 1;
    };

    // Timer
    useEffect(() => {
        if (!timeLimit) return;
        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                // Sound effects for countdown
                if (prev <= 5) audio.countdownBeep(prev);
                if (prev <= 10) audio.timerTick();
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [timeLimit]);

    const handleTimeUp = useCallback(() => {
        setIsGameActive(false);
        audio.bustDrop();
        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const cc = answers.filter((a, i) => a === questions[i]?.correct_index).length;
        onComplete({
            answers, correctCount: cc, totalQuestions: questions.length,
            timeSpent, timeRemaining: 0,
            stakePot: enableStakes ? stakePot : undefined,
            streak,
        });
    }, [answers, questions, onComplete, stakePot, streak, enableStakes]);

    // ── Spawn floating diamond ──
    const spawnFloatingDiamond = (value) => {
        const id = Date.now() + Math.random();
        setFloatingDiamonds(prev => [...prev, { id, value }]);
        setTimeout(() => {
            setFloatingDiamonds(prev => prev.filter(d => d.id !== id));
        }, 1200);
    };

    // ══ ANSWER SELECTION ══
    const selectAnswer = (index) => {
        if (isLocked || selectedAnswer !== null) return;

        audio.chipClick();
        setSelectedAnswer(index);
        setIsLocked(true);

        const correct = index === currentQuestion.correct_index;
        const newAnswers = [...answers, index];
        setAnswers(newAnswers);

        if (correct) {
            // ── CORRECT ──
            audio.correctChime();
            setShowCorrectFlash(true);
            setTimeout(() => setShowCorrectFlash(false), 500);

            const newStreak = streak + 1;
            setStreak(newStreak);
            setCorrectCount(prev => prev + 1);

            // Fire mode activation
            if (newStreak >= 3 && !isFireMode) {
                setIsFireMode(true);
                audio.fireWhoosh();
            }

            // Combo popup
            if (newStreak >= 2) {
                audio.streakDing(newStreak);
                setShowCombo(true);
                setTimeout(() => setShowCombo(false), 1500);
            }

            // Stakes pot
            if (enableStakes) {
                const stakeValue = STAKE_VALUES[Math.min(currentIndex, STAKE_VALUES.length - 1)] * getMultiplier();
                setStakePot(prev => prev + stakeValue);
                spawnFloatingDiamond(stakeValue);
            } else {
                spawnFloatingDiamond(1);
            }

            // Confetti burst
            confetti({
                particleCount: isFireMode ? 30 : 12,
                spread: 50,
                origin: { y: 0.7 },
                colors: isFireMode ? ['#f97316', '#ef4444', '#fbbf24'] : ['#22c55e', '#06b6d4'],
                disableForReducedMotion: true,
            });

        } else {
            // ── WRONG ──
            audio.wrongBuzz();
            setShowWrongShake(true);
            setTimeout(() => setShowWrongShake(false), 400);

            // Break streak
            if (streak >= 2) {
                setShowStreakLost(true);
                setTimeout(() => setShowStreakLost(false), 1500);
            }
            setStreak(0);
            setIsFireMode(false);

            // Stakes: bust!
            if (enableStakes && stakePot > 0) {
                audio.bustDrop();
                setShowBust(true);
                setTimeout(() => setShowBust(false), 2000);
                setStakePot(0);
            }
        }

        if (onAnswer) {
            onAnswer({ questionIndex: currentIndex, answerIndex: index, isCorrect: correct });
        }

        // Auto-advance in arcade mode
        if (isArcadeMode) {
            setTimeout(() => advanceQuestion(newAnswers), 800);
        }
    };

    // ══ ADVANCE ══
    const advanceQuestion = (currentAnswers = answers) => {
        if (currentIndex >= questions.length - 1) {
            clearInterval(timerRef.current);
            setIsGameActive(false);
            const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const cc = currentAnswers.filter((a, i) => a === questions[i]?.correct_index).length;
            if (cc === questions.length) audio.victoryFanfare();
            onComplete({
                answers: currentAnswers, correctCount: cc,
                totalQuestions: questions.length, timeSpent,
                timeRemaining: timeRemaining || 0,
                stakePot: enableStakes ? stakePot : undefined,
                streak,
            });
        } else {
            audio.cardDealWhoosh();
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowExplanation(false);
            setIsLocked(false);
            setEliminatedOptions([]);
        }
    };

    // ══ CASH OUT (stakes mode) ══
    const handleCashOut = () => {
        if (!enableStakes || stakePot <= 0) return;
        audio.cashOutKaChing();
        setCashedOut(true);
        setIsGameActive(false);
        clearInterval(timerRef.current);

        // Award diamonds
        onDiamondsChange?.(stakePot);

        confetti({
            particleCount: 100, spread: 70, origin: { y: 0.5 },
            colors: ['#fbbf24', '#f59e0b', '#06b6d4']
        });

        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setTimeout(() => {
            onComplete({
                answers, correctCount, totalQuestions: questions.length,
                timeSpent, timeRemaining: timeRemaining || 0,
                stakePot, cashedOut: true, streak,
            });
        }, 2000);
    };

    const getDifficultyColor = (difficulty) => {
        switch (difficulty) {
            case 'easy': return '#22c55e';
            case 'medium': return '#fbbf24';
            case 'hard': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const getCategoryName = (category) => {
        const names = {
            poker_history: 'Poker History', famous_hands: 'Famous Hands',
            gto_theory: 'GTO Theory', player_profiles: 'Player Profiles',
            tournament_facts: 'Tournament Facts', rule_knowledge: 'Rules & Etiquette'
        };
        return names[category] || 'General';
    };

    if (!currentQuestion) return null;

    const timerPercentage = timeLimit ? (timeRemaining / timeLimit) * 100 : 100;
    const multiplier = getMultiplier();
    const canCashOut = enableStakes && currentIndex >= 5 && stakePot > 0 && selectedAnswer === null;

    return (
        <div
            className={`trivia-game ${isFireMode ? 'fire-mode' : ''} ${showWrongShake ? 'screen-shake' : ''} ${showCorrectFlash ? 'correct-flash' : ''}`}
            ref={gameContainerRef}
        >
            {/* ════ Fire Mode Background Particles ════ */}
            {isFireMode && (
                <div className="fire-particles">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="ember" style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${2 + Math.random() * 3}s`,
                        }} />
                    ))}
                </div>
            )}

            {/* ════ Mute Toggle ════ */}
            <button className="mute-toggle" onClick={() => { const m = audio.toggleMute(); setMuted(m); }}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* ════ Ghost Opponent ════ */}
            {enableGhostOpponent && (
                <GhostOpponent
                    totalQuestions={questions.length}
                    currentQuestionIndex={currentIndex}
                    playerCorrectCount={correctCount}
                    isGameActive={isGameActive}
                />
            )}

            {/* ════ Stakes Bar ════ */}
            {enableStakes && (
                <div className={`stakes-bar ${showBust ? 'busted' : ''}`}>
                    <div className="stakes-pot">
                        <Gem size={18} className="stake-gem" />
                        <span className="stake-value">{stakePot}</span>
                        <span className="stake-label">at risk</span>
                    </div>
                    {multiplier > 1 && (
                        <div className="multiplier-badge">
                            <Zap size={14} />
                            <span>{multiplier}x</span>
                        </div>
                    )}
                    {canCashOut && (
                        <button className="cash-out-btn" onClick={handleCashOut}>
                            CASH OUT <Gem size={14} /> {stakePot}
                        </button>
                    )}
                </div>
            )}

            {/* ════ Combo Popup ════ */}
            <AnimatePresence>
                {showCombo && (
                    <motion.div
                        className="combo-popup"
                        initial={{ opacity: 0, scale: 0.5, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                    >
                        <Flame size={24} className="combo-flame" />
                        <span>{streak} IN A ROW!</span>
                        {multiplier > 1 && <span className="combo-mult">{multiplier}x</span>}
                    </motion.div>
                )}
                {showStreakLost && (
                    <motion.div
                        className="streak-lost-popup"
                        initial={{ opacity: 0, scale: 1.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        STREAK LOST!
                    </motion.div>
                )}
                {showBust && (
                    <motion.div
                        className="bust-popup"
                        initial={{ opacity: 0, scale: 2, rotateZ: -5 }}
                        animate={{ opacity: 1, scale: 1, rotateZ: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                    >
                        💀 BUSTED!
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ════ Progress & Timer ════ */}
            <div className="game-header">
                <div className="progress-info">
                    <span className="question-count">
                        Question {currentIndex + 1} of {questions.length}
                    </span>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                        />
                    </div>
                </div>

                {timeLimit && (
                    <div className={`timer-ring-container ${timeRemaining <= 5 ? 'heartbeat' : ''}`}>
                        <svg viewBox="0 0 60 60" className="timer-ring">
                            <circle cx="30" cy="30" r="26" className="timer-ring-bg" />
                            <circle
                                cx="30" cy="30" r="26"
                                className="timer-ring-fill"
                                style={{
                                    strokeDasharray: `${2 * Math.PI * 26}`,
                                    strokeDashoffset: `${2 * Math.PI * 26 * (1 - timerPercentage / 100)}`,
                                    stroke: timerPercentage > 50 ? '#22c55e' : timerPercentage > 25 ? '#fbbf24' : '#ef4444',
                                }}
                            />
                        </svg>
                        <span className={`timer-text ${timeRemaining <= 5 ? 'critical' : ''}`}>
                            {timeRemaining}
                        </span>
                    </div>
                )}
            </div>

            {/* ════ Question Card ════ */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    className="question-card"
                    initial={{ opacity: 0, rotateY: 90, scale: 0.9 }}
                    animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                    exit={{ opacity: 0, rotateY: -90, scale: 0.9 }}
                    transition={{ duration: 0.35, type: 'spring', stiffness: 200 }}
                >
                    {/* Category & Difficulty */}
                    <div className="question-meta">
                        <span className="category">{getCategoryName(currentQuestion.category)}</span>
                        <span className="difficulty" style={{ color: getDifficultyColor(currentQuestion.difficulty) }}>
                            {currentQuestion.difficulty?.toUpperCase()}
                        </span>
                        {enableStakes && (
                            <span className="question-stake">
                                <Gem size={12} /> {STAKE_VALUES[Math.min(currentIndex, STAKE_VALUES.length - 1)] * multiplier}
                            </span>
                        )}
                    </div>

                    {/* Question Text */}
                    <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                    {/* Answer Options */}
                    <div className="options">
                        {currentQuestion.options.map((option, index) => {
                            const isEliminated = eliminatedOptions.includes(index);
                            let optionClass = 'option';
                            if (isEliminated) optionClass += ' eliminated';
                            if (selectedAnswer !== null) {
                                if (index === currentQuestion.correct_index) optionClass += ' correct';
                                else if (index === selectedAnswer) optionClass += ' incorrect';
                            }

                            return (
                                <motion.button
                                    key={index}
                                    className={optionClass}
                                    onClick={() => selectAnswer(index)}
                                    disabled={isLocked || isEliminated}
                                    whileHover={!isLocked ? { scale: 1.02, borderColor: 'rgba(14, 165, 233, 0.5)' } : {}}
                                    whileTap={!isLocked ? { scale: 0.98 } : {}}
                                    animate={
                                        selectedAnswer === index && index !== currentQuestion.correct_index
                                            ? { x: [0, -4, 4, -4, 4, 0] }
                                            : selectedAnswer === index && index === currentQuestion.correct_index
                                                ? { scale: [1, 1.05, 1] }
                                                : {}
                                    }
                                    transition={{ duration: 0.3 }}
                                >
                                    <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                                    <span className="option-text">{isEliminated ? '---' : toTitleCase(option)}</span>
                                    {selectedAnswer !== null && index === currentQuestion.correct_index && (
                                        <CheckCircle size={20} className="result-icon correct" />
                                    )}
                                    {selectedAnswer !== null && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                        <XCircle size={20} className="result-icon incorrect" />
                                    )}
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Hint Buttons */}
                    {enableHints && !isArcadeMode && selectedAnswer === null && (
                        <div className="hints-section">
                            <HintButtons
                                userDiamonds={diamonds}
                                hintsUsed={hintsUsed}
                                hasTimeLimit={!!timeLimit}
                                onUseHint={(hintType, cost) => {
                                    const result = applyHint(hintType, currentQuestion, eliminatedOptions, timeRemaining);
                                    if (result.eliminatedOptions) setEliminatedOptions(result.eliminatedOptions);
                                    if (result.addTime) setTimeRemaining(prev => (prev || 0) + result.addTime);
                                    if (result.skipQuestion) advanceQuestion([...answers, -1]);
                                    setDiamonds(prev => prev - cost);
                                    onDiamondsChange?.(-cost);
                                    setHintsUsed(prev => ({ ...prev, [hintType]: true }));
                                }}
                            />
                        </div>
                    )}

                    {/* Explanation */}
                    {!isArcadeMode && selectedAnswer !== null && currentQuestion.explanation && (
                        <div className="explanation-section">
                            <button className="explanation-toggle" onClick={() => setShowExplanation(!showExplanation)}>
                                {showExplanation ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                            </button>
                            {showExplanation && (
                                <motion.div className="explanation-content"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    <p>{currentQuestion.explanation}</p>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* Next Button */}
                    {!isArcadeMode && selectedAnswer !== null && (
                        <motion.button
                            className="next-button"
                            onClick={() => advanceQuestion()}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {currentIndex >= questions.length - 1 ? 'See Results' : 'Next Question'}
                            <ChevronRight size={20} />
                        </motion.button>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* ════ Floating Diamonds ════ */}
            <AnimatePresence>
                {floatingDiamonds.map(d => (
                    <motion.div
                        key={d.id}
                        className="floating-diamond"
                        initial={{ opacity: 1, y: 0, x: '-50%' }}
                        animate={{ opacity: 0, y: -80 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2 }}
                    >
                        <Gem size={14} /> +{d.value}
                    </motion.div>
                ))}
            </AnimatePresence>

            <style jsx>{`
                .trivia-game {
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 20px;
                    position: relative;
                    transition: background 0.5s ease;
                }

                /* ═══ FIRE MODE ═══ */
                .trivia-game.fire-mode {
                    background: radial-gradient(ellipse at center bottom, rgba(239, 68, 68, 0.08), transparent 70%);
                }

                .trivia-game.fire-mode .question-card {
                    border-color: rgba(249, 115, 22, 0.4);
                    box-shadow: 0 0 30px rgba(249, 115, 22, 0.15), inset 0 0 30px rgba(249, 115, 22, 0.05);
                }

                .trivia-game.fire-mode .progress-fill {
                    background: linear-gradient(90deg, #f97316, #ef4444) !important;
                }

                /* ═══ SCREEN SHAKE ═══ */
                .trivia-game.screen-shake {
                    animation: screenShake 0.4s ease;
                }
                @keyframes screenShake {
                    0%, 100% { transform: translateX(0); }
                    10% { transform: translateX(-3px) rotate(-0.5deg); }
                    30% { transform: translateX(3px) rotate(0.5deg); }
                    50% { transform: translateX(-2px); }
                    70% { transform: translateX(2px); }
                    90% { transform: translateX(-1px); }
                }

                /* ═══ CORRECT FLASH ═══ */
                .trivia-game.correct-flash .question-card {
                    animation: correctPulse 0.5s ease;
                }
                @keyframes correctPulse {
                    0% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
                    50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.3), inset 0 0 40px rgba(34, 197, 94, 0.1); }
                    100% { box-shadow: 0 0 0 rgba(34, 197, 94, 0); }
                }

                /* ═══ FIRE PARTICLES ═══ */
                .fire-particles {
                    position: absolute;
                    inset: 0;
                    overflow: hidden;
                    pointer-events: none;
                    z-index: 0;
                }
                .ember {
                    position: absolute;
                    bottom: -10px;
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #f97316;
                    box-shadow: 0 0 6px #f97316, 0 0 12px rgba(239, 68, 68, 0.5);
                    animation: emberRise linear infinite;
                    opacity: 0;
                }
                @keyframes emberRise {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 0.8; }
                    80% { opacity: 0.3; }
                    100% { transform: translateY(-500px) scale(0.3) translateX(30px); opacity: 0; }
                }

                /* ═══ MUTE TOGGLE ═══ */
                .mute-toggle {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    z-index: 10;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 6px;
                    color: rgba(255, 255, 255, 0.5);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .mute-toggle:hover {
                    background: rgba(255, 255, 255, 0.15);
                    color: rgba(255, 255, 255, 0.8);
                }

                /* ═══ STAKES BAR ═══ */
                .stakes-bar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 16px;
                    margin-bottom: 16px;
                    background: linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(14, 165, 233, 0.05));
                    border: 1px solid rgba(6, 182, 212, 0.25);
                    border-radius: 12px;
                    transition: all 0.3s;
                }
                .stakes-bar.busted {
                    border-color: rgba(239, 68, 68, 0.5);
                    background: rgba(239, 68, 68, 0.1);
                }
                .stakes-pot {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .stake-gem { color: #06b6d4; }
                .stake-value {
                    font-size: 22px;
                    font-weight: 900;
                    color: #06b6d4;
                    font-family: 'Orbitron', monospace;
                }
                .stake-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                }
                .multiplier-badge {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    background: rgba(251, 191, 36, 0.15);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 8px;
                    color: #fbbf24;
                    font-weight: 800;
                    font-size: 14px;
                }
                .cash-out-btn {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #22c55e, #16a34a);
                    border: none;
                    border-radius: 8px;
                    color: #fff;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                    animation: cashPulse 2s ease-in-out infinite;
                    transition: transform 0.2s;
                }
                .cash-out-btn:hover {
                    transform: scale(1.05);
                }
                @keyframes cashPulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
                    50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.6); }
                }

                /* ═══ COMBO POPUP ═══ */
                .combo-popup {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 20;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, rgba(249, 115, 22, 0.9), rgba(239, 68, 68, 0.9));
                    border-radius: 16px;
                    color: #fff;
                    font-size: 20px;
                    font-weight: 900;
                    letter-spacing: 1px;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                    pointer-events: none;
                }
                .combo-flame { animation: flameFlicker 0.3s ease infinite alternate; }
                @keyframes flameFlicker {
                    from { transform: scale(1) rotate(-5deg); }
                    to { transform: scale(1.1) rotate(5deg); }
                }
                .combo-mult {
                    padding: 2px 8px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    font-size: 16px;
                }

                .streak-lost-popup {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 20;
                    padding: 14px 28px;
                    background: rgba(239, 68, 68, 0.9);
                    border-radius: 12px;
                    color: #fff;
                    font-size: 22px;
                    font-weight: 900;
                    letter-spacing: 2px;
                    pointer-events: none;
                }

                .bust-popup {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 25;
                    padding: 20px 40px;
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95), rgba(30, 0, 0, 0.95));
                    border: 2px solid rgba(239, 68, 68, 0.6);
                    border-radius: 16px;
                    color: #ef4444;
                    font-size: 32px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
                    pointer-events: none;
                }

                /* ═══ FLOATING DIAMONDS ═══ */
                .floating-diamond {
                    position: absolute;
                    left: 50%;
                    bottom: 40%;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: #06b6d4;
                    font-weight: 800;
                    font-size: 18px;
                    pointer-events: none;
                    z-index: 15;
                    text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
                }

                /* ═══ HEADER & PROGRESS ═══ */
                .game-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    gap: 20px;
                    position: relative;
                    z-index: 1;
                }

                .progress-info { flex: 1; }
                .question-count {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    display: block;
                    margin-bottom: 8px;
                }
                .progress-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #0ea5e9, #06b6d4);
                    transition: width 0.3s ease;
                }

                /* ═══ CIRCULAR TIMER ═══ */
                .timer-ring-container {
                    position: relative;
                    width: 56px;
                    height: 56px;
                    flex-shrink: 0;
                }
                .timer-ring-container.heartbeat {
                    animation: heartbeat 0.6s ease-in-out infinite;
                }
                @keyframes heartbeat {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                .timer-ring {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg);
                }
                .timer-ring-bg {
                    fill: none;
                    stroke: rgba(255, 255, 255, 0.08);
                    stroke-width: 4;
                }
                .timer-ring-fill {
                    fill: none;
                    stroke-width: 4;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 1s linear, stroke 0.5s ease;
                }
                .timer-text {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: 800;
                    color: rgba(255, 255, 255, 0.9);
                    font-family: 'Orbitron', monospace;
                }
                .timer-text.critical {
                    color: #ef4444;
                    animation: timerPulse 0.5s ease infinite alternate;
                }
                @keyframes timerPulse {
                    from { opacity: 1; }
                    to { opacity: 0.5; }
                }

                /* ═══ QUESTION CARD ═══ */
                .question-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 32px;
                    position: relative;
                    z-index: 1;
                    perspective: 1000px;
                }

                .question-meta {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .category {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .difficulty {
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    padding: 4px 10px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                }
                .question-stake {
                    margin-left: auto;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #06b6d4;
                }
                .question-text {
                    font-size: 22px;
                    font-weight: 600;
                    color: #ffffff;
                    line-height: 1.4;
                    margin: 0 0 28px 0;
                }

                /* ═══ OPTIONS ═══ */
                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .option {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 16px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .option:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(14, 165, 233, 0.5);
                    box-shadow: 0 0 15px rgba(14, 165, 233, 0.1);
                }
                .option:disabled { cursor: default; }
                .option.correct {
                    background: rgba(34, 197, 94, 0.15);
                    border-color: #22c55e;
                    box-shadow: 0 0 20px rgba(34, 197, 94, 0.2);
                }
                .option.incorrect {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: #ef4444;
                }
                .option-letter {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 14px;
                    flex-shrink: 0;
                }
                .option-text { flex: 1; }
                .result-icon { flex-shrink: 0; }
                .result-icon.correct { color: #22c55e; }
                .result-icon.incorrect { color: #ef4444; }

                .option.eliminated {
                    opacity: 0.4;
                    background: rgba(255, 255, 255, 0.02);
                    border-color: rgba(255, 255, 255, 0.05);
                    cursor: not-allowed;
                }
                .option.eliminated .option-text {
                    text-decoration: line-through;
                }

                /* ═══ HINTS, EXPLANATION, NEXT ═══ */
                .hints-section {
                    margin-top: 20px;
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                }
                .explanation-section {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                .explanation-toggle {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 14px;
                    cursor: pointer;
                    padding: 0;
                    transition: color 0.2s;
                }
                .explanation-toggle:hover { color: rgba(255, 255, 255, 0.9); }
                .explanation-content {
                    margin-top: 16px;
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    overflow: hidden;
                }
                .explanation-content p {
                    margin: 0;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    line-height: 1.6;
                }
                .next-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    margin-top: 24px;
                    padding: 16px 24px;
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    border-radius: 10px;
                    color: #ffffff;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .next-button:hover {
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }
            `}</style>
        </div>
    );
}
