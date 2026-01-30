/* ═══════════════════════════════════════════════════════════════════════════
   POKER QUIZ — Test your poker knowledge and earn diamonds!
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
}

// Pre-loaded questions for instant start
const SAMPLE_QUESTIONS: QuizQuestion[] = [
    {
        id: '1',
        question: "What is the optimal 3-bet frequency from the Button vs a Cutoff open in 6-max?",
        options: ["5-8%", "10-12%", "15-18%", "22-25%"],
        correctIndex: 2,
        explanation: "The Button has position post-flop, so we can profitably 3-bet around 15-18% of hands vs a CO open, including both value hands and bluffs.",
        category: "Preflop",
        difficulty: "medium"
    },
    {
        id: '2',
        question: "You have AA on a K♠7♥2♦ rainbow board. What sizing should you c-bet?",
        options: ["25% pot", "33% pot", "66% pot", "100% pot"],
        correctIndex: 1,
        explanation: "On dry boards like K72r, a small sizing (33%) is optimal because villain's range is capped and we want to get called by worse hands.",
        category: "Postflop",
        difficulty: "medium"
    },
    {
        id: '3',
        question: "What is your approximate equity with a flush draw on the flop (all-in)?",
        options: ["25%", "35%", "45%", "55%"],
        correctIndex: 1,
        explanation: "A flush draw has 9 outs, giving roughly 35% equity to hit by the river (using the 4x rule for two cards to come).",
        category: "Math",
        difficulty: "easy"
    },
    {
        id: '4',
        question: "In ICM spots, which is generally more important?",
        options: ["Accumulating chips", "Avoiding elimination", "Maximum aggression", "Calling more widely"],
        correctIndex: 1,
        explanation: "ICM (Independent Chip Model) places extra value on tournament survival. Avoiding elimination is often more valuable than accumulating chips.",
        category: "Tournaments",
        difficulty: "medium"
    },
    {
        id: '5',
        question: "What percentage of hands should you defend from the Big Blind vs a Button min-raise?",
        options: ["30-35%", "40-45%", "55-60%", "70-75%"],
        correctIndex: 2,
        explanation: "Due to excellent pot odds (getting 3.5:1), the BB should defend around 55-60% of hands vs a button min-raise.",
        category: "Preflop",
        difficulty: "hard"
    },
    {
        id: '6',
        question: "What is a 'polarized' betting range?",
        options: ["Only value hands", "Only bluffs", "Very strong hands + bluffs", "Medium-strength hands"],
        correctIndex: 2,
        explanation: "A polarized range consists of very strong hands (value) and bluffs, with no medium-strength hands. This is common for large bet sizes.",
        category: "Theory",
        difficulty: "easy"
    },
    {
        id: '7',
        question: "On a A♠K♥Q♦ flop, who has the range advantage?",
        options: ["The preflop aggressor", "The caller", "Neither (equal)", "Depends on positions"],
        correctIndex: 0,
        explanation: "The preflop aggressor has more AK, AQ, KQ, AA, KK, QQ in their range, giving them a significant advantage on this board.",
        category: "Theory",
        difficulty: "medium"
    },
    {
        id: '8',
        question: "What's the pot odds formula?",
        options: ["Bet / Pot", "Bet / (Pot + Bet)", "Pot / Bet", "(Pot + Bet) / Bet"],
        correctIndex: 1,
        explanation: "Pot odds = Amount to call / (Current pot + Amount to call). This gives the percentage equity needed to break even on a call.",
        category: "Math",
        difficulty: "easy"
    }
];

interface PokerQuizProps {
    onClose?: () => void;
    onEarnDiamonds?: (amount: number) => void;
}

export function PokerQuiz({ onClose, onEarnDiamonds }: PokerQuizProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [questionsAnswered, setQuestionsAnswered] = useState(0);
    const [category, setCategory] = useState<string>('All');
    const [shuffledQuestions, setShuffledQuestions] = useState<QuizQuestion[]>([]);

    useEffect(() => {
        // Shuffle questions on mount
        const shuffled = [...SAMPLE_QUESTIONS].sort(() => Math.random() - 0.5);
        setShuffledQuestions(shuffled);
    }, []);

    const currentQuestion = shuffledQuestions[currentIndex];
    const categories = ['All', ...new Set(SAMPLE_QUESTIONS.map(q => q.category))];

    const handleAnswer = (index: number) => {
        if (showResult) return;

        setSelectedAnswer(index);
        setShowResult(true);
        setQuestionsAnswered(prev => prev + 1);

        const isCorrect = index === currentQuestion.correctIndex;
        if (isCorrect) {
            setScore(prev => prev + 1);
            setStreak(prev => prev + 1);
            // Award diamonds based on streak
            const diamonds = Math.min(streak + 1, 5);
            onEarnDiamonds?.(diamonds);
        } else {
            setStreak(0);
        }
    };

    const nextQuestion = () => {
        setSelectedAnswer(null);
        setShowResult(false);
        setCurrentIndex(prev => (prev + 1) % shuffledQuestions.length);
    };

    if (!currentQuestion) {
        return <div>Loading...</div>;
    }

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '450px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{
                        margin: 0,
                        color: '#FFD700',
                        fontSize: '14px',
                        fontWeight: 600
                    }}>
                        🧠 Poker Quiz
                    </h4>
                    <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: currentQuestion.difficulty === 'easy'
                            ? 'rgba(100, 255, 100, 0.2)'
                            : currentQuestion.difficulty === 'medium'
                                ? 'rgba(255, 200, 100, 0.2)'
                                : 'rgba(255, 100, 100, 0.2)',
                        color: currentQuestion.difficulty === 'easy'
                            ? '#4CAF50'
                            : currentQuestion.difficulty === 'medium'
                                ? '#FFA500'
                                : '#f44336',
                        borderRadius: '4px',
                        fontWeight: 600
                    }}>
                        {currentQuestion.difficulty.toUpperCase()}
                    </span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Stats */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '11px'
            }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Score: <strong style={{ color: '#FFD700' }}>{score}/{questionsAnswered}</strong>
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Streak: <strong style={{ color: streak >= 3 ? '#4CAF50' : '#FFD700' }}>
                        {streak > 0 ? `🔥 ${streak}` : '0'}
                    </strong>
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Category: <strong style={{ color: '#FFD700' }}>{currentQuestion.category}</strong>
                </span>
            </div>

            {/* Question */}
            <div style={{
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '12px'
            }}>
                <p style={{
                    margin: 0,
                    color: '#fff',
                    fontSize: '14px',
                    lineHeight: 1.5
                }}>
                    {currentQuestion.question}
                </p>
            </div>

            {/* Options */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '12px'
            }}>
                {currentQuestion.options.map((option, idx) => {
                    const isSelected = selectedAnswer === idx;
                    const isCorrect = idx === currentQuestion.correctIndex;
                    const showCorrect = showResult && isCorrect;
                    const showWrong = showResult && isSelected && !isCorrect;

                    return (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            disabled={showResult}
                            style={{
                                padding: '12px 16px',
                                background: showCorrect
                                    ? 'rgba(100, 255, 100, 0.2)'
                                    : showWrong
                                        ? 'rgba(255, 100, 100, 0.2)'
                                        : isSelected
                                            ? 'rgba(255, 215, 0, 0.2)'
                                            : 'rgba(255, 215, 0, 0.05)',
                                border: showCorrect
                                    ? '2px solid #4CAF50'
                                    : showWrong
                                        ? '2px solid #f44336'
                                        : isSelected
                                            ? '2px solid #FFD700'
                                            : '1px solid rgba(255, 215, 0, 0.2)',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '13px',
                                textAlign: 'left',
                                cursor: showResult ? 'default' : 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}
                        >
                            <span style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: showCorrect
                                    ? '#4CAF50'
                                    : showWrong
                                        ? '#f44336'
                                        : 'rgba(255, 215, 0, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: showCorrect || showWrong ? '#fff' : '#FFD700'
                            }}>
                                {showCorrect ? '✓' : showWrong ? '✗' : String.fromCharCode(65 + idx)}
                            </span>
                            {option}
                        </button>
                    );
                })}
            </div>

            {/* Explanation */}
            {showResult && (
                <div style={{
                    padding: '12px',
                    background: selectedAnswer === currentQuestion.correctIndex
                        ? 'rgba(100, 255, 100, 0.1)'
                        : 'rgba(255, 100, 100, 0.1)',
                    border: `1px solid ${selectedAnswer === currentQuestion.correctIndex ? 'rgba(100, 255, 100, 0.3)' : 'rgba(255, 100, 100, 0.3)'}`,
                    borderRadius: '8px',
                    marginBottom: '12px'
                }}>
                    <p style={{
                        margin: 0,
                        fontSize: '12px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: 1.5
                    }}>
                        <strong style={{
                            color: selectedAnswer === currentQuestion.correctIndex ? '#4CAF50' : '#f44336'
                        }}>
                            {selectedAnswer === currentQuestion.correctIndex ? '✓ Correct!' : '✗ Incorrect'}
                        </strong>
                        {' — '}
                        {currentQuestion.explanation}
                    </p>
                    {selectedAnswer === currentQuestion.correctIndex && streak > 0 && (
                        <p style={{
                            margin: '8px 0 0 0',
                            fontSize: '11px',
                            color: '#FFD700'
                        }}>
                            💎 +{Math.min(streak, 5)} Diamonds earned!
                        </p>
                    )}
                </div>
            )}

            {/* Next Button */}
            {showResult && (
                <button
                    onClick={nextQuestion}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#000',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    Next Question →
                </button>
            )}
        </div>
    );
}
