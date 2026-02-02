/**
 * SURVIVAL MODE - 10 Level Progressive Trivia Game
 * Route: /hub/trivia/survival-game
 * 
 * System:
 * - 10 Levels, 20 questions each
 * - Level 1: 85% accuracy (17/20 correct)
 * - Each level adds 2% until Level 8: 99% (20/20 - can miss 0)
 * - Levels 9-10: 100% accuracy required (20/20)
 * - Increasing difficulty as levels progress
 */

import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { calculateDiamonds } from '../../../src/lib/trivia/triviaEngine';

// Level configuration: 10 levels, starting at 85%, +2% per level
const LEVEL_CONFIG = [
    { level: 1, accuracyRequired: 85, minCorrect: 17, difficulty: 'easy' },
    { level: 2, accuracyRequired: 87, minCorrect: 18, difficulty: 'easy' },
    { level: 3, accuracyRequired: 89, minCorrect: 18, difficulty: 'medium' },
    { level: 4, accuracyRequired: 91, minCorrect: 19, difficulty: 'medium' },
    { level: 5, accuracyRequired: 93, minCorrect: 19, difficulty: 'medium' },
    { level: 6, accuracyRequired: 95, minCorrect: 19, difficulty: 'hard' },
    { level: 7, accuracyRequired: 97, minCorrect: 20, difficulty: 'hard' },
    { level: 8, accuracyRequired: 99, minCorrect: 20, difficulty: 'hard' },
    { level: 9, accuracyRequired: 100, minCorrect: 20, difficulty: 'hard' },
    { level: 10, accuracyRequired: 100, minCorrect: 20, difficulty: 'hard' }
];

const QUESTIONS_PER_LEVEL = 20;

