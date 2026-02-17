/**
 * SURVIVAL MODE TRIVIA GAME - SELF-CONTAINED VERSION
 * No external imports except React to isolate React error #31
 */

import { useState, useEffect, useRef } from 'react';

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
    const currentQuestion = questions?.[currentIndex];

    // Inline diamond calculation
    const calculateSurvivalDiamonds = (streak) => {
        if (streak === 0) return 0;
        let total = 0;
        for (let i = 0; i < streak; i++) {
            total += Math.floor(i / 5) + 1;
        }
        return total;
    };

    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    useEffect(() => {
        if (questions && currentIndex >= questions.length - 3 && onLoadMoreQuestions) {
            onLoadMoreQuestions();
        }
    }, [currentIndex, questions?.length, onLoadMoreQuestions]);

    const selectAnswer = (index) => {
        if (selectedAnswer !== null) return;

        setSelectedAnswer(index);
        setShowResult(true);

        const correct = index === currentQuestion?.correct_index;
        const newAnswers = [...answers, index];
        setAnswers(newAnswers);

        if (correct) {
            setDiamondsEarned(prev => prev + multiplier);
            setStreak(prev => prev + 1);

            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
            }, 1000);
        } else {
            setIsGameOver(true);

            setTimeout(() => {
                const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
                onComplete({
                    answers: newAnswers,
                    correctCount: streak,
                    totalQuestions: streak + 1,
                    timeSpent,
                    diamondsEarned: calculateSurvivalDiamonds(streak),
                    streak,
                    multiplier
                });
            }, 2000);
        }
    };

    if (!currentQuestion && !isGameOver) {
        return (
            <div style={{ textAlign: 'center', padding: '48px', color: 'white' }}>
                <p>Loading Questions...</p>
            </div>
        );
    }

    if (isGameOver) {
        return (
            <div style={{ textAlign: 'center', padding: '48px', color: 'white', background: 'rgba(239, 68, 68, 0.2)', borderRadius: '16px', margin: '20px' }}>
                <h2 style={{ fontSize: '32px', color: '#ef4444', marginBottom: '24px' }}>GAME OVER</h2>
                <p style={{ fontSize: '24px', marginBottom: '8px' }}>Streak: {streak}</p>
                <p style={{ fontSize: '20px', color: '#00D4FF' }}>
                    Diamonds Earned: {calculateSurvivalDiamonds(streak)}
                </p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(0, 0, 0, 0.3))',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                marginBottom: '16px',
                color: 'white'
            }}>
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>SURVIVAL</span>
                <span style={{ color: '#fbbf24' }}>Streak: {streak}</span>
                <span style={{ color: '#00D4FF' }}>{diamondsEarned} diamonds</span>
            </div>

            {/* Multiplier Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '24px',
                color: 'white'
            }}>
                <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${((streak % 5) / 5) * 100}%`,
                        background: '#22c55e',
                        transition: 'width 0.3s'
                    }} />
                </div>
                <span style={{ fontWeight: 'bold' }}>{multiplier}x</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>{5 - (streak % 5)} to next</span>
            </div>

            {/* Question Card */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '32px'
            }}>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px', textTransform: 'uppercase' }}>
                    Question #{streak + 1}
                </div>

                <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 28px 0' }}>
                    {currentQuestion?.question}
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {currentQuestion?.options?.map((option, index) => {
                        let bg = 'rgba(255,255,255,0.05)';
                        let borderColor = 'rgba(255,255,255,0.1)';

                        if (showResult) {
                            if (index === currentQuestion.correct_index) {
                                bg = 'rgba(34, 197, 94, 0.15)';
                                borderColor = '#22c55e';
                            } else if (index === selectedAnswer) {
                                bg = 'rgba(239, 68, 68, 0.15)';
                                borderColor = '#ef4444';
                            }
                        }

                        return (
                            <button
                                key={index}
                                onClick={() => selectAnswer(index)}
                                disabled={selectedAnswer !== null}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    padding: '16px 20px',
                                    background: bg,
                                    border: `2px solid ${borderColor}`,
                                    borderRadius: '10px',
                                    color: 'rgba(255,255,255,0.9)',
                                    fontSize: '16px',
                                    textAlign: 'left',
                                    cursor: selectedAnswer !== null ? 'default' : 'pointer'
                                }}
                            >
                                <span style={{
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    fontSize: '14px'
                                }}>
                                    {String.fromCharCode(65 + index)}
                                </span>
                                <span style={{ flex: 1 }}>{option}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Reward Preview */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '24px',
                    padding: '12px',
                    background: 'rgba(0, 212, 255, 0.1)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#00D4FF',
                    fontSize: '13px'
                }}>
                    +{multiplier} diamonds for correct answer
                </div>
            </div>
        </div>
    );
}
