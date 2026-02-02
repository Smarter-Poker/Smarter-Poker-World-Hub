/* ═══════════════════════════════════════════════════════════════════════════
   DRILL MODE — Random poker spots for flashcard-style practice
   Generates random scenarios to quiz the player on GTO concepts
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react';

interface DrillModeProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface DrillScenario {
    id: string;
    category: string;
    situation: string;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
}

const DRILL_SCENARIOS: DrillScenario[] = [
    {
        id: '1',
        category: 'Preflop',
        situation: 'BTN opens 2.5x, you are in BB with A♠J♦',
        question: 'What is the GTO play?',
        options: ['Fold', 'Call', '3-bet small', '3-bet large'],
        correctAnswer: 1,
        explanation: 'AJo is primarily a call vs BTN open. It has good playability but not enough equity to 3-bet for value frequently.'
    },
    {
        id: '2',
        category: 'C-Bet',
        situation: 'You raised from CO, BB called. Flop: K♥7♣2♠',
        question: 'Optimal c-bet sizing?',
        options: ['Check', '1/3 pot', '2/3 pot', 'Pot'],
        correctAnswer: 1,
        explanation: 'On dry King-high boards, a small 33% c-bet is optimal. You can bet your entire range at this size.'
    },
    {
        id: '3',
        category: 'River',
        situation: 'You have Q♥Q♠ on A♣K♦7♥4♠2♣. Villain checks to you.',
        question: 'Should you value bet?',
        options: ['Check back', 'Bet 1/3 pot', 'Bet 2/3 pot', 'Bet pot'],
        correctAnswer: 0,
        explanation: 'QQ is a bluff-catcher here, not a value hand. The board heavily favors your opponent\'s calling range.'
    },
    {
        id: '4',
        category: '3-Bet Pots',
        situation: 'You 3-bet from SB with A♠K♠, BTN calls. Flop: J♥9♦4♣',
        question: 'What\'s your c-bet frequency here?',
        options: ['Never', 'Sometimes (25%)', 'Often (50%)', 'Always'],
        correctAnswer: 1,
        explanation: 'On low/mid disconnected boards, the 3-bettor should check frequently. AK has good equity but no made hand.'
    },
    {
        id: '5',
        category: 'Multiway',
        situation: '3-way pot. You have T♦T♣ on Q♠8♠7♦. First to act.',
        question: 'Optimal action?',
        options: ['Check', 'Bet 1/4 pot', 'Bet 1/2 pot', 'Bet 3/4 pot'],
        correctAnswer: 0,
        explanation: 'Multiway, overpairs need to check more often. The board is wet and you\'re out of position.'
    }
];

export function DrillMode({ onAskJarvis, onClose }: DrillModeProps) {
    const [currentDrill, setCurrentDrill] = useState<DrillScenario | null>(null);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [showExplanation, setShowExplanation] = useState(false);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [drillHistory, setDrillHistory] = useState<string[]>([]);

    const getRandomDrill = useCallback(() => {
        const available = DRILL_SCENARIOS.filter(d => !drillHistory.includes(d.id));
        if (available.length === 0) {
            setDrillHistory([]);
            const random = DRILL_SCENARIOS[Math.floor(Math.random() * DRILL_SCENARIOS.length)];
            setDrillHistory([random.id]);
            return random;
        }
        const random = available[Math.floor(Math.random() * available.length)];
        setDrillHistory([...drillHistory, random.id]);
        return random;
    }, [drillHistory]);

    const startDrill = () => {
        setCurrentDrill(getRandomDrill());
        setSelectedAnswer(null);
        setShowExplanation(false);
    };

    const submitAnswer = (index: number) => {
        if (selectedAnswer !== null || !currentDrill) return;

        setSelectedAnswer(index);
        setShowExplanation(true);

        const isCorrect = index === currentDrill.correctAnswer;
        setScore({
            correct: score.correct + (isCorrect ? 1 : 0),
            total: score.total + 1
        });
    };

    const askJarvisAboutDrill = () => {
        if (!currentDrill) return;
        onAskJarvis(`Explain in detail: ${currentDrill.situation}\n\nQuestion: ${currentDrill.question}\n\nWhy is "${currentDrill.options[currentDrill.correctAnswer]}" the correct answer?`);
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '380px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                        🎯 Drill Mode
                    </h4>
                    {score.total > 0 && (
                        <span style={{
                            padding: '2px 8px',
                            background: 'rgba(76, 175, 80, 0.2)',
                            borderRadius: '10px',
                            fontSize: '10px',
                            color: '#4CAF50'
                        }}>
                            {score.correct}/{score.total}
                        </span>
                    )}
                </div>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Drill Content */}
            {currentDrill ? (
                <>
                    {/* Category Badge */}
                    <div style={{
                        marginBottom: '12px',
                        padding: '4px 10px',
                        background: 'rgba(255, 215, 0, 0.1)',
                        borderRadius: '4px',
                        display: 'inline-block',
                        fontSize: '10px',
                        color: '#FFD700'
                    }}>
                        {currentDrill.category}
                    </div>

                    {/* Situation */}
                    <div style={{
                        padding: '12px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '8px',
                        marginBottom: '12px'
                    }}>
                        <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '6px' }}>
                            Situation:
                        </div>
                        <div style={{ fontSize: '12px', color: '#fff', lineHeight: 1.5 }}>
                            {currentDrill.situation}
                        </div>
                    </div>

                    {/* Question */}
                    <div style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#FFD700',
                        marginBottom: '12px',
                        textAlign: 'center'
                    }}>
                        {currentDrill.question}
                    </div>

                    {/* Options */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                        {currentDrill.options.map((option, i) => {
                            const isSelected = selectedAnswer === i;
                            const isCorrect = i === currentDrill.correctAnswer;
                            const showResult = selectedAnswer !== null;

                            return (
                                <button
                                    key={i}
                                    onClick={() => submitAnswer(i)}
                                    disabled={selectedAnswer !== null}
                                    style={{
                                        padding: '10px 14px',
                                        background: showResult
                                            ? isCorrect ? 'rgba(76, 175, 80, 0.3)' : isSelected ? 'rgba(244, 67, 54, 0.3)' : 'rgba(0, 0, 0, 0.2)'
                                            : 'rgba(0, 0, 0, 0.2)',
                                        border: showResult
                                            ? isCorrect ? '1px solid #4CAF50' : isSelected ? '1px solid #f44336' : '1px solid rgba(255, 255, 255, 0.1)'
                                            : '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontSize: '11px',
                                        textAlign: 'left',
                                        cursor: selectedAnswer !== null ? 'default' : 'pointer',
                                        opacity: showResult && !isCorrect && !isSelected ? 0.5 : 1
                                    }}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>

                    {/* Explanation */}
                    {showExplanation && (
                        <div style={{
                            padding: '12px',
                            background: 'rgba(76, 175, 80, 0.1)',
                            border: '1px solid rgba(76, 175, 80, 0.3)',
                            borderRadius: '8px',
                            marginBottom: '12px'
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: '#4CAF50', marginBottom: '4px' }}>
                                Explanation:
                            </div>
                            <div style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.5 }}>
                                {currentDrill.explanation}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={startDrill}
                            style={{
                                flex: 1,
                                padding: '10px',
                                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                border: 'none',
                                borderRadius: '8px',
                                color: '#000',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Next Drill
                        </button>
                        {showExplanation && (
                            <button
                                onClick={askJarvisAboutDrill}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    background: 'rgba(255, 215, 0, 0.2)',
                                    border: '1px solid rgba(255, 215, 0, 0.4)',
                                    borderRadius: '8px',
                                    color: '#FFD700',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Ask More
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎲</div>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '16px' }}>
                        Random GTO scenarios to test your skills
                    </p>
                    <button
                        onClick={startDrill}
                        style={{
                            padding: '12px 24px',
                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#000',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Start Drilling
                    </button>
                </div>
            )}
        </div>
    );
}
