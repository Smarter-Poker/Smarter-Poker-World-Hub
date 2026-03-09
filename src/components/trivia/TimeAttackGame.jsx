/**
 * TIME ATTACK GAME — 30 seconds, answer as many as possible
 * Speed creates adrenaline, 1💎 per 3 correct (max 5💎/day)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Gem, Target, Timer } from 'lucide-react';
import { busEmit } from '../../engine/EventBus';
import MetalFrame from '../ui/MetalFrame';

const GAME_DURATION = 30; // seconds
const DAILY_DIAMOND_CAP = 5;
const DIAMONDS_PER_MILESTONE = 1;
const MILESTONE_INTERVAL = 3; // Every 3 correct = 1💎

export default function TimeAttackGame({
    questions = [],
    onComplete,
    dailyDiamondsEarned = 0
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const [gameOver, setGameOver] = useState(false);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [fastAnswers, setFastAnswers] = useState(0);
    const answerStartTime = useRef(Date.now());

    const currentQuestion = questions[currentIndex];
    const remainingCap = Math.max(0, DAILY_DIAMOND_CAP - dailyDiamondsEarned);

    // Main timer
    useEffect(() => {
        if (gameOver) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setGameOver(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [gameOver]);

    // Reset answer timer on new question
    useEffect(() => {
        answerStartTime.current = Date.now();
    }, [currentIndex]);

    const handleAnswer = (answerIndex) => {
        if (isRevealing || gameOver) return;

        const answerTime = (Date.now() - answerStartTime.current) / 1000;
        setSelectedAnswer(answerIndex);
        setIsRevealing(true);

        const isCorrect = answerIndex === currentQuestion.correct_index;

        // Quick reveal for speed
        setTimeout(() => {
            if (isCorrect) {
                const newCorrect = correctCount + 1;
                setCorrectCount(newCorrect);
                busEmit.decisionCorrect(newCorrect);

                // Track fast answers (under 3 seconds)
                if (answerTime < 3) {
                    setFastAnswers(prev => prev + 1);
                }

                // Check for diamond milestone
                if (newCorrect % MILESTONE_INTERVAL === 0) {
                    const potentialDiamonds = diamondsEarned + DIAMONDS_PER_MILESTONE;
                    if (potentialDiamonds <= remainingCap) {
                        setDiamondsEarned(potentialDiamonds);
                    }
                }
            } else {
                setWrongCount(prev => prev + 1);
                busEmit.decisionIncorrect(correctCount);
                busEmit.screenShake('light');
            }

            // Quick next question
            if (currentIndex < questions.length - 1) {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setIsRevealing(false);
            } else {
                setGameOver(true);
            }
        }, 400); // Fast reveal for speed mode
    };

    const handleGameOver = () => {
        onComplete?.({
            correctCount,
            wrongCount,
            diamondsEarned: Math.min(diamondsEarned, remainingCap),
            fastAnswers,
            mode: 'time-attack'
        });
    };

    useEffect(() => {
        if (gameOver) {
            handleGameOver();
        }
    }, [gameOver]);

    if (!currentQuestion && !gameOver) {
        return (
            <div className="loading">
                <div className="spinner" />
                <p>Loading...</p>
            </div>
        );
    }

    // Calculate progress bar width
    const timeProgress = (timeLeft / GAME_DURATION) * 100;

    return (
        <div className="time-attack-game">
            {/* Timer Bar */}
            <div className="timer-container">
                <div className="timer-bar">
                    <motion.div
                        className="timer-fill"
                        initial={{ width: '100%' }}
                        animate={{ width: `${timeProgress}%` }}
                        style={{
                            background: timeLeft <= 10
                                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                                : 'linear-gradient(90deg, #00d4ff, #22c55e)'
                        }}
                    />
                </div>
                <div className="timer-text" data-warning={timeLeft <= 10}>
                    <Clock size={20} />
                    <span>{timeLeft}s</span>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-bar">
                <div className="stat">
                    <Target size={18} />
                    <span>{correctCount}</span>
                </div>
                <div className="stat">
                    <Zap size={18} />
                    <span>{fastAnswers} fast</span>
                </div>
                <div className="stat diamonds">
                    <Gem size={18} />
                    <span>+{diamondsEarned}</span>
                </div>
            </div>

            {/* Question */}
            {!gameOver && currentQuestion && (
                <div className="question-container">
                    <MetalFrame padding="20px" showBolts={false}>
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
                </div>
            )}

            {/* Game Over */}
            {gameOver && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="game-over"
                >
                    <MetalFrame padding="32px" showBolts={true}>
                        <Timer size={48} className="game-over-icon" />
                        <h2>TIME'S UP!</h2>

                        <div className="final-stats">
                            <div className="stat-row">
                                <Target size={24} />
                                <span className="stat-value">{correctCount}</span>
                                <span className="stat-label">Correct</span>
                            </div>
                            <div className="stat-row">
                                <Zap size={24} />
                                <span className="stat-value">{fastAnswers}</span>
                                <span className="stat-label">Fast Answers</span>
                            </div>
                            <div className="stat-row highlight">
                                <Gem size={24} />
                                <span className="stat-value">+{Math.min(diamondsEarned, remainingCap)}</span>
                                <span className="stat-label">Diamonds</span>
                            </div>
                        </div>
                    </MetalFrame>
                </motion.div>
            )}

            <style jsx>{`
                .time-attack-game {
                    padding: 20px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .timer-container {
                    margin-bottom: 16px;
                }

                .timer-bar {
                    height: 12px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .timer-fill {
                    height: 100%;
                    border-radius: 6px;
                    transition: background 0.3s ease;
                }

                .timer-text {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }

                .timer-text[data-warning="true"] {
                    color: #ef4444;
                    animation: pulse 0.5s ease-in-out infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding: 10px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 10px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.diamonds {
                    color: #00d4ff;
                }

                .question-container {
                    margin-bottom: 24px;
                }

                .question-text {
                    font-size: 17px;
                    font-weight: 600;
                    color: #fff;
                    text-align: center;
                    margin: 0;
                    line-height: 1.4;
                }

                .answers-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-top: 16px;
                }

                .answer-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    padding: 14px 10px;
                    background: rgba(30, 41, 59, 0.8);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    text-align: center;
                }

                .answer-btn:hover:not(:disabled) {
                    border-color: #00d4ff;
                    transform: scale(1.02);
                }

                .answer-btn.correct {
                    border-color: #22c55e;
                    background: rgba(34, 197, 94, 0.3);
                }

                .answer-btn.wrong {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.3);
                }

                .answer-label {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 700;
                    font-size: 13px;
                    color: #fff;
                }

                .answer-text {
                    font-size: 13px;
                    color: #fff;
                    line-height: 1.3;
                }

                .game-over {
                    text-align: center;
                }

                .game-over-icon {
                    color: #f97316;
                    margin-bottom: 12px;
                }

                .game-over h2 {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 20px 0;
                }

                .final-stats {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .stat-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                }

                .stat-row.highlight {
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                }

                .stat-value {
                    font-size: 22px;
                    font-weight: 700;
                    color: #fff;
                }

                .stat-label {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-left: auto;
                }

                .loading {
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
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
