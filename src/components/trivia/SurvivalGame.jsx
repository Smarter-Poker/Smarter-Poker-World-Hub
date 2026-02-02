/**
 * SURVIVAL MODE GAME — Answer until you miss
 * Endless questions, leaderboard for longest runs
 * Earns 1💎 per 5 correct (max 10💎/day)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, Trophy, Clock, Target, AlertTriangle, Gem } from 'lucide-react';
import MetalFrame from '../ui/MetalFrame';
import HexButton from '../ui/HexButton';

const DAILY_DIAMOND_CAP = 10;
const DIAMONDS_PER_MILESTONE = 1;
const MILESTONE_INTERVAL = 5; // Every 5 correct = 1💎

export default function SurvivalGame({
    questions = [],
    onComplete,
    onLoadMoreQuestions,
    dailyDiamondsEarned = 0
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [lives, setLives] = useState(1); // Survival = 1 life
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [timePerQuestion, setTimePerQuestion] = useState(15);
    const [timeLeft, setTimeLeft] = useState(15);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [streak, setStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);

    const currentQuestion = questions[currentIndex];
    const remainingCap = Math.max(0, DAILY_DIAMOND_CAP - dailyDiamondsEarned);

    // Timer countdown
    useEffect(() => {
        if (gameOver || isRevealing || !currentQuestion) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    handleTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [currentIndex, gameOver, isRevealing, currentQuestion]);

    // Load more questions when running low
    useEffect(() => {
        if (currentIndex >= questions.length - 3 && onLoadMoreQuestions) {
            onLoadMoreQuestions();
        }
    }, [currentIndex, questions.length, onLoadMoreQuestions]);

    const handleTimeout = useCallback(() => {
        // Time ran out = wrong answer
        handleAnswer(-1); // Invalid answer
    }, []);

    const handleAnswer = (answerIndex) => {
        if (isRevealing || gameOver) return;

        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === currentQuestion.correct_index;

        setTimeout(() => {
            if (isCorrect) {
                const newCorrect = correctCount + 1;
                setCorrectCount(newCorrect);
                setStreak(prev => prev + 1);
                setBestStreak(prev => Math.max(prev, streak + 1));

                // Check for diamond milestone
                if (newCorrect % MILESTONE_INTERVAL === 0) {
                    const potentialDiamonds = diamondsEarned + DIAMONDS_PER_MILESTONE;
                    if (potentialDiamonds <= remainingCap) {
                        setDiamondsEarned(potentialDiamonds);
                    }
                }

                // Speed up timer slightly as you go
                setTimePerQuestion(prev => Math.max(8, prev - 0.2));

                // Next question
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setIsRevealing(false);
                setTimeLeft(timePerQuestion);
            } else {
                // Wrong answer = game over in survival
                setLives(0);
                setGameOver(true);
            }
        }, 1500);
    };

    const handleGameOver = () => {
        onComplete?.({
            correctCount,
            diamondsEarned: Math.min(diamondsEarned, remainingCap),
            bestStreak,
            mode: 'survival'
        });
    };

    if (!currentQuestion && !gameOver) {
        return (
            <div className="survival-loading">
                <div className="spinner" />
                <p>Loading questions...</p>
            </div>
        );
    }

    return (
        <div className="survival-game">
            {/* Stats Bar */}
            <div className="stats-bar">
                <div className="stat">
                    <Target size={18} />
                    <span>{correctCount}</span>
                </div>
                <div className="stat timer" data-warning={timeLeft <= 5}>
                    <Clock size={18} />
                    <span>{timeLeft}s</span>
                </div>
                <div className="stat diamonds">
                    <Gem size={18} />
                    <span>+{diamondsEarned}</span>
                </div>
            </div>

            {/* Progress indicator */}
            <div className="milestone-progress">
                <div className="milestone-bar">
                    <div
                        className="milestone-fill"
                        style={{ width: `${(correctCount % MILESTONE_INTERVAL) / MILESTONE_INTERVAL * 100}%` }}
                    />
                </div>
                <span className="milestone-text">
                    {MILESTONE_INTERVAL - (correctCount % MILESTONE_INTERVAL)} more for +1💎
                </span>
            </div>

            {/* Question */}
            <AnimatePresence mode="wait">
                {!gameOver && currentQuestion && (
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="question-container"
                    >
                        <MetalFrame padding="24px" showBolts={true}>
                            <p className="question-text">{currentQuestion.question}</p>
                        </MetalFrame>

                        <div className="answers-grid">
                            {currentQuestion.options.map((option, idx) => {
                                const isSelected = selectedAnswer === idx;
                                const isCorrect = idx === currentQuestion.correct_index;
                                const showResult = isRevealing;

                                let className = 'answer-btn';
                                if (showResult) {
                                    if (isCorrect) className += ' correct';
                                    else if (isSelected) className += ' wrong';
                                }

                                return (
                                    <button
                                        key={idx}
                                        className={className}
                                        onClick={() => handleAnswer(idx)}
                                        disabled={isRevealing}
                                    >
                                        <span className="answer-label">{String.fromCharCode(65 + idx)}</span>
                                        <span className="answer-text">{option}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Game Over Screen */}
            {gameOver && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="game-over"
                >
                    <MetalFrame padding="32px" showBolts={true} showNeonStrips={true}>
                        <AlertTriangle size={48} className="game-over-icon" />
                        <h2>SURVIVAL ENDED</h2>

                        <div className="final-stats">
                            <div className="stat-row">
                                <Target size={24} />
                                <span className="stat-value">{correctCount}</span>
                                <span className="stat-label">Questions Answered</span>
                            </div>
                            <div className="stat-row highlight">
                                <Gem size={24} />
                                <span className="stat-value">+{Math.min(diamondsEarned, remainingCap)}</span>
                                <span className="stat-label">Diamonds Earned</span>
                            </div>
                            {remainingCap <= 0 && (
                                <div className="cap-warning">
                                    Daily diamond cap reached!
                                </div>
                            )}
                        </div>

                        <HexButton
                            label="Continue"
                            onClick={handleGameOver}
                            variant="primary"
                            size="lg"
                        />
                    </MetalFrame>
                </motion.div>
            )}

            <style jsx>{`
                .survival-game {
                    padding: 20px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.timer[data-warning="true"] {
                    color: #ef4444;
                    animation: pulse 0.5s ease-in-out infinite;
                }

                .stat.diamonds {
                    color: #00d4ff;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }

                .milestone-progress {
                    margin-bottom: 20px;
                    text-align: center;
                }

                .milestone-bar {
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .milestone-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #00d4ff, #22c55e);
                    transition: width 0.3s ease;
                }

                .milestone-text {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                }

                .question-container {
                    margin-bottom: 24px;
                }

                .question-text {
                    font-size: 18px;
                    font-weight: 600;
                    color: #fff;
                    text-align: center;
                    margin: 0;
                    line-height: 1.5;
                }

                .answers-grid {
                    display: grid;
                    gap: 12px;
                    margin-top: 20px;
                }

                .answer-btn {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: left;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #00d4ff;
                    background: rgba(0, 212, 255, 0.1);
                }

                .answer-btn:disabled {
                    cursor: not-allowed;
                }

                .answer-btn.correct {
                    border-color: #22c55e;
                    background: rgba(34, 197, 94, 0.2);
                }

                .answer-btn.wrong {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.2);
                }

                .answer-label {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    font-weight: 700;
                    color: #fff;
                    flex-shrink: 0;
                }

                .answer-text {
                    font-size: 15px;
                    color: #fff;
                }

                .game-over {
                    text-align: center;
                }

                .game-over-icon {
                    color: #f97316;
                    margin-bottom: 16px;
                }

                .game-over h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 24px 0;
                }

                .final-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin-bottom: 24px;
                }

                .stat-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 12px;
                }

                .stat-row.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .stat-row .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }

                .stat-row .stat-label {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-left: auto;
                }

                .cap-warning {
                    padding: 12px;
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    border-radius: 8px;
                    color: #fbbf24;
                    font-size: 14px;
                }

                .survival-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 300px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
