/**
 * TRIVIA RESULT - Results screen after completing trivia
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Trophy, Zap, Gem, Target, Clock, Flame, RotateCcw, Home, ChevronRight } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function TriviaResult({
    mode,
    correctCount,
    totalQuestions,
    timeSpent,
    timeRemaining,
    xpEarned,
    diamondsEarned,
    streak,
    onPlayAgain,
    onGoHome
}) {
    const accuracy = Math.round((correctCount / totalQuestions) * 100);
    const isPerfect = correctCount === totalQuestions;
    const isArcade = mode === 'arcade';

    useEffect(() => {
        if (accuracy >= 70) {
            confetti({
                particleCount: isPerfect ? 150 : 80,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }, [accuracy, isPerfect]);

    const getGrade = () => {
        if (accuracy >= 100) return { letter: 'S', color: '#fbbf24', label: 'PERFECT!' };
        if (accuracy >= 90) return { letter: 'A', color: '#22c55e', label: 'Excellent!' };
        if (accuracy >= 80) return { letter: 'B', color: '#0ea5e9', label: 'Great Job!' };
        if (accuracy >= 70) return { letter: 'C', color: '#8b5cf6', label: 'Good Work!' };
        if (accuracy >= 60) return { letter: 'D', color: '#f97316', label: 'Keep Trying!' };
        return { letter: 'F', color: '#ef4444', label: 'Study Up!' };
    };

    const grade = getGrade();

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    return (
        <div className="trivia-result">
            <motion.div
                className="result-card"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
            >
                {/* Header */}
                <div className="result-header">
                    <Trophy size={48} className="trophy-icon" />
                    <h1>{isArcade ? 'Arcade Complete!' : 'Quiz Complete!'}</h1>
                    <p className="grade-label">{grade.label}</p>
                </div>

                {/* Grade Circle */}
                <div className="grade-circle" style={{ borderColor: grade.color }}>
                    <span className="grade-letter" style={{ color: grade.color }}>{grade.letter}</span>
                    <span className="grade-percent">{accuracy}%</span>
                </div>

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

                    {xpEarned > 0 && (
                        <div className="stat-item highlight">
                            <Zap size={24} className="stat-icon xp" />
                            <div className="stat-value">+{xpEarned}</div>
                            <div className="stat-label">XP Earned</div>
                        </div>
                    )}

                    {isArcade && (
                        <div className="stat-item highlight">
                            <Gem size={24} className="stat-icon diamond" />
                            <div className="stat-value">+{diamondsEarned}</div>
                            <div className="stat-label">Diamonds</div>
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
                </div>
            </motion.div>

            <style jsx>{`
                .trivia-result {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 70vh;
                    padding: 20px;
                }

                .result-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    max-width: 480px;
                    width: 100%;
                }

                .result-header {
                    margin-bottom: 32px;
                }

                .trophy-icon {
                    color: #fbbf24;
                    margin-bottom: 16px;
                }

                .result-header h1 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #ffffff;
                    margin: 0 0 8px 0;
                }

                .grade-label {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .grade-circle {
                    width: 140px;
                    height: 140px;
                    margin: 0 auto 32px;
                    border: 4px solid;
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.3);
                }

                .grade-letter {
                    font-size: 56px;
                    font-weight: 900;
                    line-height: 1;
                }

                .grade-percent {
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-top: 4px;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .stat-item {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                }

                .stat-item.highlight {
                    background: rgba(14, 165, 233, 0.1);
                    border: 1px solid rgba(14, 165, 233, 0.2);
                }

                .stat-icon {
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 8px;
                }

                .stat-icon.xp {
                    color: #fbbf24;
                }

                .stat-icon.diamond {
                    color: #06b6d4;
                }

                .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #ffffff;
                    margin-bottom: 4px;
                }

                .stat-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
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
                    background: rgba(6, 182, 212, 0.15);
                    border: 1px solid rgba(6, 182, 212, 0.3);
                    border-radius: 20px;
                    color: #06b6d4;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                .actions {
                    display: flex;
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
                }

                .action-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.8);
                }

                .action-btn.secondary:hover {
                    background: rgba(255, 255, 255, 0.15);
                }

                .action-btn.primary {
                    background: linear-gradient(135deg, #0ea5e9, #0284c7);
                    border: none;
                    color: #ffffff;
                }

                .action-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }
            `}</style>
        </div>
    );
}