export default function SurvivalGamePage() {
    const router = useRouter();

    // Game state
    const [gameState, setGameState] = useState('lobby'); // lobby, playing, levelComplete, gameOver, victory
    const [currentLevel, setCurrentLevel] = useState(1);
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [incorrectCount, setIncorrectCount] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [totalDiamondsEarned, setTotalDiamondsEarned] = useState(0);

    // User state
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [userProgress, setUserProgress] = useState({ highestLevel: 0 });

    const startTimeRef = useRef(null);

    // Initialize
    useEffect(() => {
        const user = getAuthUser();
        if (user) {
            setUserId(user.id);
            loadUserProgress(user.id);
        }
    }, []);

    async function loadUserProgress(uid) {
        try {
            const { data } = await supabase
                .from('survival_progress')
                .select('highest_level, last_played')
                .eq('user_id', uid)
                .single();
            if (data) {
                setUserProgress({ highestLevel: data.highest_level || 0 });
            }
        } catch (e) {
            // No progress yet, that's fine
        }
    }

    async function loadQuestionsForLevel(level) {
        setIsLoading(true);
        const config = LEVEL_CONFIG[level - 1];

        try {
            // Get questions with appropriate difficulty
            let query = supabase
                .from('trivia_questions')
                .select('*')
                .eq('is_active', true);

            // Filter by difficulty for higher levels
            if (config.difficulty === 'hard') {
                query = query.in('difficulty', ['hard', 'medium']);
            } else if (config.difficulty === 'medium') {
                query = query.in('difficulty', ['medium', 'easy']);
            }

            const { data, error } = await query.limit(100);

            if (!error && data && data.length >= QUESTIONS_PER_LEVEL) {
                // Shuffle and take 20
                const shuffled = data.sort(() => Math.random() - 0.5).slice(0, QUESTIONS_PER_LEVEL);
                setQuestions(shuffled);
            } else {
                // Fallback: get any questions
                const { data: fallbackData } = await supabase
                    .from('trivia_questions')
                    .select('*')
                    .eq('is_active', true)
                    .limit(QUESTIONS_PER_LEVEL);

                if (fallbackData) {
                    setQuestions(fallbackData.sort(() => Math.random() - 0.5));
                }
            }
        } catch (e) {
            console.error('Failed to load questions:', e);
        }
        setIsLoading(false);
    }

    function startLevel(level) {
        setCurrentLevel(level);
        setCurrentQuestionIndex(0);
        setCorrectCount(0);
        setIncorrectCount(0);
        setSelectedAnswer(null);
        setShowResult(false);
        loadQuestionsForLevel(level);
        setGameState('playing');
        startTimeRef.current = Date.now();
    }

    function selectAnswer(index) {
        if (selectedAnswer !== null || showResult) return;

        const currentQuestion = questions[currentQuestionIndex];
        const isCorrect = index === currentQuestion?.correct_index;

        setSelectedAnswer(index);
        setShowResult(true);

        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
        } else {
            setIncorrectCount(prev => prev + 1);
        }

        // Check if this ends the level early (too many wrong)
        const config = LEVEL_CONFIG[currentLevel - 1];
        const remainingQuestions = QUESTIONS_PER_LEVEL - currentQuestionIndex - 1;
        const maxPossibleCorrect = correctCount + (isCorrect ? 1 : 0) + remainingQuestions;

        // Auto advance after delay
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= QUESTIONS_PER_LEVEL) {
                // Level complete - check if passed
                const finalCorrect = correctCount + (isCorrect ? 1 : 0);
                evaluateLevelResult(finalCorrect);
            } else if (maxPossibleCorrect < config.minCorrect) {
                // Can't possibly pass - game over
                setGameState('gameOver');
            } else {
                // Next question
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedAnswer(null);
                setShowResult(false);
            }
        }, 1200);
    }

    function evaluateLevelResult(finalCorrect) {
        const config = LEVEL_CONFIG[currentLevel - 1];
        const passed = finalCorrect >= config.minCorrect;

        if (passed) {
            // Award diamonds for this level
            const diamonds = currentLevel * 2; // 2, 4, 6, 8, 10, 12, 14, 16, 18, 20 diamonds per level
            setTotalDiamondsEarned(prev => prev + diamonds);

            if (currentLevel >= 10) {
                // Victory!
                setGameState('victory');
                saveProgress(10, totalDiamondsEarned + diamonds);
            } else {
                setGameState('levelComplete');
                saveProgress(currentLevel, totalDiamondsEarned + diamonds);
            }
        } else {
            setGameState('gameOver');
        }
    }

    async function saveProgress(level, diamonds) {
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
                    .update({ diamonds: (profile.diamonds || 0) + diamonds })
                    .eq('id', userId);
            }

            // Upsert survival progress
            await supabase
                .from('survival_progress')
                .upsert({
                    user_id: userId,
                    highest_level: Math.max(level, userProgress.highestLevel),
                    last_played: new Date().toISOString()
                }, { onConflict: 'user_id' });

            setUserProgress(prev => ({
                ...prev,
                highestLevel: Math.max(level, prev.highestLevel)
            }));
        } catch (e) {
            console.error('Failed to save progress:', e);
        }
    }

    function continueToNextLevel() {
        startLevel(currentLevel + 1);
    }

    function restartFromLevel(level) {
        setTotalDiamondsEarned(0);
        startLevel(level);
    }

    function backToLobby() {
        router.push('/hub/trivia');
    }

    const currentQuestion = questions[currentQuestionIndex];
    const config = LEVEL_CONFIG[currentLevel - 1];
    const progressPercent = ((currentQuestionIndex + 1) / QUESTIONS_PER_LEVEL) * 100;

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
                                <span style={{ fontSize: '24px' }}>🎯</span>
                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '18px' }}>SURVIVAL MODE</span>
                            </div>
                            {gameState === 'playing' && (
                                <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                                    <span style={{ color: '#fbbf24' }}>Level {currentLevel}</span>
                                    <span style={{ color: '#22c55e' }}>✓ {correctCount}</span>
                                    <span style={{ color: '#ef4444' }}>✗ {incorrectCount}</span>
                                    <span style={{ color: '#00D4FF' }}>💎 {totalDiamondsEarned}</span>
                                </div>
                            )}
                        </div>

                        {/* Lobby State - Level Select */}
                        {gameState === 'lobby' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '16px',
                                padding: '32px'
                            }}>
                                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚔️</div>
                                    <h1 style={{ color: 'white', fontSize: '28px', margin: '0 0 8px 0' }}>Survival Mode</h1>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                                        10 Levels • 20 Questions Each • Increasing Difficulty
                                    </p>
                                </div>

                                {/* Progress Info */}
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    marginBottom: '24px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ color: '#00D4FF', fontSize: '14px', marginBottom: '8px' }}>
                                        Accuracy Required Per Level
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
                                        Lvl 1: 85% → Lvl 5: 93% → Lvl 8: 99% → Lvls 9-10: 100%
                                    </div>
                                    {userProgress.highestLevel > 0 && (
                                        <div style={{ marginTop: '12px', color: '#22c55e' }}>
                                            🏆 Your Best: Level {userProgress.highestLevel}
                                        </div>
                                    )}
                                </div>

                                {/* Level Grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: '10px',
                                    marginBottom: '24px'
                                }}>
                                    {LEVEL_CONFIG.map((lvl) => {
                                        const isUnlocked = lvl.level <= userProgress.highestLevel + 1;
                                        const isCompleted = lvl.level <= userProgress.highestLevel;

                                        return (
                                            <button
                                                key={lvl.level}
                                                onClick={() => isUnlocked && startLevel(lvl.level)}
                                                disabled={!isUnlocked}
                                                style={{
                                                    padding: '16px 12px',
                                                    background: isCompleted
                                                        ? 'rgba(34, 197, 94, 0.2)'
                                                        : isUnlocked
                                                            ? 'rgba(239, 68, 68, 0.2)'
                                                            : 'rgba(100, 100, 100, 0.2)',
                                                    border: `2px solid ${isCompleted ? '#22c55e' : isUnlocked ? '#ef4444' : '#444'}`,
                                                    borderRadius: '10px',
                                                    color: isUnlocked ? 'white' : '#666',
                                                    cursor: isUnlocked ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                                                    {isCompleted ? '✓' : isUnlocked ? lvl.level : '🔒'}
                                                </div>
                                                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                                                    {lvl.accuracyRequired}%
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => startLevel(Math.min(userProgress.highestLevel + 1, 10))}
                                    disabled={isLoading}
                                    style={{
                                        width: '100%',
                                        padding: '16px',
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
                                    {isLoading ? 'Loading...' : userProgress.highestLevel > 0
                                        ? `CONTINUE FROM LEVEL ${Math.min(userProgress.highestLevel + 1, 10)}`
                                        : 'START LEVEL 1'}
                                </button>
                            </div>
                        )}

                        {/* Playing State */}
                        {gameState === 'playing' && currentQuestion && (
                            <>
                                {/* Progress Bar */}
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
                                            width: `${progressPercent}%`,
                                            background: '#ef4444',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '14px', minWidth: '60px' }}>
                                        {currentQuestionIndex + 1} / {QUESTIONS_PER_LEVEL}
                                    </span>
                                </div>

                                {/* Accuracy Threshold Indicator */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: '16px',
                                    marginBottom: '16px',
                                    fontSize: '13px'
                                }}>
                                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        Required: {config.minCorrect}/{QUESTIONS_PER_LEVEL} correct ({config.accuracyRequired}%)
                                    </span>
                                    <span style={{
                                        color: correctCount >= config.minCorrect ? '#22c55e' :
                                            incorrectCount > (QUESTIONS_PER_LEVEL - config.minCorrect) ? '#ef4444' : '#fbbf24'
                                    }}>
                                        Current: {correctCount}/{currentQuestionIndex + (showResult ? 1 : 0)}
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
                                        Level {currentLevel} • Question {currentQuestionIndex + 1}
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
                                                    bg = 'rgba(34, 197, 94, 0.2)';
                                                    borderColor = '#22c55e';
                                                } else if (index === selectedAnswer) {
                                                    bg = 'rgba(239, 68, 68, 0.2)';
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
                                </div>
                            </>
                        )}

                        {/* Level Complete State */}
                        {gameState === 'levelComplete' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎉</div>
                                <h2 style={{ color: '#22c55e', fontSize: '28px', margin: '0 0 16px 0' }}>
                                    LEVEL {currentLevel} COMPLETE!
                                </h2>
                                <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '24px' }}>
                                    Score: {correctCount}/{QUESTIONS_PER_LEVEL} ({Math.round((correctCount / QUESTIONS_PER_LEVEL) * 100)}%)
                                </div>
                                <div style={{
                                    display: 'inline-block',
                                    padding: '12px 24px',
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: '8px',
                                    color: '#00D4FF',
                                    marginBottom: '24px'
                                }}>
                                    💎 +{currentLevel * 2} Diamonds | Total: {totalDiamondsEarned}
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={continueToNextLevel}
                                        style={{
                                            padding: '16px 32px',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            border: 'none',
                                            borderRadius: '12px',
                                            color: 'white',
                                            fontSize: '16px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Continue to Level {currentLevel + 1}
                                    </button>
                                    <button
                                        onClick={backToLobby}
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
                                        Save & Exit
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Game Over State */}
                        {gameState === 'gameOver' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(15, 23, 42, 0.9))',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '64px', marginBottom: '20px' }}>💀</div>
                                <h2 style={{ color: '#ef4444', fontSize: '28px', margin: '0 0 16px 0' }}>
                                    LEVEL {currentLevel} FAILED
                                </h2>
                                <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '8px' }}>
                                    Score: {correctCount}/{currentQuestionIndex + 1} • Required: {config.minCorrect}/{QUESTIONS_PER_LEVEL}
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '24px' }}>
                                    You needed {config.accuracyRequired}% accuracy to pass
                                </div>
                                {totalDiamondsEarned > 0 && (
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '12px 24px',
                                        background: 'rgba(0, 212, 255, 0.1)',
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        borderRadius: '8px',
                                        color: '#00D4FF',
                                        marginBottom: '24px'
                                    }}>
                                        💎 Diamonds Earned: {totalDiamondsEarned}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                    <button
                                        onClick={() => restartFromLevel(currentLevel)}
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
                                        Retry Level {currentLevel}
                                    </button>
                                    <button
                                        onClick={backToLobby}
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

                        {/* Victory State */}
                        {gameState === 'victory' && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(15, 23, 42, 0.9))',
                                border: '2px solid rgba(234, 179, 8, 0.5)',
                                borderRadius: '16px',
                                padding: '48px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '72px', marginBottom: '20px' }}>🏆</div>
                                <h2 style={{ color: '#eab308', fontSize: '32px', margin: '0 0 16px 0' }}>
                                    SURVIVAL MASTER!
                                </h2>
                                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '18px', marginBottom: '24px' }}>
                                    You completed all 10 levels!
                                </div>
                                <div style={{
                                    display: 'inline-block',
                                    padding: '16px 32px',
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '2px solid rgba(0, 212, 255, 0.4)',
                                    borderRadius: '12px',
                                    color: '#00D4FF',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                    marginBottom: '24px'
                                }}>
                                    💎 Total Earned: {totalDiamondsEarned} Diamonds
                                </div>
                                <div>
                                    <button
                                        onClick={backToLobby}
                                        style={{
                                            padding: '16px 48px',
                                            background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                                            border: 'none',
                                            borderRadius: '12px',
                                            color: 'black',
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Return to Trivia Hub
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
