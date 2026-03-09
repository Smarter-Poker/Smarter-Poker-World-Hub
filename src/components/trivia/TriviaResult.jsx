/**
 * TRIVIA RESULT — Results screen with addictive game mechanics
 * 
 * Features:
 * - Animated SVG grade ring (draws itself)
 * - Ghost opponent comparison panel
 * - Diamond count-up animation (slot machine style)
 * - "FLAWLESS VICTORY" slam text on perfect scores
 * - Stakes cashout summary
 */

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Zap, Gem, Target, Clock, Flame, RotateCcw, Home, ChevronRight, Crown } from 'lucide-react';
import confetti from 'canvas-confetti';
import * as audio from '../../lib/trivia/triviaAudio';

export default function TriviaResult({
    mode,
    correctCount,
    totalQuestions,
    timeSpent,
    timeRemaining,
    xpEarned,
    diamondsEarned,
    streak,
    streakMultiplier = 1,
    isPerfect: isPerfectProp,
    showSpinButton = false,
    showDoubleButton = false,
    onPlayAgain,
    onSpinWheel,
    onDoubleOrNothing,
    onGoHome,
    // ══ NEW PROPS ══
    opponentScore = null,   // Ghost opponent final score
    opponentName = null,    // Ghost opponent name
    stakePot = 0,           // Total diamonds from stakes
    cashedOut = false,       // Whether player cashed out
}) {
    const accuracy = Math.round((correctCount / totalQuestions) * 100);
    const isPerfect = isPerfectProp || correctCount === totalQuestions;
    const isArcade = mode === 'arcade';
    const hasMultiplier = streakMultiplier > 1;
    const hasOpponent = opponentScore !== null;
    const playerWon = hasOpponent ? correctCount > opponentScore : true;
    const tied = hasOpponent && correctCount === opponentScore;

    // ══ Animated count-up ══
    const [displayDiamonds, setDisplayDiamonds] = useState(0);
    const [displayAccuracy, setDisplayAccuracy] = useState(0);
    const [showFlawless, setShowFlawless] = useState(false);
    const [ringProgress, setRingProgress] = useState(0);
    const countUpDone = useRef(false);

    useEffect(() => {
        // Confetti
        if (accuracy >= 70) {
            confetti({
                particleCount: isPerfect ? 200 : 80,
                spread: 70,
                origin: { y: 0.6 },
                colors: isPerfect ? ['#fbbf24', '#f59e0b', '#f02849', '#31a24c'] : undefined,
            });
        }
        if (isPerfect) {
            audio.victoryFanfare();
            setTimeout(() => {
                setShowFlawless(true);
                confetti({ particleCount: 100, spread: 100, origin: { y: 0.4 } });
            }, 800);
        }
    }, []);

    // Animate ring + numbers
    useEffect(() => {
        if (countUpDone.current) return;
        countUpDone.current = true;

        // Ring animation (0 → accuracy over 1.5s)
        const ringStart = Date.now();
        const ringDuration = 1500;
        const ringInterval = setInterval(() => {
            const elapsed = Date.now() - ringStart;
            const progress = Math.min(elapsed / ringDuration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setRingProgress(eased * accuracy);
            setDisplayAccuracy(Math.round(eased * accuracy));
            if (progress >= 1) clearInterval(ringInterval);
        }, 16);

        // Diamond count-up
        const totalDiamonds = stakePot || diamondsEarned || 0;
        if (totalDiamonds > 0) {
            const diamondStart = Date.now() + 500; // delay 500ms
            const diamondDuration = 1000;
            const diamondInterval = setInterval(() => {
                const elapsed = Date.now() - diamondStart;
                if (elapsed < 0) return;
                const progress = Math.min(elapsed / diamondDuration, 1);
                setDisplayDiamonds(Math.round(progress * totalDiamonds));
                if (progress >= 1) {
                    clearInterval(diamondInterval);
                    audio.cashOutKaChing();
                }
            }, 16);
            return () => { clearInterval(ringInterval); clearInterval(diamondInterval); };
        }
        return () => clearInterval(ringInterval);
    }, []);

    const getGrade = () => {
        if (accuracy >= 100) return { letter: 'S', color: '#fbbf24', label: 'PERFECT!' };
        if (accuracy >= 90) return { letter: 'A', color: '#31a24c', label: 'Excellent!' };
        if (accuracy >= 80) return { letter: 'B', color: '#2374e1', label: 'Great Job!' };
        if (accuracy >= 70) return { letter: 'C', color: '#8b5cf6', label: 'Good Work!' };
        if (accuracy >= 60) return { letter: 'D', color: '#f97316', label: 'Keep Trying!' };
        return { letter: 'F', color: '#f02849', label: 'Study Up!' };
    };

    const grade = getGrade();
    const circumference = 2 * Math.PI * 58;
    const ringOffset = circumference * (1 - ringProgress / 100);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    return (
        <div className="trivia-result">
            {/* ════ FLAWLESS VICTORY Slam ════ */}
            <AnimatePresence>
                {showFlawless && (
                    <motion.div
                        className="flawless-banner"
                        initial={{ opacity: 0, scale: 3, y: -50 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                    >
                        <Crown size={28} />
                        <span>FLAWLESS VICTORY</span>
                        <Crown size={28} />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="result-card"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, type: 'spring' }}
            >
                {/* Header */}
                <div className="result-header">
                    <Trophy size={48} className="trophy-icon" />
                    <h1>{cashedOut ? 'Cashed Out!' : isArcade ? 'Arcade Complete!' : 'Quiz Complete!'}</h1>
                    <p className="grade-label">{grade.label}</p>
                </div>

                {/* ════ Animated Grade Ring ════ */}
                <div className="grade-ring-container">
                    <svg viewBox="0 0 130 130" className="grade-ring-svg">
                        <circle cx="65" cy="65" r="58" className="ring-bg" />
                        <circle
                            cx="65" cy="65" r="58"
                            className="ring-fill"
                            style={{
                                strokeDasharray: circumference,
                                strokeDashoffset: ringOffset,
                                stroke: grade.color,
                            }}
                        />
                    </svg>
                    <div className="grade-inner">
                        <motion.span
                            className="grade-letter"
                            style={{ color: grade.color }}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 1.2, type: 'spring', stiffness: 400 }}
                        >
                            {grade.letter}
                        </motion.span>
                        <span className="grade-percent">{displayAccuracy}%</span>
                    </div>
                </div>

                {/* ════ Ghost Opponent Comparison ════ */}
                {hasOpponent && (
                    <motion.div
                        className={`opponent-result ${playerWon ? 'won' : tied ? 'tied' : 'lost'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <div className="opp-side you">
                            <span className="opp-label">YOU</span>
                            <span className="opp-score">{correctCount}</span>
                        </div>
                        <div className="opp-vs">
                            {playerWon ? (
                                <span className="win-badge">WIN!</span>
                            ) : tied ? (
                                <span className="tie-badge">TIE</span>
                            ) : (
                                <span className="loss-badge">LOSS</span>
                            )}
                        </div>
                        <div className="opp-side them">
                            <span className="opp-score">{opponentScore}</span>
                            <span className="opp-label">{opponentName || 'Opponent'}</span>
                        </div>
                    </motion.div>
                )}

                {/* Stats Grid */}
                <div className="stats-grid">
                    <div className="stat-item">
                        <Target size={24} className="stat-icon" />
                        <div className="stat-value">{correctCount}/{totalQuestions}</div>
                        <div className="stat-label">Correct</div>
                    </div>

                    <div className="stat-item">
                        <Clock size={24} className="stat-icon" />
                        <div className="stat-value">{formatTime(timeSpent)}</div>
                        <div className="stat-label">Time</div>
                    </div>

                    {(stakePot > 0 || diamondsEarned > 0) && (
                        <div className="stat-item highlight diamond-stat">
                            <Gem size={24} className="stat-icon diamond" />
                            <div className="stat-value diamond-value">+{displayDiamonds}</div>
                            <div className="stat-label">{cashedOut ? 'Cashed Out' : 'Diamonds'}</div>
                        </div>
                    )}

                    {xpEarned > 0 && (
                        <div className="stat-item highlight">
                            <Zap size={24} className="stat-icon xp" />
                            <div className="stat-value">+{xpEarned}</div>
                            <div className="stat-label">XP Earned</div>
                        </div>
                    )}

                    {hasMultiplier && (
                        <div className="stat-item multiplier">
                            <Zap size={24} className="stat-icon mult" />
                            <div className="stat-value">{streakMultiplier}x</div>
                            <div className="stat-label">Streak Bonus</div>
                        </div>
                    )}
                </div>

                {/* Streak Info */}
                {streak > 0 && !isArcade && (
                    <div className="streak-info">
                        <Flame size={20} />
                        <span>{streak} Day Streak!</span>
                    </div>
                )}

                {/* Arcade Time Bonus */}
                {isArcade && timeRemaining > 0 && (
                    <div className="time-bonus">
                        <Clock size={16} />
                        <span>+{Math.floor(timeRemaining / 6)} bonus diamonds for {timeRemaining}s remaining!</span>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="actions">
                    <Link href="/hub/trivia" className="action-btn secondary">
                        <Home size={18} />
                        Back to Trivia
                    </Link>
                    {!isArcade && mode !== 'daily' && (
                        <button className="action-btn primary" onClick={onPlayAgain}>
                            <RotateCcw size={18} />
                            Play Again
                        </button>
                    )}
                    {isArcade && (
                        <button className="action-btn primary" onClick={onPlayAgain}>
                            <ChevronRight size={18} />
                            Play Again (10 <Gem size={14} />)
                        </button>
                    )}

                    {showSpinButton && onSpinWheel && (
                        <button className="action-btn spin-wheel" onClick={onSpinWheel}>
                            <Trophy size={18} />
                            Spin Prize Wheel!
                        </button>
                    )}

                    {showDoubleButton && onDoubleOrNothing && (
                        <button className="action-btn double-or-nothing" onClick={onDoubleOrNothing}>
                            <Zap size={18} />
                            Double or Nothing ({diamondsEarned} → {diamondsEarned * 2} <Gem size={14} />)
                        </button>
                    )}
                </div>
            </motion.div>

            <style jsx>{`
                .trivia-result {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 70vh;
                    padding: 20px;
                    position: relative;
                }

                /* ═══ FLAWLESS VICTORY ═══ */
                .flawless-banner {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    padding: 14px 28px;
                    background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1));
                    border: 2px solid rgba(251, 191, 36, 0.5);
                    border-radius: 16px;
                    color: #fbbf24;
                    font-size: 24px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
                    animation: flawlessGlow 2s ease-in-out infinite alternate;
                }
                @keyframes flawlessGlow {
                    from { box-shadow: 0 0 15px rgba(251, 191, 36, 0.3); }
                    to { box-shadow: 0 0 35px rgba(251, 191, 36, 0.6); }
                }

                .result-card {
                    background: #242526;
                    border: 1px solid #4e4f50;
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    max-width: 480px;
                    width: 100%;
                }

                .result-header { margin-bottom: 24px; }
                .trophy-icon { color: #fbbf24; margin-bottom: 16px; }
                .result-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 8px 0;
                }
                .grade-label {
                    font-size: 16px;
                    color: #65676b;
                    margin: 0;
                }

                /* ═══ ANIMATED GRADE RING ═══ */
                .grade-ring-container {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    margin: 0 auto 28px;
                }
                .grade-ring-svg {
                    width: 100%;
                    height: 100%;
                    transform: rotate(-90deg);
                }
                .ring-bg {
                    fill: none;
                    stroke: #3a3b3c;
                    stroke-width: 6;
                }
                .ring-fill {
                    fill: none;
                    stroke-width: 6;
                    stroke-linecap: round;
                    transition: stroke-dashoffset 0.05s linear;
                    filter: drop-shadow(0 0 6px currentColor);
                }
                .grade-inner {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .grade-letter {
                    font-size: 48px;
                    font-weight: 900;
                    line-height: 1;
                }
                .grade-percent {
                    font-size: 16px;
                    color: #65676b;
                    margin-top: 4px;
                    font-family: 'Orbitron', monospace;
                }

                /* ═══ OPPONENT COMPARISON ═══ */
                .opponent-result {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    margin-bottom: 24px;
                    padding: 14px 20px;
                    border-radius: 12px;
                    border: 1px solid #4e4f50;
                    background: #18191a;
                }
                .opponent-result.won { border-color: rgba(49, 162, 76, 0.3); }
                .opponent-result.lost { border-color: rgba(240, 40, 73, 0.3); }
                .opp-side {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .opp-label {
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .opp-score {
                    font-size: 28px;
                    font-weight: 900;
                    color: #fff;
                    font-family: 'Orbitron', monospace;
                }
                .opp-vs { text-align: center; }
                .win-badge {
                    padding: 4px 12px;
                    background: rgba(49, 162, 76, 0.2);
                    border: 1px solid #31a24c;
                    border-radius: 8px;
                    color: #31a24c;
                    font-weight: 800;
                    font-size: 14px;
                }
                .tie-badge {
                    padding: 4px 12px;
                    background: rgba(251, 191, 36, 0.2);
                    border: 1px solid #fbbf24;
                    border-radius: 8px;
                    color: #fbbf24;
                    font-weight: 800;
                    font-size: 14px;
                }
                .loss-badge {
                    padding: 4px 12px;
                    background: rgba(240, 40, 73, 0.2);
                    border: 1px solid #f02849;
                    border-radius: 8px;
                    color: #f02849;
                    font-weight: 800;
                    font-size: 14px;
                }

                /* ═══ STATS ═══ */
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .stat-item {
                    background: #18191a;
                    border-radius: 12px;
                    padding: 16px;
                }
                .stat-item.highlight {
                    background: rgba(35, 116, 225, 0.1);
                    border: 1px solid rgba(35, 116, 225, 0.2);
                }
                .stat-item.multiplier {
                    background: rgba(255, 215, 0, 0.1);
                    border: 1px solid rgba(255, 215, 0, 0.3);
                }
                .diamond-stat {
                    background: rgba(35, 116, 225, 0.1) !important;
                    border: 1px solid rgba(35, 116, 225, 0.3) !important;
                }
                .diamond-value {
                    color: #2374e1 !important;
                    text-shadow: 0 0 10px rgba(35, 116, 225, 0.3);
                }
                .stat-icon {
                    color: #65676b;
                    margin-bottom: 8px;
                }
                .stat-icon.xp { color: #fbbf24; }
                .stat-icon.diamond { color: #2374e1; }
                .stat-icon.mult { color: #ffd700; }
                .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin-bottom: 4px;
                }
                .stat-label {
                    font-size: 12px;
                    color: #65676b;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .streak-info {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(249, 115, 22, 0.15);
                    border: 1px solid rgba(249, 115, 22, 0.3);
                    border-radius: 20px;
                    color: #f97316;
                    font-weight: 600;
                    margin-bottom: 24px;
                }

                .time-bonus {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: rgba(35, 116, 225, 0.15);
                    border: 1px solid rgba(35, 116, 225, 0.3);
                    border-radius: 20px;
                    color: #2374e1;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                /* ═══ ACTIONS ═══ */
                .actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-top: 8px;
                }
                .action-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 14px 20px;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-decoration: none;
                    min-width: 140px;
                }
                .action-btn.secondary {
                    background: #3a3b3c;
                    border: 1px solid #4e4f50;
                    color: rgba(255, 255, 255, 0.8);
                }
                .action-btn.secondary:hover { background: #4e4f50; }
                .action-btn.primary {
                    background: linear-gradient(135deg, #2374e1, #1a5cc4);
                    border: none;
                    color: #ffffff;
                }
                .action-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(35, 116, 225, 0.4);
                }
                .action-btn.spin-wheel {
                    background: linear-gradient(135deg, #ffd700, #ff8c00);
                    border: none;
                    color: #000;
                    animation: spinPulse 1.5s ease-in-out infinite;
                }
                .action-btn.spin-wheel:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.5);
                }
                @keyframes spinPulse {
                    0%, 100% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
                    50% { box-shadow: 0 0 25px rgba(255, 215, 0, 0.8); }
                }
                .action-btn.double-or-nothing {
                    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                    border: none;
                    color: #fff;
                    animation: doublePulse 2s ease-in-out infinite;
                }
                .action-btn.double-or-nothing:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.5);
                }
                @keyframes doublePulse {
                    0%, 100% { box-shadow: 0 0 10px rgba(139, 92, 246, 0.4); }
                    50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.7); }
                }
            `}</style>
        </div>
    );
}
