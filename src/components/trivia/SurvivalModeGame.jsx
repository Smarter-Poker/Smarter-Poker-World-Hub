/**
 * SURVIVAL MODE TRIVIA GAME
 * Endless questions until you answer wrong - rewards stack every 5!
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Skull, Gem, CheckCircle, XCircle, Trophy, Flame } from 'lucide-react';
import { calculateDiamonds } from '../../lib/trivia/triviaEngine';
import './SurvivalModeGame.css';

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
            <div className="multiplier-bar">
                <div className="mult-progress">
                    <div
                        className="mult-fill"
                        style={{
                            width: `${((streak % 5) / 5) * 100}%`,
                            background: getMultiplierColor(multiplier),
                            boxShadow: `0 0 10px ${getMultiplierColor(multiplier)}`
                        }}
                    />
                </div>
                <div
                    className="mult-badge"
                    style={{ background: getMultiplierColor(multiplier) }}
                >
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
                        className="survival-question-card"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="question-number">
                            Question #{streak + 1}
                        </div>

                        <h2 className="survival-question-text">{currentQuestion?.question}</h2>

                        <div className="survival-options">
                            {currentQuestion?.options.map((option, index) => {
                                let optionClass = 'survival-option';
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
        </div>
    );
}
