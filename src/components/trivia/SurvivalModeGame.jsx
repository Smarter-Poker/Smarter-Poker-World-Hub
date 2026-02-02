/**
 * SURVIVAL MODE TRIVIA GAME
 * Endless questions until you answer wrong - rewards stack every 5!
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Skull, Gem, CheckCircle, XCircle, Trophy, Flame } from 'lucide-react';
import { calculateDiamonds } from '../../lib/trivia/triviaEngine';

export default function SurvivalModeGame({
    questions,
    onComplete,
    onLoadMoreQuestions,
    userId
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [isGameOver, setIsGameOver] = useState(false);
    const [streak, setStreak] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [multiplier, setMultiplier] = useState(1);

    const startTimeRef = useRef(Date.now());
    const currentQuestion = questions[currentIndex];

    // Calculate current multiplier (increases every 5 questions)
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // Load more questions when running low
    useEffect(() => {
        if (currentIndex >= questions.length - 3 && onLoadMoreQuestions) {
            onLoadMoreQuestions();
        }
    }, [currentIndex, questions.length, onLoadMoreQuestions]);

    const playSound = (isCorrect) => {
        try {
            const audio = new Audio(isCorrect ? '/sounds/correct.mp3' : '/sounds/incorrect.mp3');
            audio.volume = isCorrect ? 0.6 : 0.5;
            audio.play().catch(() => { });
        } catch (e) { }
    };

    const selectAnswer = (index) => {
        if (selectedAnswer !== null) return;

        setSelectedAnswer(index);
        setShowResult(true);

        const correct = index === currentQuestion.correct_index;
        playSound(correct);

        const newAnswers = [...answers, index];
        setAnswers(newAnswers);

        if (correct) {
            // Award diamonds based on current multiplier
            const diamondsForThisAnswer = multiplier;
            setDiamondsEarned(prev => prev + diamondsForThisAnswer);
            setStreak(prev => prev + 1);

            // Auto-advance after showing result
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
            }, 1000);
        } else {
            // GAME OVER
            setIsGameOver(true);

            setTimeout(() => {
                const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
                onComplete({
                    answers: newAnswers,
                    correctCount: streak,
                    totalQuestions: streak + 1,
                    timeSpent,
                    diamondsEarned: calculateDiamonds('survival', streak, streak + 1, 0),
                    streak,
                    multiplier
                });
            }, 2000);
        }
    };

    const getMultiplierColor = (mult) => {
        if (mult >= 5) return '#FFD700'; // Gold
        if (mult >= 3) return '#A855F7'; // Purple
        if (mult >= 2) return '#06B6D4'; // Cyan
        return '#22C55E'; // Green
    };

    if (!currentQuestion && !isGameOver) {
        return (
            <div className="survival-loading">
                <div className="loading-spinner" />
                <p>Loading more questions...</p>
            </div>
        );
    }

    return (
        <div className="survival-game">
            {/* Survival Header - Lives & Score */}
            <div className="survival-header">
                <div className="lives-display">
                    <Heart size={24} fill="#ef4444" color="#ef4444" />
                    <span className="lives-text">SURVIVAL</span>
                </div>

                <div className="streak-display">
                    <Flame size={20} className="streak-icon" />
                    <span className="streak-count">{streak}</span>
                    <span className="streak-label">STREAK</span>
                </div>

                <div className="diamonds-display">
                    <Gem size={20} className="diamond-icon" />
                    <span className="diamonds-count">{diamondsEarned}</span>
                </div>
            </div>

            {/* Multiplier Indicator */}
            <div
                className="multiplier-bar"
                style={{ '--mult-color': getMultiplierColor(multiplier) }}
            >
                <div className="mult-progress">
                    <div
                        className="mult-fill"
                        style={{ width: `${((streak % 5) / 5) * 100}%` }}
                    />
                </div>
                <div className="mult-badge">
                    <span>{multiplier}x</span>
                </div>
                <span className="mult-next">
                    {5 - (streak % 5)} to next multiplier
                </span>
            </div>

            {/* Question Card */}
            <AnimatePresence mode="wait">
                {!isGameOver ? (
                    <motion.div
                        key={currentIndex}
                        className="question-card"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="question-number">
                            Question #{streak + 1}
                        </div>

                        <h2 className="question-text">{currentQuestion?.question}</h2>

                        <div className="options">
                            {currentQuestion?.options.map((option, index) => {
                                let optionClass = 'option';
                                if (showResult) {
                                    if (index === currentQuestion.correct_index) {
                                        optionClass += ' correct';
                                    } else if (index === selectedAnswer) {
                                        optionClass += ' incorrect';
                                    }
                                }

                                return (
                                    <button
                                        key={index}
                                        className={optionClass}
                                        onClick={() => selectAnswer(index)}
                                        disabled={selectedAnswer !== null}
                                    >
                                        <span className="option-letter">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        <span className="option-text">{option}</span>
                                        {showResult && index === currentQuestion.correct_index && (
                                            <CheckCircle size={20} className="result-icon correct" />
                                        )}
                                        {showResult && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                            <XCircle size={20} className="result-icon incorrect" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Reward Preview */}
                        <div className="reward-preview">
                            <Gem size={14} />
                            <span>+{multiplier} for correct answer</span>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        className="game-over-card"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="game-over-icon">
                            <Skull size={64} />
                        </div>
                        <h2>GAME OVER</h2>
                        <div className="final-stats">
                            <div className="stat">
                                <Trophy size={24} />
                                <span className="stat-value">{streak}</span>
                                <span className="stat-label">Questions Answered</span>
                            </div>
                            <div className="stat">
                                <Gem size={24} />
                                <span className="stat-value">{calculateDiamonds('survival', streak, streak + 1, 0)}</span>
                                <span className="stat-label">Diamonds Earned</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                .survival-game {
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .survival-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(0, 0, 0, 0.3));
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    border-radius: 12px;
                }

                .lives-display {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .lives-text {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 16px;
                    font-weight: 700;
                    color: #ef4444;
                    text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
                }

                .streak-display {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #fbbf24;
                }

                .streak-icon {
                    animation: flicker 0.5s ease-in-out infinite alternate;
                }

                @keyframes flicker {
                    from { opacity: 1; }
                    to { opacity: 0.6; }
                }

                .streak-count {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                }

                .streak-label {
                    font-size: 10px;
                    opacity: 0.7;
                }

                .diamonds-display {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #00D4FF;
                }

                .diamond-icon {
                    animation: pulse-glow 2s ease-in-out infinite;
                }

                @keyframes pulse-glow {
                    0%, 100% { filter: drop-shadow(0 0 4px rgba(0, 212, 255, 0.5)); }
                    50% { filter: drop-shadow(0 0 10px rgba(0, 212, 255, 0.8)); }
                }

                .diamonds-count {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 20px;
                    font-weight: 700;
                }

                .multiplier-bar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    margin-bottom: 24px;
                }

                .mult-progress {
                    flex: 1;
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .mult-fill {
                    height: 100%;
                    background: var(--mult-color);
                    transition: width 0.3s ease;
                    box-shadow: 0 0 10px var(--mult-color);
                }

                .mult-badge {
                    padding: 4px 12px;
                    background: var(--mult-color);
                    border-radius: 4px;
                    font-family: 'Orbitron', sans-serif;
                    font-size: 14px;
                    font-weight: 700;
                    color: #000;
                }

                .mult-next {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.5);
                    white-space: nowrap;
                }

                .question-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 32px;
                }

                .question-number {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.5);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin-bottom: 16px;
                }

                .question-text {
                    font-size: 22px;
                    font-weight: 600;
                    color: #ffffff;
                    line-height: 1.4;
                    margin: 0 0 28px 0;
                }

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
                    border-color: rgba(239, 68, 68, 0.5);
                }

                .option:disabled {
                    cursor: default;
                }

                .option.correct {
                    background: rgba(34, 197, 94, 0.15);
                    border-color: #22c55e;
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

                .result-icon.correct {
                    color: #22c55e;
                }

                .result-icon.incorrect {
                    color: #ef4444;
                }

                .reward-preview {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    margin-top: 24px;
                    padding: 12px;
                    background: rgba(0, 212, 255, 0.1);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    border-radius: 8px;
                    color: #00D4FF;
                    font-size: 13px;
                }

                .game-over-card {
                    text-align: center;
                    padding: 48px;
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(0, 0, 0, 0.4));
                    border: 2px solid rgba(239, 68, 68, 0.4);
                    border-radius: 16px;
                }

                .game-over-icon {
                    color: #ef4444;
                    margin-bottom: 24px;
                }

                .game-over-card h2 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 32px;
                    color: #ef4444;
                    margin: 0 0 32px 0;
                    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
                }

                .final-stats {
                    display: flex;
                    justify-content: center;
                    gap: 48px;
                }

                .stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                }

                .stat svg {
                    color: #fbbf24;
                }

                .stat:last-child svg {
                    color: #00D4FF;
                }

                .stat-value {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 36px;
                    font-weight: 700;
                    color: #ffffff;
                }

                .stat-label {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                    text-transform: uppercase;
                }

                .survival-loading {
                    text-align: center;
                    padding: 48px;
                    color: rgba(255, 255, 255, 0.6);
                }

                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #ef4444;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
