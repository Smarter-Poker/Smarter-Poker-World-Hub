/**
 * MIXED CATEGORIES MODE - Category Rotation Endless
 * Route: /hub/trivia/mixed
 * 
 * Cycles through all 4 categories in rotation.
 * Shows which category each question is from.
 * Answer until you get one wrong.
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const CATEGORIES = [
    { id: 'poker_history', name: 'History', color: '#FFD700', emoji: '🏆' },
    { id: 'rule_knowledge', name: 'Rules', color: '#4a90d9', emoji: '📖' },
    { id: 'strategy', name: 'Strategy', color: '#9D4EDD', emoji: '🎓' },
    { id: 'player_profiles', name: 'Players', color: '#22c55e', emoji: '👤' }
];

export default function MixedCategoriesPage() {
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
    const [categoryStats, setCategoryStats] = useState({});

    const startTimeRef = useRef(null);

    // Calculate multiplier based on streak
    useEffect(() => {
        setMultiplier(Math.floor(streak / 5) + 1);
    }, [streak]);

    // Initialize
    useEffect(() => {
        async function init() {
            const user = getAuthUser();
            if (user) {
                setUserId(user.id);
                const { data } = await supabase
                    .from('endless_high_scores')
                    .select('high_score')
                    .eq('user_id', user.id)
                    .eq('mode', 'mixed')
                    .single();
                if (data) setHighScore(data.high_score || 0);
            }
            await loadMixedQuestions();
            setIsLoading(false);
        }
        init();
    }, []);

    // Load more questions when running low
    useEffect(() => {
        if (questions.length > 0 && currentIndex >= questions.length - 5) {
            loadMixedQuestions();
        }
    }, [currentIndex, questions.length]);

    async function loadMixedQuestions() {
        try {
            // Get questions from each category and interleave them
            const allQuestions = [];

            for (const cat of CATEGORIES) {
                const { data } = await supabase
                    .from('trivia_questions')
                    .select('*')
                    .eq('is_active', true)
                    .or(`category.eq.${cat.id},category.ilike.%${cat.name.toLowerCase()}%`)
                    .limit(15);

                if (data) {
                    // Tag each question with category info
                    data.forEach(q => {
                        q.categoryInfo = cat;
                    });
                    allQuestions.push(...data);
                }
            }

            // Shuffle all questions
            const shuffled = allQuestions.sort(() => Math.random() - 0.5);
            setQuestions(prev => [...prev, ...shuffled]);
        } catch (e) {
            console.error('Failed to load questions:', e);
            // Fallback: get any questions
            const { data } = await supabase
                .from('trivia_questions')
                .select('*')
                .eq('is_active', true)
                .limit(30);
            if (data) {
                const shuffled = data.sort(() => Math.random() - 0.5);
                shuffled.forEach(q => {
                    q.categoryInfo = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
                });
                setQuestions(prev => [...prev, ...shuffled]);
            }
        }
    }

    function startGame() {
        setGameState('playing');
        setStreak(0);
        setDiamondsEarned(0);
        setMultiplier(1);
        setCurrentIndex(0);
        setCategoryStats({});
        startTimeRef.current = Date.now();
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null) return;

        const currentQuestion = questions[currentIndex];
        const correct = index === currentQuestion?.correct_index;
        const catId = currentQuestion?.categoryInfo?.id || 'unknown';

        setSelectedAnswer(index);
        setShowResult(true);

        // Update category stats
        setCategoryStats(prev => ({
            ...prev,
            [catId]: {
                correct: (prev[catId]?.correct || 0) + (correct ? 1 : 0),
                total: (prev[catId]?.total || 0) + 1
            }
        }));

        if (correct) {
            const earned = multiplier;
            setDiamondsEarned(prev => prev + earned);
            setStreak(prev => prev + 1);

            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
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

            if (streak > highScore) {
                await supabase
                    .from('endless_high_scores')
                    .upsert({
                        user_id: userId,
                        mode: 'mixed',
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
        setCategoryStats({});
        startGame();
    }

    const currentQuestion = questions[currentIndex];
    const currentCat = currentQuestion?.categoryInfo || CATEGORIES[0];

    return (
        <>
            <Head>
                <title>Mixed Categories | Smarter.Poker</title>
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
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 0, 0, 0.3))',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            borderRadius: '12px',
                            marginBottom: '20px',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>🎲</span>
                                <span style={{ color: '#00D4FF', fontWeight: 'bold', fontSize: '18px' }}>MIXED CATEGORIES</span>
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
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎲</div>
                                <h1 style={{ color: 'white', fontSize: '28px', marginBottom: '12px' }}>
                                    Mixed Categories
                                </h1>
                                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '24px' }}>
                                    Questions from all 4 categories in rotation.<br />
                                    Test your knowledge across the board!
                                </p>

                                {/* Category Preview */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: '10px',
                                    marginBottom: '24px'
                                }}>
                                    {CATEGORIES.map(cat => (
                                        <div
                                            key={cat.id}
                                            style={{
                                                padding: '12px 8px',
                                                background: `${cat.color}15`,
                                                border: `1px solid ${cat.color}50`,
                                                borderRadius: '8px',
                                                textAlign: 'center'
                                            }}
                                        >
                                            <div style={{ fontSize: '20px' }}>{cat.emoji}</div>
                                            <div style={{ color: cat.color, fontSize: '11px', marginTop: '4px' }}>{cat.name}</div>
                                        </div>
                                    ))}
                                </div>

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

                                <button
                                    onClick={startGame}
                                    disabled={isLoading}
                                    style={{
                                        padding: '16px 48px',
                                        background: 'linear-gradient(135deg, #00D4FF, #0ea5e9)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        color: 'white',
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 20px rgba(0, 212, 255, 0.4)'
                                    }}
                                >
                                    {isLoading ? 'Loading...' : 'START MIXED MODE'}
                                </button>
                            </div>
                        )}

                        {/* Playing State */}
                        {gameState === 'playing' && currentQuestion && (
                            <>
                                {/* Category Indicator */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    marginBottom: '16px'
                                }}>
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 20px',
                                        background: `${currentCat.color}20`,
                                        border: `2px solid ${currentCat.color}`,
                                        borderRadius: '20px',
                                        color: currentCat.color,
                                        fontWeight: 'bold'
                                    }}>
                                        <span>{currentCat.emoji}</span>
                                        <span>{currentCat.name}</span>
                                    </div>
                                </div>

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
                                            background: currentCat.color,
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
                                    border: `1px solid ${currentCat.color}40`,
                                    borderRadius: '16px',
                                    padding: '32px'
                                }}>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px', textTransform: 'uppercase' }}>
                                        Question #{streak + 1}
                                    </div>

                                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', lineHeight: 1.4, margin: '0 0 24px 0' }}>
                                        {currentQuestion.question}
                                    </h2>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                                                        gap: '14px',
                                                        padding: '14px 18px',
                                                        background: bg,
                                                        border: `2px solid ${borderColor}`,
                                                        borderRadius: '10px',
                                                        color: 'rgba(255,255,255,0.9)',
                                                        fontSize: '15px',
                                                        textAlign: 'left',
                                                        cursor: selectedAnswer !== null ? 'default' : 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <span style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(255,255,255,0.1)',
                                                        borderRadius: '6px',
                                                        fontWeight: 700,
                                                        fontSize: '13px'
                                                    }}>
                                                        {String.fromCharCode(65 + index)}
                                                    </span>
                                                    <span style={{ flex: 1 }}>{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        marginTop: '24px',
                                        padding: '12px',
                                        background: `${currentCat.color}15`,
                                        border: `1px solid ${currentCat.color}30`,
                                        borderRadius: '8px',
                                        color: currentCat.color,
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

                                {/* Category Breakdown */}
                                <div style={{
                                    background: 'rgba(0,0,0,0.2)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginBottom: '12px', textTransform: 'uppercase' }}>
                                        Category Breakdown
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                        {CATEGORIES.map(cat => {
                                            const stats = categoryStats[cat.id] || { correct: 0, total: 0 };
                                            return (
                                                <div key={cat.id} style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: '16px' }}>{cat.emoji}</div>
                                                    <div style={{ color: cat.color, fontSize: '13px' }}>
                                                        {stats.correct}/{stats.total}
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                                            background: 'linear-gradient(135deg, #00D4FF, #0ea5e9)',
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
