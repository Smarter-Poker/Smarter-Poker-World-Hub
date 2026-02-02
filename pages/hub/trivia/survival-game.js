/**
 * SURVIVAL MODE - Standalone Trivia Game Page
 * Route: /hub/trivia/survival-game
 * Endless questions until you get one wrong, with stacking multipliers
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { TRIVIA_MODES, calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';

export default function SurvivalGamePage() {
    const router = useRouter();

    const [gameState, setGameState] = useState('ready'); // ready, playing, gameover
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [streak, setStreak] = useState(0);
    const [diamondsEarned, setDiamondsEarned] = useState(0);
    const [multiplier, setMultiplier] = useState(1);
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const startTimeRef = useRef(null);

    // Calculate multiplier based on streak (increases every 5 questions)
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // Initialize game
    useEffect(() => {
        async function init() {
            const user = getAuthUser();
            if (user) {
                setUserId(user.id);
            }
            await loadMoreQuestions();
            setIsLoading(false);
        }
        init();
    }, []);

    // Load more questions when running low
    useEffect(() => {
        if (questions.length > 0 && currentIndex >= questions.length - 3) {
            loadMoreQuestions();
        }
    }, [currentIndex, questions.length]);

    async function loadMoreQuestions() {
        try {
            const { data, error } = await supabase
                .from('trivia_questions')
                .select('*')
                .eq('is_active', true)
                .order('id', { ascending: false })
                .limit(20);

            if (!error && data) {
                // Shuffle the questions
                const shuffled = data.sort(() => Math.random() - 0.5);
                setQuestions(prev => [...prev, ...shuffled]);
            }
        } catch (e) {
            console.error('Failed to load questions:', e);
        }
    }

    function startGame() {
        setGameState('playing');
        setStreak(0);
        setDiamondsEarned(0);
        setMultiplier(1);
        setCurrentIndex(0);
        startTimeRef.current = Date.now();
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null) return;

        const currentQuestion = questions[currentIndex];
        const correct = index === currentQuestion?.correct_index;

        setSelectedAnswer(index);
        setShowResult(true);

        if (correct) {
            // Award diamonds based on multiplier
            setDiamondsEarned(prev => prev + multiplier);
            setStreak(prev => prev + 1);

            // Auto-advance after showing result
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
            }, 1000);
        } else {
            // Game Over
            setTimeout(() => {
                setGameState('gameover');
                saveGameResult();
            }, 1500);
        }
    }

    async function saveGameResult() {
        if (!userId) return;

        const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const finalDiamonds = calculateDiamonds('survival', streak, streak + 1, 0);

        try {
            // Update user diamonds
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .single();

            if (profile) {
                await supabase
                    .from('profiles')
                    .update({ diamonds: (profile.diamonds || 0) + finalDiamonds })
                    .eq('id', userId);
            }

            // Save to trivia history
            await supabase.from('trivia_history').insert({
                user_id: userId,
                mode: 'survival',
                score: streak,
                total_questions: streak + 1,
                time_spent: timeSpent,
                diamonds_earned: finalDiamonds,
                completed_at: new Date().toISOString()
            });
        } catch (e) {
            console.error('Failed to save game result:', e);
        }
    }

    function playAgain() {
        setQuestions(prev => prev.slice(currentIndex).sort(() => Math.random() - 0.5));
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setShowResult(false);
        startGame();
    }

    const currentQuestion = questions[currentIndex];

    return (
        <>
            <Head>
                <title>Survival Mode | Smarter.Poker</title>
            </Head>

            <UniversalHeader />

            <PageTransition>
                <div style={{
                    minHeight: '100vh',
                    background: 'linear-gradient(180deg, #0a1929 0%, #0d2137 100%)',
                    padding: '20px'
                }}>
                    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(0, 0, 0, 0.3))',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '12px',
                            marginBottom: '20px',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>❤️</span>
                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '18px' }}>SURVIVAL MODE</span>
                            </div>
                            {gameState !== 'ready' && (
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <span style={{ color: '#fbbf24' }}>🔥 {streak}</span>
                                    <span style={{ color: '#00D4FF' }}>💎 {diamondsEarned}</span>
                                    <span style={{ color: '#22c55e' }}>{multiplier}x</span>
                                </div>
                            )}
                        </div>

                        {/* Ready State */}
                        {gameState === 'ready' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>⚔️</div>
                                <h1 style={{ color: 'white', fontSize: '28px', marginBottom: '12px' }}>
                                    Survival Mode
                                </h1>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>
                                    Answer questions until you get one wrong.<br />
                                    Earn diamonds for every correct answer!
                                </p>
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{ color: '#00D4FF', fontWeight: 'bold', marginBottom: '8px' }}>
                                        Multiplier System
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
                                        Every 5 correct answers increases your multiplier!<br />
                                        1x → 2x → 3x → 4x → 5x...
                                    </div>
                                </div>
                                <button
                                    onClick={startGame}
                                    disabled={isLoading}
                                    style={{
                                        padding: '16px 48px',
                                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4)'
                                    }}
                                >
                                    {isLoading ? 'Loading...' : 'START SURVIVAL'}
                                </button>
                            </div>
                        )}

                        {/* Playing State */}
                        {gameState === 'playing' && currentQuestion && (
                            <>
                                {/* Multiplier Progress */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 16px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    borderRadius: '8px',
                                    marginBottom: '20px'
                                }}>
                                    <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${((streak % 5) / 5) * 100}%`,
                                            background: '#22c55e',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                                        {5 - (streak % 5)} to {multiplier + 1}x
                                    </span>
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
                                        {currentQuestion.question}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {currentQuestion.options?.map((option, index) => {
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
                                                        cursor: selectedAnswer !== null ? 'default' : 'pointer',
                                                        transition: 'all 0.2s'
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
                                                    {showResult && index === currentQuestion.correct_index && (
                                                        <span style={{ color: '#22c55e' }}>✓</span>
                                                    )}
                                                    {showResult && index === selectedAnswer && index !== currentQuestion.correct_index && (
                                                        <span style={{ color: '#ef4444' }}>✗</span>
                                                    )}
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
                                        💎 +{multiplier} diamonds for correct answer
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Game Over State */}
                        {gameState === 'gameover' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>💀</div>
                                <h2 style={{ color: '#ef4444', fontSize: '32px', marginBottom: '24px' }}>
                                    GAME OVER
                                </h2>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '20px',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{
                                        background: 'rgba(251, 191, 36, 0.1)',
                                        border: '1px solid rgba(251, 191, 36, 0.3)',
                                        borderRadius: '12px',
                                        padding: '20px'
                                    }}>
                                        <div style={{ fontSize: '36px', color: '#fbbf24', fontWeight: 'bold' }}>
                                            {streak}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                            Questions Answered
                                        </div>
                                    </div>
                                    <div style={{
                                        background: 'rgba(0, 212, 255, 0.1)',
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        borderRadius: '12px',
                                        padding: '20px'
                                    }}>
                                        <div style={{ fontSize: '36px', color: '#00D4FF', fontWeight: 'bold' }}>
                                            {calculateDiamonds('survival', streak, streak + 1, 0)}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                            💎 Diamonds Earned
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={playAgain}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                            border: 'none',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Play Again
                                    </button>
                                    <button
                                        onClick={() => router.push('/hub/trivia')}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Back to Trivia
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
