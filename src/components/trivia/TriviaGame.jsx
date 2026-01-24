/**
 * TRIVIA GAME - Core gameplay component
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronRight, ChevronDown, ChevronUp, CheckCircle, XCircle, Zap } from 'lucide-react';

export default function TriviaGame({
    questions,
    mode,
    timeLimit = null,
    onComplete,
    onAnswer
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [answers, setAnswers] = useState([]);
    const [timeRemaining, setTimeRemaining] = useState(timeLimit);
    const [isLocked, setIsLocked] = useState(false);

    const timerRef = useRef(null);
    const startTimeRef = useRef(Date.now());

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion?.correct_index;
    const isArcadeMode = mode === 'arcade';

    // Timer for arcade mode
    useEffect(() => {
        if (!timeLimit) return;

        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [timeLimit]);

    const handleTimeUp = useCallback(() => {
        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const correctCount = answers.filter((a, i) => a === questions[i]?.correct_index).length;
        onComplete({
            answers,
            correctCount,
            totalQuestions: questions.length,
            timeSpent,
            timeRemaining: 0
        });
    }, [answers, questions, onComplete]);

    const playSound = (isCorrect) => {
        try {
            const audio = new Audio(isCorrect ? '/sounds/correct.mp3' : '/sounds/incorrect.mp3');
            audio.volume = isCorrect ? 0.6 : 0.5;
            audio.play().catch(() => {});
        } catch (e) {}
    };

    const selectAnswer = (index) => {
        if (isLocked || selectedAnswer !== null) return;

        setSelectedAnswer(index);
        setIsLocked(true);

        const correct = index === currentQuestion.correct_index;
        playSound(correct);

        const newAnswers = [...answers, index];
        setAnswers(newAnswers);

        if (onAnswer) {
            onAnswer({
                questionIndex: currentIndex,
                answerIndex: index,
                isCorrect: correct
            });
        }

        // Auto-advance in arcade mode
        if (isArcadeMode) {
            setTimeout(() => {
                advanceQuestion(newAnswers);
            }, 800);
        }
    };

    const advanceQuestion = (currentAnswers = answers) => {
        if (currentIndex >= questions.length - 1) {
            clearInterval(timerRef.current);
            const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const correctCount = currentAnswers.filter((a, i) => a === questions[i]?.correct_index).length;
            onComplete({
                answers: currentAnswers,
                correctCount,
                totalQuestions: questions.length,
                timeSpent,
                timeRemaining: timeRemaining || 0
            });
        } else {
            setCurrentIndex(prev => prev + 1);
            setSelectedAnswer(null);
            setShowExplanation(false);
            setIsLocked(false);
        }
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
            poker_history: 'Poker History',
            famous_hands: 'Famous Hands',
            gto_theory: 'GTO Theory',
            player_profiles: 'Player Profiles',
            tournament_facts: 'Tournament Facts',
            rule_knowledge: 'Rules & Etiquette'
        };
        return names[category] || 'General';
    };

    if (!currentQuestion) return null;

    const timerPercentage = timeLimit ? (timeRemaining / timeLimit) * 100 : 100;

    return (
        <div className="trivia-game">
            {/* Progress & Timer */}
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
                    <div className={`timer ${timeRemaining <= 10 ? 'warning' : ''}`}>
                        <Clock size={18} />
                        <span>{timeRemaining}s</span>
                        <div className="timer-bar">
                            <div
                                className="timer-fill"
                                style={{ width: `${timerPercentage}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Question Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    className="question-card"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                >
                    {/* Category & Difficulty */}
                    <div className="question-meta">
                        <span className="category">{getCategoryName(currentQuestion.category)}</span>
                        <span
                            className="difficulty"
                            style={{ color: getDifficultyColor(currentQuestion.difficulty) }}
                        >
                            {currentQuestion.difficulty?.toUpperCase()}
                        </span>
                    </div>

                    {/* Question Text */}
                    <h2 className="question-text">{currentQuestion.question}</h2>

                    {/* Answer Options */}
                    <div className="options">
                        {currentQuestion.options.map((option, index) => {
                            let optionClass = 'option';
                            if (selectedAnswer !== null) {
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
                                    disabled={isLocked}
                                >
                                    <span className="option-letter">
                                        {String.fromCharCode(65 + index)}
                                    </span>
                                    <span className="option-text">{option}</span>
                                    {selectedAnswer !== null && index === currentQuestion.correct_index && (
                                        <CheckCircle size={20} className="result-icon correct" />
                                    )}
                                    {selectedAnswer !== null && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                        <XCircle size={20} className="result-icon incorrect" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Explanation (non-arcade mode) */}
                    {!isArcadeMode && selectedAnswer !== null && currentQuestion.explanation && (
                        <div className="explanation-section">
                            <button
                                className="explanation-toggle"
                                onClick={() => setShowExplanation(!showExplanation)}
                            >
                                {showExplanation ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                            </button>
                            {showExplanation && (
                                <motion.div
                                    className="explanation-content"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                >
                                    <p>{currentQuestion.explanation}</p>
                                </motion.div>
                            )}
                        </div>
                    )}

                    {/* Next Button (non-arcade mode) */}
                    {!isArcadeMode && selectedAnswer !== null && (
                        <button className="next-button" onClick={() => advanceQuestion()}>
                            {currentIndex >= questions.length - 1 ? 'See Results' : 'Next Question'}
                            <ChevronRight size={20} />
                        </button>
                    )}
                </motion.div>
            </AnimatePresence>

            <style jsx>{`
                .trivia-game {
                    max-width: 700px;
                    margin: 0 auto;
                    padding: 20px;
                }

                .game-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                    gap: 20px;
                }

                .progress-info {
                    flex: 1;
                }

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

                .timer {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    color: #22c55e;
                    font-weight: 600;
                    min-width: 140px;
                }

                .timer.warning {
                    color: #ef4444;
                    animation: pulse 0.5s ease-in-out infinite alternate;
                }

                @keyframes pulse {
                    from { opacity: 1; }
                    to { opacity: 0.6; }
                }

                .timer-bar {
                    flex: 1;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .timer-fill {
                    height: 100%;
                    background: currentColor;
                    transition: width 1s linear;
                }

                .question-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 32px;
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
                    border-color: rgba(14, 165, 233, 0.5);
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

                .option-text {
                    flex: 1;
                }

                .result-icon {
                    flex-shrink: 0;
                }

                .result-icon.correct {
                    color: #22c55e;
                }

                .result-icon.incorrect {
                    color: #ef4444;
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

                .explanation-toggle:hover {
                    color: rgba(255, 255, 255, 0.9);
                }

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
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(14, 165, 233, 0.4);
                }
            `}</style>
        </div>
    );
}
