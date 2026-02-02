/**
 * ENDLESS MODE - All Categories Random
 * Route: /hub/trivia/endless
 * 
 * Endless questions from ALL categories combined randomly.
 * Answer until you get one wrong. Diamonds stack with streak multipliers.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function EndlessModePage() {
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
    const [highScore, setHighScore] = useState(0);

    // 50/50 Lifeline State
    const [fiftyFiftyUsedFree, setFiftyFiftyUsedFree] = useState(false); // One free per game
    const [eliminatedOptions, setEliminatedOptions] = useState([]);
    const [userDiamonds, setUserDiamonds] = useState(0);

    // Skip Question Lifeline state (3💎 each use)
    const [skipUsedThisQuestion, setSkipUsedThisQuestion] = useState(false);

    // Double Chance Lifeline state (3💎 - get 2 attempts)
    const [doubleChanceActive, setDoubleChanceActive] = useState(false);
    const [doubleChanceUsedThisQuestion, setDoubleChanceUsedThisQuestion] = useState(false);
    const [firstAttemptWrong, setFirstAttemptWrong] = useState(null);

    const startTimeRef = useRef(null);

    // Calculate multiplier based on streak (increases every 5 questions)
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // Initialize
    useEffect(() => {
        async function init() {
            const user = getAuthUser();
            if (user) {
                setUserId(user.id);
                // Load high score (ignore errors - table may not exist)
                try {
                    const { data } = await supabase
                        .from('endless_high_scores')
                        .select('high_score')
                        .eq('user_id', user.id)
                        .eq('mode', 'random')
                        .single();
                    if (data) setHighScore(data.high_score || 0);
                } catch (e) {
                    // High score table may not exist yet
                }
                // Load user diamonds
                try {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', user.id)
                        .single();
                    if (profile) setUserDiamonds(profile.diamonds || 0);
                } catch (e) {
                    console.error('Failed to load diamonds:', e);
                }
            }
            await loadMoreQuestions();
            setIsLoading(false);
        }
        init();
    }, []);

    // Load more questions when running low
    useEffect(() => {
        if (questions.length > 0 && currentIndex >= questions.length - 5) {
            loadMoreQuestions();
        }
    }, [currentIndex, questions.length]);

    async function loadMoreQuestions() {
        try {
            // Get ALL questions from ALL categories
            const { data, error } = await supabase
                .from('trivia_questions')
                .select('*')
                .order('id', { ascending: false })
                .limit(50);

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
        // Reset all lifeline states for new game
        setFiftyFiftyUsedFree(false);
        setEliminatedOptions([]);
        setSkipUsedThisQuestion(false);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
        startTimeRef.current = Date.now();
    }

    // 50/50 Lifeline Function
    async function useFiftyFifty() {
        if (eliminatedOptions.length > 0 || showResult) return; // Already used on this question

        const currentQ = questions[currentIndex];
        if (!currentQ) return;

        const needsToPay = fiftyFiftyUsedFree;

        if (needsToPay) {
            if (userDiamonds < 5) {
                alert('Not enough diamonds! You need 5💎 for an additional 50/50.');
                return;
            }
            // Deduct diamonds
            if (userId) {
                try {
                    await supabase
                        .from('profiles')
                        .update({ diamonds: userDiamonds - 5 })
                        .eq('id', userId);
                    setUserDiamonds(prev => prev - 5);
                } catch (e) {
                    console.error('Failed to deduct diamonds:', e);
                    return;
                }
            }
        } else {
            setFiftyFiftyUsedFree(true);
        }

        // Find wrong answer indices
        const wrongIndices = currentQ.options
            .map((_, idx) => idx)
            .filter(idx => idx !== currentQ.correct_index);

        // Randomly select 2 to eliminate
        const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
        const toEliminate = shuffled.slice(0, 2);
        setEliminatedOptions(toEliminate);
    }

    // Skip Question Function (costs 3💎)
    async function useSkipQuestion() {
        if (showResult || skipUsedThisQuestion) return;

        if (userDiamonds < 3) {
            alert('Not enough diamonds! You need 3💎 to skip.');
            return;
        }

        // Deduct diamonds
        if (userId) {
            try {
                await supabase
                    .from('profiles')
                    .update({ diamonds: userDiamonds - 3 })
                    .eq('id', userId);
                setUserDiamonds(prev => prev - 3);
            } catch (e) {
                console.error('Failed to deduct diamonds:', e);
                return;
            }
        }

        setSkipUsedThisQuestion(true);

        // Move to next question without penalty (keep streak)
        setCurrentIndex(prev => prev + 1);
        setSelectedAnswer(null);
        setShowResult(false);
        setEliminatedOptions([]);
        setSkipUsedThisQuestion(false);
        setDoubleChanceActive(false);
        setDoubleChanceUsedThisQuestion(false);
        setFirstAttemptWrong(null);
    }

    // Double Chance Function (costs 3💎 - gives 2 attempts)
    async function useDoubleChance() {
        if (showResult || doubleChanceUsedThisQuestion || doubleChanceActive) return;

        if (userDiamonds < 3) {
            alert('Not enough diamonds! You need 3💎 for Double Chance.');
            return;
        }

        // Deduct diamonds
        if (userId) {
            try {
                await supabase
                    .from('profiles')
                    .update({ diamonds: userDiamonds - 3 })
                    .eq('id', userId);
                setUserDiamonds(prev => prev - 3);
            } catch (e) {
                console.error('Failed to deduct diamonds:', e);
                return;
            }
        }

        setDoubleChanceActive(true);
        setDoubleChanceUsedThisQuestion(true);
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null) return;

        // If Double Chance active and this is first attempt
        if (doubleChanceActive && firstAttemptWrong === null) {
            const currentQuestion = questions[currentIndex];
            const correct = index === currentQuestion?.correct_index;

            if (!correct) {
                // First wrong attempt - allow second try
                setFirstAttemptWrong(index);
                return; // Don't show result yet, let them try again
            }
        }

        const currentQuestion = questions[currentIndex];
        const correct = index === currentQuestion?.correct_index;

        setSelectedAnswer(index);
        setShowResult(true);

        if (correct) {
            const earned = multiplier;
            setDiamondsEarned(prev => prev + earned);
            setStreak(prev => prev + 1);

            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
                setEliminatedOptions([]);
                setSkipUsedThisQuestion(false);
                setDoubleChanceActive(false);
                setDoubleChanceUsedThisQuestion(false);
                setFirstAttemptWrong(null);
            }, 1000);
        } else {
            setTimeout(() => {
                setGameState('gameover');
                saveGameResult();
            }, 1500);
        }
    }

    async function saveGameResult() {
        if (!userId) return;

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
                    .update({ diamonds: (profile.diamonds || 0) + diamondsEarned })
                    .eq('id', userId);
            }

            // Update high score if beaten
            if (streak > highScore) {
                await supabase
                    .from('endless_high_scores')
                    .upsert({
                        user_id: userId,
                        mode: 'random',
                        high_score: streak,
                        achieved_at: new Date().toISOString()
                    }, { onConflict: 'user_id,mode' });
                setHighScore(streak);
            }
        } catch (e) {
            console.error('Failed to save:', e);
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
                <title>Endless Mode | Smarter.Poker</title>
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
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(0, 0, 0, 0.3))',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '12px',
                            marginBottom: '20px',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>∞</span>
                                <span style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '18px' }}>ENDLESS MODE</span>
                            </div>
                            {gameState !== 'ready' && (
                                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
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
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>∞</div>
                                <h1 style={{ color: 'white', fontSize: '28px', marginBottom: '12px' }}>
                                    Endless Mode
                                </h1>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>
                                    All trivia questions, completely random.<br />
                                    Answer until you miss!
                                </p>

                                {highScore > 0 && (
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '12px 24px',
                                        background: 'rgba(234, 179, 8, 0.1)',
                                        border: '1px solid rgba(234, 179, 8, 0.3)',
                                        borderRadius: '8px',
                                        color: '#eab308',
                                        marginBottom: '24px'
                                    }}>
                                        🏆 Your Best: {highScore} streak
                                    </div>
                                )}

                                <div style={{
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{ color: '#8b5cf6', fontWeight: 'bold', marginBottom: '8px' }}>
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
                                        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)'
                                    }}
                                >
                                    {isLoading ? 'Loading...' : 'START ENDLESS'}
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
                                            background: '#8b5cf6',
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
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        color: 'rgba(255,255,255,0.5)',
                                        marginBottom: '16px',
                                        textTransform: 'uppercase'
                                    }}>
                                        <span>Question #{streak + 1}</span>
                                        <span style={{ color: '#8b5cf6' }}>{currentQuestion.category || 'Mixed'}</span>
                                    </div>

                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 24px 0' }}>
                                        {currentQuestion.question}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {currentQuestion.options?.map((option, index) => {
                                            const isEliminated = eliminatedOptions.includes(index);
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
                                                    disabled={selectedAnswer !== null || isEliminated}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '14px',
                                                        padding: '14px 18px',
                                                        background: bg,
                                                        border: `2px solid ${borderColor}`,
                                                        borderRadius: '10px',
                                                        color: isEliminated ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)',
                                                        fontSize: '15px',
                                                        textAlign: 'left',
                                                        cursor: (selectedAnswer !== null || isEliminated) ? 'default' : 'pointer',
                                                        transition: 'all 0.2s',
                                                        textDecoration: isEliminated ? 'line-through' : 'none',
                                                        opacity: isEliminated ? 0.5 : 1
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: isEliminated ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '13px',
                                                        color: isEliminated ? '#ef4444' : 'inherit'
                                                    }}>
                                                        {isEliminated ? '✗' : String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span style={{ flex: 1 }}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Lifeline Buttons Row */}
                                    {!showResult && (
                                        <div style={{
                                            display: 'flex',
                                            gap: '10px',
                                            marginTop: '16px'
                                        }}>
                                            {/* 50/50 Button */}
                                            <button
                                                onClick={useFiftyFifty}
                                                disabled={eliminatedOptions.length > 0}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: eliminatedOptions.length > 0
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : fiftyFiftyUsedFree
                                                            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 150, 200, 0.3))'
                                                            : 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(20, 150, 80, 0.3))',
                                                    border: `2px solid ${eliminatedOptions.length > 0
                                                        ? '#666'
                                                        : fiftyFiftyUsedFree
                                                            ? '#00D4FF'
                                                            : '#22c55e'}`,
                                                    borderRadius: '12px',
                                                    color: eliminatedOptions.length > 0 ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: eliminatedOptions.length > 0 ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>⚡</span>
                                                <span>50/50</span>
                                                {eliminatedOptions.length > 0 ? (
                                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>USED</span>
                                                ) : fiftyFiftyUsedFree ? (
                                                    <span style={{ fontSize: '11px', color: '#00D4FF' }}>5💎</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>FREE</span>
                                                )}
                                            </button>

                                            {/* Skip Question Button */}
                                            <button
                                                onClick={useSkipQuestion}
                                                disabled={userDiamonds < 3}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: userDiamonds < 3
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(200, 150, 30, 0.3))',
                                                    border: `2px solid ${userDiamonds < 3 ? '#666' : '#fbbf24'}`,
                                                    borderRadius: '12px',
                                                    color: userDiamonds < 3 ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: userDiamonds < 3 ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>⏭️</span>
                                                <span>Skip</span>
                                                <span style={{ fontSize: '11px', color: '#fbbf24' }}>3💎</span>
                                            </button>

                                            {/* Double Chance Button */}
                                            <button
                                                onClick={useDoubleChance}
                                                disabled={doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < 3}
                                                style={{
                                                    flex: 1,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px',
                                                    padding: '12px 8px',
                                                    background: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < 3)
                                                        ? 'rgba(100, 100, 100, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(120, 60, 180, 0.3))',
                                                    border: `2px solid ${(doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < 3) ? '#666' : '#a855f7'}`,
                                                    borderRadius: '12px',
                                                    color: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < 3) ? '#666' : 'white',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (doubleChanceUsedThisQuestion || doubleChanceActive || userDiamonds < 3) ? 'default' : 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <span style={{ fontSize: '20px' }}>🎯</span>
                                                <span>2x Try</span>
                                                {doubleChanceActive ? (
                                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>ACTIVE</span>
                                                ) : doubleChanceUsedThisQuestion ? (
                                                    <span style={{ fontSize: '11px', opacity: 0.7 }}>USED</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#a855f7' }}>3💎</span>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        marginTop: '24px',
                                        padding: '12px',
                                        background: 'rgba(139, 92, 246, 0.1)',
                                        border: '1px solid rgba(139, 92, 246, 0.2)',
                                        borderRadius: '8px',
                                        color: '#8b5cf6',
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
                                            Streak
                                        </div>
                                    </div>
                                    <div style={{
                                        background: 'rgba(0, 212, 255, 0.1)',
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        borderRadius: '12px',
                                        padding: '20px'
                                    }}>
                                        <div style={{ fontSize: '36px', color: '#00D4FF', fontWeight: 'bold' }}>
                                            {diamondsEarned}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                                            💎 Earned
                                        </div>
                                    </div>
                                </div>

                                {streak >= highScore && streak > 0 && (
                                    <div style={{
                                        padding: '12px 24px',
                                        background: 'rgba(234, 179, 8, 0.1)',
                                        border: '1px solid rgba(234, 179, 8, 0.3)',
                                        borderRadius: '8px',
                                        color: '#eab308',
                                        marginBottom: '24px'
                                    }}>
                                        🎉 NEW HIGH SCORE!
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={playAgain}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
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
